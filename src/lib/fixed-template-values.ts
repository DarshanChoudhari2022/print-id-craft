import { normalizeKey } from "@/lib/field-resolver"

type TemplateField = {
  key?: string
  fieldKey?: string
  label?: string
}

const OFFICE_NUMBER_MARKERS = new Set([
  "officeno",
  "officenumber",
  "officecontact",
  "officecontactno",
  "officecontactnumber",
  "officephone",
  "officephoneno",
  "officephonenumber",
  "companyofficeno",
  "companyofficenumber",
])

export function isOfficeNumberField(
  fieldKey: string | null | undefined,
  label?: string | null,
): boolean {
  return [fieldKey, label].some(value => OFFICE_NUMBER_MARKERS.has(normalizeKey(String(value || ""))))
}

export function fixedOfficeNumberForField(
  fixedOfficeNo: string | null | undefined,
  fieldKey: string | null | undefined,
  label?: string | null,
): string {
  const value = String(fixedOfficeNo || "").trim()
  return value && isOfficeNumberField(fieldKey, label) ? value : ""
}

export function applyFixedOfficeNumberToFormData(
  formData: Record<string, unknown>,
  fixedOfficeNo: string | null | undefined,
  fields: TemplateField[] = [],
): Record<string, unknown> {
  const value = String(fixedOfficeNo || "").trim()
  if (!value) return { ...formData }

  const next = { ...formData }
  next.officeNo = value
  for (const field of fields) {
    const key = String(field.fieldKey || field.key || "").trim()
    if (key && isOfficeNumberField(key, field.label)) next[key] = value
  }
  return next
}
