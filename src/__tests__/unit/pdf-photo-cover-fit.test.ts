import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("PDF card photo fit wiring", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/components/BatchGenerator.tsx"),
    "utf8",
  )

  it("keeps cover-fit as the raster renderer behavior", () => {
    expect(source).toMatch(/function drawPhotoForFrame[\s\S]*?drawImageCover\(ctx, img, img\.naturalWidth, img\.naturalHeight, x, y, w, h\)/)
    expect(source).toContain("getCoverPhotoPlacement")
    expect(source).toContain("recolorEdgeConnectedPhotoBackground")
  })

  it("keeps SVG/PDF embedded photos in slice mode so mapped frames are filled", () => {
    expect(source).toContain('preserveAspectRatio = "xMidYMin slice"')
    expect(source).not.toContain('preserveAspectRatio = "xMidYMid meet"')
  })
})
