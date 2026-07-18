import { normalizeKey } from "@/lib/field-resolver"

type TemplateField = {
  key?: string
  fieldKey?: string
  label?: string
  useFixedValue?: boolean
  fixedValue?: string
}

export function getFixedTemplateValue(
  field: TemplateField | null | undefined,
): string | undefined {
  if (!field?.useFixedValue) return undefined
  return String(field.fixedValue ?? "").trim()
}

export function applyFixedTemplateValuesToFormData(
  formData: Record<string, unknown>,
  fields: TemplateField[] = [],
): Record<string, unknown> {
  const next = { ...formData }
  for (const field of fields) {
    const key = String(field.fieldKey || field.key || "").trim()
    const value = getFixedTemplateValue(field)
    if (key && value !== undefined) next[key] = value
  }
  return next
}

export function getFixedTemplateFieldKeys(
  fields: TemplateField[] = [],
): Set<string> {
  return new Set(
    fields
      .filter(field => field.useFixedValue)
      .map(field => normalizeKey(String(field.fieldKey || field.key || "")))
      .filter(Boolean),
  )
}
