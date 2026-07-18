import { normalizeStudentFieldValue } from "@/lib/student-text-normalization"

export function formatSchoolCardFieldValue(
  _schoolName: string | undefined,
  fieldKey: string,
  value: string,
): string {
  return normalizeStudentFieldValue(fieldKey, value)
}
