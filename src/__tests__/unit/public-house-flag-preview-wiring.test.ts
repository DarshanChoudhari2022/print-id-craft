import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8")

describe("public registration house flag preview wiring", () => {
  it("returns uploaded flag image URLs with the public form configuration", () => {
    const source = read("src/app/api/submit/[token]/route.ts")

    expect(source).toContain("flagImages")
    expect(source).toMatch(/flag\.imageUrl/)
  })

  it("resolves and supplies the selected flag to every public JPG preview", () => {
    const source = read("src/app/submit/[token]/page.tsx")
    const previewCount = source.match(/<JpgCardPreview/g)?.length || 0
    const flagPropCount = source.match(/flagImageUrl=\{selectedFlagImageUrl\}/g)?.length || 0

    expect(source).toContain("resolveHouseImageUrl")
    expect(previewCount).toBeGreaterThan(0)
    expect(flagPropCount).toBe(previewCount)
  })
})
