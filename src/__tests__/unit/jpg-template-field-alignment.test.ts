import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const mapper = readFileSync("src/components/JpgTemplateMapper.tsx", "utf8")
const dialogs = readFileSync("src/components/IDMakerDialogs.tsx", "utf8")
const preview = readFileSync("src/components/JpgCardPreview.tsx", "utf8")
const batchGenerator = readFileSync("src/components/BatchGenerator.tsx", "utf8")

describe("jpg template field alignment shortcuts", () => {
  it("offers selected-field center controls in the properties panel", () => {
    expect(mapper).toContain("Field Alignment")
    expect(mapper).toContain("Center on Card")
    expect(mapper).toContain("Full Width + Center")
    expect(mapper).toContain("centerFieldOnCard")
    expect(mapper).toContain("fullWidthCenterField")
  })

  it("centers boxes and full-width centered text through context menu actions", () => {
    expect(dialogs).toContain('"centerField"')
    expect(dialogs).toContain('"fullWidthCenter"')
    expect(dialogs).toContain("Center Field on Card")
    expect(dialogs).toContain("Full Width + Center Text")
    expect(mapper).toContain('action === "centerField"')
    expect(mapper).toContain('action === "alignments" || action === "fullWidthCenter"')
  })

  it("uses the shared identity alignment rule in every card output", () => {
    expect(mapper).toContain("getCardTextLayout(")
    expect(preview.match(/getCardTextLayout\(/g)).toHaveLength(2)
    expect(batchGenerator.match(/getCardTextLayout\(/g)).toHaveLength(2)
  })
})
