import fs from "fs"
import { createWriteStream } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import type JSZip from "jszip"
import { isOfflineMode, localUploadFromFile } from "@/lib/local-storage"
import { storageDelete, storageUpload } from "@/lib/storage"
import { EXPORT_ZIP_COMPRESSION_LEVEL } from "./constants"

const CLOUD_UPLOAD_PART_BYTES = 40 * 1024 * 1024
const CLOUD_UPLOAD_CONCURRENCY = 2

function streamZipToFile(zip: JSZip, destination: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(destination)
    zip
      .generateNodeStream({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: EXPORT_ZIP_COMPRESSION_LEVEL },
        streamFiles: true,
      })
      .pipe(output)
      .on("finish", () => resolve())
      .on("error", reject)
  })
}

export async function uploadExportZip(
  bucket: string,
  storagePath: string,
  zip: JSZip,
  jobId: string
): Promise<{
  bytes: number
  storageParts?: Array<{ storagePath: string; bytes: number }>
  error: { message?: string } | null
}> {
  const tempPath = join(tmpdir(), `export-${jobId}.zip`)
  try {
    await streamZipToFile(zip, tempPath)
    const bytes = fs.statSync(tempPath).size

    if (isOfflineMode()) {
      const { error } = await localUploadFromFile(bucket, storagePath, tempPath, { upsert: true })
      return { bytes, error }
    }

    const partCount = Math.max(1, Math.ceil(bytes / CLOUD_UPLOAD_PART_BYTES))
    const storageParts = new Array<{ storagePath: string; bytes: number }>(partCount)
    const uploadedPaths: string[] = []
    const uploadErrors: Array<{ message?: string }> = []
    const file = await fs.promises.open(tempPath, "r")

    try {
      let nextPartIndex = 0
      const uploadWorker = async () => {
        while (uploadErrors.length === 0) {
          const index = nextPartIndex
          nextPartIndex += 1
          if (index >= partCount) return

          const offset = index * CLOUD_UPLOAD_PART_BYTES
          const partBytes = Math.min(CLOUD_UPLOAD_PART_BYTES, bytes - offset)
          const buffer = Buffer.allocUnsafe(partBytes)
          const { bytesRead } = await file.read(buffer, 0, partBytes, offset)
          if (bytesRead !== partBytes) {
            uploadErrors.push({ message: `Could not read export ZIP part ${index + 1}` })
            return
          }

          const partPath = partCount === 1
            ? storagePath
            : `${storagePath}.part-${String(index + 1).padStart(3, "0")}`
          const { error } = await storageUpload(bucket, partPath, buffer, {
            contentType: partCount === 1 ? "application/zip" : "application/octet-stream",
            upsert: true,
          })
          if (error) {
            uploadErrors.push(error)
            return
          }

          uploadedPaths.push(partPath)
          storageParts[index] = { storagePath: partPath, bytes: partBytes }
        }
      }

      await Promise.all(
        Array.from(
          { length: Math.min(CLOUD_UPLOAD_CONCURRENCY, partCount) },
          () => uploadWorker()
        )
      )
    } finally {
      await file.close()
    }

    if (uploadErrors.length > 0) {
      if (uploadedPaths.length > 0) await storageDelete(bucket, uploadedPaths)
      return { bytes, error: uploadErrors[0] }
    }

    return {
      bytes,
      storageParts: partCount > 1 ? storageParts : undefined,
      error: null,
    }
  } catch (error) {
    return {
      bytes: 0,
      error: { message: error instanceof Error ? error.message : String(error) },
    }
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
  }
}
