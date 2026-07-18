import { getFieldRole, isPrefixedAddressField } from "@/lib/field-resolver"

export type StudentFieldDescriptor = {
  key: string
  label?: string
  role?: string
}

/**
 * Convert a person's name to consistent title case.
 *
 * The value is deliberately not trimmed and whitespace is not collapsed:
 * normalization must not remove any user-entered data. Unicode letters,
 * apostrophes, and hyphens are supported.
 */
export function normalizePersonName(value: string): string {
  const lowercase = String(value ?? "").toLocaleLowerCase()
  return lowercase.replace(
    /(^|[^\p{L}\p{N}])(\p{L})/gu,
    (_match, prefix: string, letter: string) => `${prefix}${letter.toLocaleUpperCase()}`,
  )
}

/**
 * Preserve an address verbatim except for the two requested corrections:
 * capitalize its first alphabetic character and enforce one space after commas.
 */
export function normalizeAddress(value: string): string {
  const commaSpaced = String(value ?? "").replace(/,\s*/g, ", ")
  return commaSpaced.replace(/\p{L}/u, letter => letter.toLocaleUpperCase())
}

export function normalizeStudentFieldValue(
  key: string,
  value: string,
  label = "",
  explicitRole?: string,
): string {
  const role = getFieldRole(key, label, explicitRole)
  if (role === "name" || role === "father" || role === "mother") {
    return normalizePersonName(value)
  }
  if (role === "address" || isPrefixedAddressField(key)) {
    return normalizeAddress(value)
  }
  return value
}

/**
 * Return a new object so callers never mutate request bodies or existing
 * Prisma JSON values in place.
 */
export function normalizeStudentFormData(
  formData: Record<string, unknown>,
  fields: StudentFieldDescriptor[] = [],
): Record<string, unknown> {
  const descriptors = new Map(fields.map(field => [field.key, field]))
  return Object.fromEntries(
    Object.entries(formData || {}).map(([key, rawValue]) => {
      if (typeof rawValue !== "string") return [key, rawValue]
      const field = descriptors.get(key)
      return [
        key,
        normalizeStudentFieldValue(key, rawValue, field?.label || "", field?.role),
      ]
    }),
  )
}

export function normalizeStudentStringFormData(
  formData: Record<string, string>,
  fields: StudentFieldDescriptor[] = [],
): Record<string, string> {
  return normalizeStudentFormData(formData, fields) as Record<string, string>
}
