import { ensureBucket, storagePublicUrl, storageUpload } from "@/lib/storage"

const PHOTO_BUCKET = "student-photos"
const MAX_ROW_PHOTO_BYTES = 8 * 1024 * 1024

export function extractGoogleDriveFileId(url: string): string {
  const text = String(url || "").trim()
  if (!text) return ""
  const openMatch = text.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (openMatch?.[1]) return openMatch[1]
  const fileMatch = text.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)
  if (fileMatch?.[1]) return fileMatch[1]
  return ""
}

export function rowPhotoDownloadUrl(url: string): string {
  const fileId = extractGoogleDriveFileId(url)
  if (fileId) return `https://drive.google.com/uc?export=download&id=${fileId}`
  return String(url || "").trim()
}

function contentTypeExtension(contentType: string): string {
  if (contentType.includes("png")) return "png"
  if (contentType.includes("webp")) return "webp"
  return "jpg"
}

function isImageResponse(contentType: string, bytes: Buffer): boolean {
  if (contentType.startsWith("image/")) return true
  return (
    bytes.length > 4 &&
    ((bytes[0] === 0xff && bytes[1] === 0xd8) ||
      (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) ||
      bytes.subarray(0, 4).toString("ascii") === "RIFF")
  )
}

export async function uploadPhotoFromRowLink(options: {
  schoolId: string
  studentId: string
  photoUrl: string
}): Promise<{ photoUrl: string; photoPath: string }> {
  const downloadUrl = rowPhotoDownloadUrl(options.photoUrl)
  if (!downloadUrl) throw new Error("Missing row photo URL")

  let contentType = "image/jpeg"
  let bytes: Buffer | null = null
  let lastError = ""
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(downloadUrl, { redirect: "follow" })
    if (!response.ok) {
      lastError = `Photo download failed (${response.status})`
    } else {
      contentType = response.headers.get("content-type") || "image/jpeg"
      const downloaded = Buffer.from(await response.arrayBuffer())
      if (downloaded.length === 0) {
        lastError = "Photo download returned an empty file"
      } else if (downloaded.length > MAX_ROW_PHOTO_BYTES) {
        lastError = "Photo file is too large"
      } else if (!isImageResponse(contentType, downloaded)) {
        lastError = "Photo URL did not return an image"
      } else {
        bytes = downloaded
        break
      }
    }
    if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 500))
  }
  if (!bytes) throw new Error(lastError || "Photo download failed")

  await ensureBucket(PHOTO_BUCKET)
  const ext = contentTypeExtension(contentType)
  const photoPath = `students/${options.schoolId}/originals/${options.studentId}.${ext}`
  const { error } = await storageUpload(PHOTO_BUCKET, photoPath, bytes, {
    contentType: contentType.startsWith("image/") ? contentType : "image/jpeg",
    upsert: true,
  })
  if (error) throw new Error(error.message || String(error))

  return {
    photoUrl: storagePublicUrl(PHOTO_BUCKET, photoPath),
    photoPath,
  }
}
