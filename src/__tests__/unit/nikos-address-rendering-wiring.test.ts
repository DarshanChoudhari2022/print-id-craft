import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const previewSource = readFileSync("src/components/JpgCardPreview.tsx", "utf8")
const schoolPageSource = readFileSync("src/app/(manufacturer)/schools/[id]/page.tsx", "utf8")
const batchSource = readFileSync("src/components/BatchGenerator.tsx", "utf8")

describe("Nikos address rendering wiring", () => {
  it("formats resolved JPG preview values with the supplied school name", () => {
    expect(previewSource).toContain("formatSchoolCardFieldValue")
    expect(previewSource).toMatch(/schoolName\?: string/)
    expect(previewSource).toMatch(/formatSchoolCardFieldValue\(schoolName, field\.fieldKey, value\)/)
  })

  it("supplies the manufacturer school's name to both card previews", () => {
    const suppliedNames = schoolPageSource.match(/schoolName=\{school\.name\}/g) || []
    expect(suppliedNames.length).toBeGreaterThanOrEqual(2)
  })

  it("formats both raster and SVG batch values using the batch school name", () => {
    expect(batchSource).toContain("formatSchoolCardFieldValue")
    const formattedValues = batchSource.match(
      /formatSchoolCardFieldValue\(\s*schoolName,\s*field\.fieldKey,/g,
    ) || []
    expect(formattedValues.length).toBeGreaterThanOrEqual(2)
  })
})
