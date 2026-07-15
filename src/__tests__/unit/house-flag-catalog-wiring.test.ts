import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8")

describe("house flag catalogue wiring", () => {
  it.each([
    "src/app/api/schools/[id]/flags/route.ts",
    "src/app/api/submit/[token]/route.ts",
    "src/app/api/submit/school/[token]/route.ts",
  ])("uses the shared school catalogue in %s", file => {
    expect(read(file)).toContain("getSchoolFlagCatalog")
  })

  it("detects back-side placeholders in the per-class public endpoint", () => {
    const source = read("src/app/api/submit/[token]/route.ts")
    expect(source).toMatch(/hasFlagMapping[\s\S]*backFieldMappings/)
  })
})
