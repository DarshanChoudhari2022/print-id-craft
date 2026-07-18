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
    serialNumber: "EIC-0001",
    status: "SUBMITTED",
    class: { name: "MithaNagar" },
    teacherComment: null,
    flagNote: null,
    formData: { classgrade: "Nursery", Division: "A", fullName: "Asha Pawar", mobile: "9000000001" },
  },
  {
    id: "s2",
    serialNumber: "EIC-0002",
    status: "APPROVED",
    class: { name: "MithaNagar" },
    teacherComment: "Photo checked",
    flagNote: null,
    formData: { Class: "Nursery", division: "B", fullName: "Bhaskar Labde", mobile: "9000000002" },
  },
  {
    id: "s3",
    serialNumber: "EIC-0003",
    status: "FLAGGED",
    class: { name: "Nalasopara" },
    teacherComment: null,
    flagNote: "Name mismatch",
    formData: { ClassGrade: "I", div: "A", fullName: "Chitra Patil", mobile: "9000000003" },
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
      search: "",
    })

    expect(filtered).toHaveLength(students.length)
  })

  it("searches serial, comments, and submitted form fields", () => {
    expect(filterTeacherStudents(students, { search: "eic-0002" }).map((student) => student.id)).toEqual(["s2"])
    expect(filterTeacherStudents(students, { search: "name mismatch" }).map((student) => student.id)).toEqual(["s3"])
    expect(filterTeacherStudents(students, { search: "asha" }).map((student) => student.id)).toEqual(["s1"])
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
