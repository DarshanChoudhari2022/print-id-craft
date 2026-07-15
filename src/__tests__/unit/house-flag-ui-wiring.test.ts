import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8")

describe("house flag UI and rendering wiring", () => {
  it("uses the shared resolver in batch generation", () => {
    expect(read("src/components/BatchGenerator.tsx")).toContain("resolveHouseImageUrl")
  })

  it("detects flags across fallback and assigned student templates", () => {
    const source = read("src/components/BatchGenerator.tsx")
    expect(source).toContain(
      "generationUsesHouseFlags(fieldMappings, backFieldMappings || [], students)",
    )
    expect(source).not.toContain("if (!hasFlagField) return undefined")
  })

  it("uses the shared resolver in manufacturer preview", () => {
    expect(read("src/app/(manufacturer)/schools/[id]/page.tsx")).toContain("resolveHouseImageUrl")
  })

  it("provides an explicit Add House control", () => {
    const source = read("src/app/(manufacturer)/schools/[id]/page.tsx")
    expect(source).toContain("Add House")
    expect(source).toContain("newHouseName")
    expect(source).toContain("newHouseFile")
  })
})
