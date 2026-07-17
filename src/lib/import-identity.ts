import { createHash } from "crypto"
import { normalizeKey, normalizeFormValue, resolveFieldValue } from "@/lib/field-resolver"

const EMPLOYEE_ID_KEYS = new Set([
  "employeeid",
  "employeecode",
  "empid",
  "empcode",
  "idcode",
  "staffid",
  "staffcode",
  "personnelid",
  "personnelcode",
])

const SCHOOL_ID_KEYS = new Set([
  "admissionno",
  "admissionnumber",
  "grno",
  "grnumber",
  "registrationno",
  "registrationnumber",
  "rollno",
  "rollnumber",
])

const RECORD_SKIP_KEYS = new Set([
  "photourl",
  "photopath",
  "photo",
  "class",
  "classsection",
])

function identityValue(value: unknown): string {
  return normalizeFormValue(String(value ?? ""))
}

function stableRecordFingerprint(formData: Record<string, string>): string {
  const parts = Object.entries(formData)
    .map(([key, value]) => [normalizeKey(key), identityValue(value)] as const)
    .filter(([key, value]) => key && value && !RECORD_SKIP_KEYS.has(key))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
  if (parts.length === 0) return ""
  return createHash("sha256").update(parts.join("|")).digest("hex")
}

/**
 * Stable identities used to make bulk imports idempotent. Strong employee or
 * school identifiers win; record and name-based fallbacks catch unchanged
 * spreadsheets that do not contain a formal ID column.
 */
export function buildImportIdentityKeys(formData: Record<string, string>): string[] {
  const keys: string[] = []
  const employeeIds: string[] = []
  const schoolIds: Array<{ key: string; value: string }> = []

  for (const [key, value] of Object.entries(formData)) {
    const normalizedKey = normalizeKey(key)
    const normalizedValue = identityValue(value)
    if (!normalizedValue) continue
    if (EMPLOYEE_ID_KEYS.has(normalizedKey)) {
      employeeIds.push(normalizedValue)
    } else if (SCHOOL_ID_KEYS.has(normalizedKey)) {
      schoolIds.push({ key: normalizedKey, value: normalizedValue })
    }
  }

  const name = identityValue(resolveFieldValue(formData, "name"))
  const dob = identityValue(resolveFieldValue(formData, "dateofbirth"))
  const mobile = identityValue(resolveFieldValue(formData, "mobile"))
  for (const employeeId of employeeIds) {
    keys.push(name ? `employee:${employeeId}:${name}` : `employee:${employeeId}`)
  }
  for (const schoolId of schoolIds) {
    keys.push(name
      ? `school:${schoolId.key}:${schoolId.value}:${name}`
      : `school:${schoolId.key}:${schoolId.value}`)
  }
  if (name && dob) keys.push(`name-dob:${name}:${dob}`)
  if (name && mobile) keys.push(`name-mobile:${name}:${mobile}`)

  const record = stableRecordFingerprint(formData)
  if (record) keys.push(`record:${record}`)

  return Array.from(new Set(keys))
}
