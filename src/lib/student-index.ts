import {
  computeDuplicateFingerprint,
  normalizeFormValue,
  resolveFieldValue,
} from "@/lib/field-resolver"

export type StudentIndexData = {
  duplicateFingerprint: string | null
  fullName: string
  normalizedName: string
  normalizedFatherName: string
  normalizedDob: string
  normalizedRollNo: string
  normalizedSearchText: string
}

function compactSearchParts(parts: string[]) {
  return Array.from(new Set(parts.map(normalizeFormValue).filter(Boolean))).join(" ")
}

function readDirectFormValue(fd: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = fd[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return ""
}

export function normalizeScopedRollNo(
  formData: Record<string, unknown>,
  rollNo: string
): string {
  const normalizedRoll = normalizeFormValue(rollNo)
  if (!normalizedRoll) return ""

  const fd = Object.fromEntries(
    Object.entries(formData || {}).map(([key, value]) => [key, String(value ?? "").trim()])
  ) as Record<string, string>

  const classGrade = normalizeFormValue(readDirectFormValue(fd, ["classGrade", "classgrade"]))
  const division = normalizeFormValue(readDirectFormValue(fd, ["division", "div"]))
  if (!classGrade) return normalizedRoll

  return [classGrade, division, normalizedRoll].filter(Boolean).join("|")
}

export function buildStudentIndexData(
  formData: Record<string, unknown>,
  classId: string
): StudentIndexData {
  const fd = Object.fromEntries(
    Object.entries(formData || {}).map(([key, value]) => [key, String(value ?? "").trim()])
  ) as Record<string, string>

  const fullName = resolveFieldValue(fd, "name")
  const fatherName = resolveFieldValue(fd, "father")
  const dob = resolveFieldValue(fd, "dateofbirth")
  const rollNo = resolveFieldValue(fd, "rollno")
  const phone = resolveFieldValue(fd, "mobile")
  const admissionNo = resolveFieldValue(fd, "admissionno")

  const normalizedName = normalizeFormValue(fullName)
  const normalizedFatherName = normalizeFormValue(fatherName)
  const normalizedDob = normalizeFormValue(dob)
  const normalizedRollNo = normalizeScopedRollNo(fd, rollNo)

  return {
    duplicateFingerprint: computeDuplicateFingerprint(fd, classId) || null,
    fullName,
    normalizedName,
    normalizedFatherName,
    normalizedDob,
    normalizedRollNo,
    normalizedSearchText: compactSearchParts([
      fullName,
      fatherName,
      dob,
      rollNo,
      phone,
      admissionNo,
      ...Object.values(fd).map(String),
    ]),
  }
}
