import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("generation filter API wiring", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/app/api/schools/[id]/generate/route.ts"),
    "utf8",
  )

  it("serves read-only class and division options inside the existing school scope", () => {
    expect(source).toContain("buildGenerationFilterOptions")
    expect(source).toContain('const mode = searchParams.get("mode")')
    expect(source).toContain('if (mode === "filters")')
    expect(source).toContain("buildGenerationFilterOptions(optionStudents)")
  })

  it("filters returned students before empty handling and render mapping", () => {
    expect(source).toContain('const classGrade = searchParams.get("classGrade")?.trim() || ""')
    expect(source).toContain('const division = searchParams.get("division")?.trim() || ""')
    expect(source).toContain(
      "const scopedStudents = filterStudentsByGenerationScope(students, classGrade, division)",
    )
    expect(source.indexOf("if (scopedStudents.length === 0)")).toBeGreaterThan(-1)
    expect(source.indexOf("scopedStudents.map")).toBeGreaterThan(-1)
    expect(source.indexOf("if (scopedStudents.length === 0)")).toBeLessThan(source.indexOf("scopedStudents.map"))
  })
})
