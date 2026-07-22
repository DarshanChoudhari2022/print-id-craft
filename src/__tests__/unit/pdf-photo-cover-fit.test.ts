import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("PDF card photo fit wiring", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/components/BatchGenerator.tsx"),
    "utf8",
  )

  it("keeps contain-fit as the raster renderer behavior", () => {
    expect(source).toMatch(/function drawPhotoForFrame[\s\S]*?drawImageContain\(ctx, img, x, y, w, h\)/)
  })

  it("keeps SVG/PDF embedded photos in meet mode instead of slice mode", () => {
    expect(source).toContain('preserveAspectRatio="xMidYMid meet"')
    expect(source).not.toContain("xMidYMid slice")
    expect(source).not.toContain("xMidYMin slice")
  })
})
