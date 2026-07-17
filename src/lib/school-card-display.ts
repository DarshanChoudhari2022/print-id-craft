import { getFieldRole, isPrefixedAddressField } from "@/lib/field-resolver"

const NIKOS_PUBLIC_SCHOOL = "nikos public school"

export function formatSchoolCardFieldValue(
  schoolName: string | undefined,
  fieldKey: string,
  value: string,
): string {
  const isNikos = schoolName?.trim().toLowerCase() === NIKOS_PUBLIC_SCHOOL
  const isAddress = getFieldRole(fieldKey) === "address" || isPrefixedAddressField(fieldKey)
  if (!isNikos || !isAddress) return value
  return value.replace(/,\s*/g, ", ")
}
