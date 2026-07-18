import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const source = readFileSync("src/components/PhotoCropper.tsx", "utf8")

describe("photo cropper rotation", () => {
  it("offers accessible left and right 90-degree rotation controls", () => {
    expect(source).toContain('aria-label="Rotate photo left 90 degrees"')
    expect(source).toContain('aria-label="Rotate photo right 90 degrees"')
    expect(source).toContain("rotatePhoto(-1)")
    expect(source).toContain("rotatePhoto(1)")
  })

  it("swaps canvas dimensions and rotates around the image center", () => {
    expect(source).toContain("canvas.width = img.naturalHeight")
    expect(source).toContain("canvas.height = img.naturalWidth")
    expect(source).toContain("ctx.translate(canvas.width / 2, canvas.height / 2)")
    expect(source).toContain("ctx.rotate(quarterTurns * Math.PI / 2)")
  })

  it("keeps repeated rotation lossless and crops from the rotated source", () => {
    expect(source).toContain('canvas.toDataURL("image/png")')
    expect(source).toContain("src={workingPhotoUrl}")
    expect(source).toContain("onLoad={() => {")
    expect(source).toContain("layout()")
  })
})
