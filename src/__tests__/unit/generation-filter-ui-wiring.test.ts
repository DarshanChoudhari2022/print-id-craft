import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("generation filter UI wiring", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/components/BatchGenerator.tsx"),
    "utf8",
  )

  it("loads cascading options for the selected section and status", () => {
    expect(source).toContain('const [selectedClassGrade, setSelectedClassGrade] = useState("")')
    expect(source).toContain('const [selectedDivision, setSelectedDivision] = useState("")')
    expect(source).toContain('params.set("mode", "filters")')
    expect(source).toContain("reconcileGenerationScopeSelection")
  })

  it("renders school filters but switches to company employee terminology", () => {
    expect(source).toContain('{companyMode ? "Department" : "Section"}')
    expect(source).toContain('{companyMode ? "All Departments" : "All Sections"}')
    expect(source).toContain('{companyMode ? "Employee Status" : "Student Status"}')
    expect(source).toContain("!companyMode && <div")
    expect(source).toMatch(/>\s*Class\/Grade\s*</)
    expect(source).toMatch(/>\s*Division\s*</)
    expect(source).toContain("All Sections")
    expect(source).toContain("All Classes")
    expect(source).toContain("All Divisions")
  })

  it("sends class and division filters to generation", () => {
    expect(source).toContain('if (selectedClassGrade) params.set("classGrade", selectedClassGrade)')
    expect(source).toContain('if (selectedDivision) params.set("division", selectedDivision)')
  })

  it("uses the selected scope in generated output names", () => {
    expect(source).toContain("buildGenerationScopeName")
    expect(source).toContain("const generationScopeName = buildGenerationScopeName(")
    expect(source).toContain("schoolName: generationScopeName")
    expect(source).toContain("`${generationScopeName}-IDCards.zip`")
    expect(source).toContain("`${generationScopeName}-IDCards-CDR.zip`")
    expect(source).toContain("`${generationScopeName}-IDCards-BMP-Pages.zip`")
  })
})
