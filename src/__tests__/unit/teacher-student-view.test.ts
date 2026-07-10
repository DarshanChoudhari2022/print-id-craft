import { describe, expect, it } from "vitest"
import {
  applyStatusToStudents,
  filterTeacherStudents,
  getStudentDivision,
  getStudentGrade,
  statusStatsAfterChange,
} from "@/lib/teacher-student-view"

const students = [
  {
    id: "s1",
    status: "SUBMITTED",
    class: { name: "MithaNagar" },
    formData: { classgrade: "Nursery", Division: "A" },
  },
  {
    id: "s2",
    status: "APPROVED",
    class: { name: "MithaNagar" },
    formData: { Class: "Nursery", division: "B" },
  },
  {
    id: "s3",
    status: "FLAGGED",
    class: { name: "Nalasopara" },
    formData: { ClassGrade: "I", div: "A" },
  },
]

describe("teacher student view helpers", () => {
  it("reads class and division from common school form field names", () => {
    expect(getStudentGrade(students[0])).toBe("Nursery")
    expect(getStudentGrade(students[2])).toBe("I")
    expect(getStudentDivision(students[0])).toBe("A")
    expect(getStudentDivision(students[2])).toBe("A")
  })

  it("filters by section, class, division, and status", () => {
    const filtered = filterTeacherStudents(students, {
      section: "MithaNagar",
      grade: "Nursery",
      division: "B",
      status: "APPROVED",
    })

    expect(filtered.map((student) => student.id)).toEqual(["s2"])
  })

  it("keeps every submitted record visible when filters are clear", () => {
    const filtered = filterTeacherStudents(students, {
      section: "",
      grade: "",
      division: "",
      status: "",
    })

    expect(filtered).toHaveLength(students.length)
  })

  it("updates one student and keeps status counters correct without a full refetch", () => {
    const updated = applyStatusToStudents(students, "s1", "APPROVED")
    const stats = statusStatsAfterChange(
      { total: 3, submitted: 1, approved: 1, flagged: 1, pending: 0, printed: 0 },
      "SUBMITTED",
      "APPROVED",
    )

    expect(updated.find((student) => student.id === "s1")?.status).toBe("APPROVED")
    expect(stats).toMatchObject({ submitted: 0, approved: 2, flagged: 1 })
  })
})
