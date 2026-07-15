import { describe, expect, it } from "vitest"
import {
  buildGenerationFilterOptions,
  buildGenerationScopeName,
  filterStudentsByGenerationScope,
  getGenerationStudentScope,
} from "@/lib/generation-scope"

describe("generation scope utilities", () => {
  it("extracts canonical and legacy class/division values", () => {
    expect(getGenerationStudentScope({ classGrade: "III", division: "a" })).toEqual({
      classGrade: "III",
      division: "A",
    })
    expect(getGenerationStudentScope({ class: "IV - b" })).toEqual({
      classGrade: "IV",
      division: "B",
    })
  })

  it("builds naturally sorted distinct options with dependent division counts", () => {
    const options = buildGenerationFilterOptions([
      { formData: { classGrade: "X", division: "B" } },
      { formData: { classGrade: "III", division: "A" } },
      { formData: { classGrade: "iii", division: "a" } },
      { formData: { classGrade: "III", division: "C" } },
    ])

    expect(options).toEqual({
      classes: [
        { value: "III", count: 3 },
        { value: "X", count: 1 },
      ],
      divisionsByClass: {
        III: [
          { value: "A", count: 2 },
          { value: "C", count: 1 },
        ],
        X: [{ value: "B", count: 1 }],
      },
    })
  })

  it("filters by class and division using case-insensitive exact matches", () => {
    const students = [
      { id: "one", formData: { classGrade: "III", division: "A" } },
      { id: "two", formData: { classGrade: "III", division: "B" } },
      { id: "three", formData: { classGrade: "XIII", division: "A" } },
    ]

    expect(filterStudentsByGenerationScope(students, "iii", "a").map(s => s.id)).toEqual(["one"])
    expect(filterStudentsByGenerationScope(students, "III", "").map(s => s.id)).toEqual(["one", "two"])
    expect(filterStudentsByGenerationScope(students)).toEqual(students)
  })

  it("builds a scoped filename label without duplicating the school-wide section", () => {
    expect(buildGenerationScopeName("Nikos Public School", "Nikos Public School", "III", "A"))
      .toBe("Nikos Public School-III-A")
    expect(buildGenerationScopeName("Wise School", "Primary", "IV", "B"))
      .toBe("Wise School-Primary-IV-B")
  })
})
