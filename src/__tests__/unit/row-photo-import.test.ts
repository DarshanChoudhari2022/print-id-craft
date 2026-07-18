import { describe, expect, it } from "vitest"
import { extractGoogleDriveFileId, rowPhotoDownloadUrl } from "@/lib/row-photo-import"

describe("row photo import", () => {
  it("converts Google Drive photo links into direct download URLs", () => {
    expect(extractGoogleDriveFileId("https://drive.google.com/open?id=abc_123-XYZ")).toBe("abc_123-XYZ")
    expect(extractGoogleDriveFileId("https://drive.google.com/file/d/abc_123-XYZ/view")).toBe("abc_123-XYZ")
    expect(rowPhotoDownloadUrl("https://drive.google.com/open?id=abc_123-XYZ")).toBe(
      "https://drive.google.com/uc?export=download&id=abc_123-XYZ",
    )
  })

  it("keeps non-Drive URLs unchanged", () => {
    expect(rowPhotoDownloadUrl("https://example.com/photo.jpg")).toBe("https://example.com/photo.jpg")
  })
})
