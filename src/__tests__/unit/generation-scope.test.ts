import { describe, expect, it } from "vitest"
import {
  buildGenerationFilterOptions,
  buildGenerationScopeName,
  filterStudentsByGenerationScope,
  getGenerationStudentScope,
  reconcileGenerationScopeSelection,
  sortStudentsForGeneration,
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

  it("sorts generation students class-wise, then division-wise, then roll-wise", () => {
    const students = [
      { id: "ukg-2", serialNumber: "S-4", formData: { classGrade: "UKG", rollno: "2" } },
      { id: "i-b-1", serialNumber: "S-5", formData: { classGrade: "I", division: "B", rollno: "1" } },
      { id: "lkg-1", serialNumber: "S-2", formData: { classGrade: "LKG", rollno: "1" } },
      { id: "nursery-7", serialNumber: "S-1", formData: { classGrade: "Nursery", rollno: "7" } },
      { id: "i-a-10", serialNumber: "S-7", formData: { classGrade: "I", division: "A", rollno: "10" } },
      { id: "i-a-2", serialNumber: "S-6", formData: { classGrade: "I", division: "A", rollno: "2" } },
      { id: "x-1", serialNumber: "S-8", formData: { classGrade: "X", rollno: "1" } },
    ]

    expect(sortStudentsForGeneration(students).map(s => s.id)).toEqual([
      "nursery-7",
      "lkg-1",
      "ukg-2",
      "i-a-2",
      "i-a-10",
      "i-b-1",
      "x-1",
    ])
  })

  it("preserves a selected class and division when refreshed options still contain them", () => {
    const options = {
      classes: [{ value: "VIII", count: 42 }],
      divisionsByClass: {
        VIII: [{ value: "B", count: 20 }],
      },
    }

    expect(reconcileGenerationScopeSelection(options, "viii", "b")).toEqual({
      classGrade: "VIII",
      division: "B",
    })
  })

  it("clears only scope values that are unavailable after refresh", () => {
    const options = {
      classes: [{ value: "VIII", count: 42 }],
      divisionsByClass: {
        VIII: [{ value: "A", count: 22 }],
      },
    }

    expect(reconcileGenerationScopeSelection(options, "VIII", "B")).toEqual({
      classGrade: "VIII",
      division: "",
    })
    expect(reconcileGenerationScopeSelection(options, "IX", "A")).toEqual({
      classGrade: "",
      division: "",
    })
  })

  it("builds a scoped filename label without duplicating the school-wide section", () => {
    expect(buildGenerationScopeName("Nikos Public School", "Nikos Public School", "III", "A"))
      .toBe("Nikos Public School-III-A")
    expect(buildGenerationScopeName("Wise School", "Primary", "IV", "B"))
      .toBe("Wise School-Primary-IV-B")
  })
})
