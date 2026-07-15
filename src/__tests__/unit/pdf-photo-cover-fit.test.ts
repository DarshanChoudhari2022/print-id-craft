import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("PDF card photo fit wiring", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/components/BatchGenerator.tsx"),
    "utf8",
  )

  it("keeps contain as the raster renderer default", () => {
    expect(source).toMatch(/photoFit:\s*PhotoFit\s*=\s*"contain"/)
  })

  it("requests cover-fit from the PDF print path", () => {
    expect(source).toMatch(
      /if \(outputFormat === "PDF_PRINT"\)[\s\S]*?studentTemplate\.cardHeightMm,\s*"cover",\s*\)/,
    )
  })
})
