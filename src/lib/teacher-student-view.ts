type StudentLike = {
  id: string
  status: string
  class?: { name?: string | null } | null
  formData?: Record<string, unknown> | null
}

type TeacherStudentFilters = {
  section?: string
  grade?: string
  division?: string
  status?: string
}

type TeacherStats = {
  total: number
  submitted: number
  approved: number
  flagged: number
  pending: number
  printed: number
}

const GRADE_KEYS = ["classgrade", "classGrade", "ClassGrade", "class", "Class", "grade", "Grade"]
const DIVISION_KEYS = ["division", "Division", "div", "Div", "DIV", "section", "Section"]

function readFormField(student: Pick<StudentLike, "formData">, keys: string[]): string {
  const formData = student.formData || {}
  for (const key of keys) {
    const value = formData[key]
    if (value === null || value === undefined) continue
    const text = String(value).trim()
    if (text) return text
  }
  return ""
}

export function getStudentGrade(student: Pick<StudentLike, "formData">): string {
  return readFormField(student, GRADE_KEYS)
}

export function getStudentDivision(student: Pick<StudentLike, "formData">): string {
  return readFormField(student, DIVISION_KEYS)
}

export function filterTeacherStudents<T extends StudentLike>(
  students: T[] | undefined,
  filters: TeacherStudentFilters,
): T[] {
  return (students || []).filter((student) => {
    if (filters.section && student.class?.name !== filters.section) return false
    if (filters.status && student.status !== filters.status) return false
    if (filters.grade && getStudentGrade(student) !== filters.grade) return false
    if (filters.division && getStudentDivision(student) !== filters.division) return false
    return true
  })
}

export function applyStatusToStudents<T extends StudentLike>(
  students: T[],
  studentId: string,
  status: string,
): T[] {
  return students.map((student) => (
    student.id === studentId ? { ...student, status } : student
  ))
}

function statusKey(status: string): Exclude<keyof TeacherStats, "total"> | null {
  switch (status) {
    case "SUBMITTED": return "submitted"
    case "APPROVED": return "approved"
    case "FLAGGED": return "flagged"
    case "PENDING": return "pending"
    case "PRINTED": return "printed"
    default: return null
  }
}

export function statusStatsAfterChange(
  stats: TeacherStats,
  previousStatus: string,
  nextStatus: string,
): TeacherStats {
  if (previousStatus === nextStatus) return stats
  const next = { ...stats }
  const previousKey = statusKey(previousStatus)
  const nextKey = statusKey(nextStatus)
  if (previousKey) next[previousKey] = Math.max(0, next[previousKey] - 1)
  if (nextKey) next[nextKey] += 1
  return next
}
