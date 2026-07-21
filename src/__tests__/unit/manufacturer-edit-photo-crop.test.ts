import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const source = readFileSync("src/app/(manufacturer)/schools/[id]/page.tsx", "utf8")

describe("manufacturer edit photo crop", () => {
  it("offers crop from the edit employee photo preview", () => {
    expect(source).toContain("cropEditPhotoPreview")
    expect(source).toContain("Crop Photo")
    expect(source).toContain('return { url: editPhotoPreview, target: "edit" }')
  })

  it("saves cropped edit photos as a new upload file", () => {
    expect(source).toContain("setEditPhotoPreview(croppedDataUrl)")
    expect(source).toContain("setEditPhotoFile(file)")
    expect(source).toContain('toast.success(`Photo cropped')
  })
})
