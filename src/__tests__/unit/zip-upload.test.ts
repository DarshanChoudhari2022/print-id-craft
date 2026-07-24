import { afterEach, describe, expect, it, vi } from "vitest"
import JSZip from "jszip"

vi.mock("@/lib/local-storage", () => ({
  isOfflineMode: vi.fn(() => false),
  localUploadFromFile: vi.fn(),
}))

vi.mock("@/lib/storage", () => ({
  storageUpload: vi.fn(async () => ({ data: { path: "uploaded" }, error: null })),
  storageDelete: vi.fn(async () => ({ error: null })),
}))

import { storageUpload } from "@/lib/storage"
import { uploadExportZip } from "@/lib/export/zip-upload"

describe("uploadExportZip", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("stores a large ZIP in independently uploadable parts", async () => {
    const zip = new JSZip()
    zip.file("large.bin", Buffer.alloc(41 * 1024 * 1024, 7), {
      binary: true,
      compression: "STORE",
    })

    const result = await uploadExportZip(
      "student-photos",
      "exports/school/job/export.zip",
      zip,
      "large-export-test"
    )

    expect(result.error).toBeNull()
    expect(result.storageParts).toHaveLength(2)
    expect(result.storageParts?.reduce((sum, part) => sum + part.bytes, 0)).toBe(result.bytes)
    expect(storageUpload).toHaveBeenCalledTimes(2)
    expect(storageUpload).toHaveBeenCalledWith(
      "student-photos",
      "exports/school/job/export.zip.part-001",
      expect.any(Buffer),
      expect.objectContaining({ contentType: "application/octet-stream" })
    )
  })
})
