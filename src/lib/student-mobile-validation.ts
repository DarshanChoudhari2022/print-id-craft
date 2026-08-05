import { getFieldRole } from "@/lib/field-resolver"
import { isValidIndianMobile } from "@/lib/indian-mobile"

export type MobileFieldConfig = {
  key: string
  label?: string
  role?: string
  required?: boolean
}

export type InvalidMobileField = {
  key: string
  label: string
  value: string
  reason: "missing" | "invalid"
}

/**
 * Audit configured mobile fields before card generation. This is deliberately
 * separate from form submission so imports, edits, and legacy records cannot
 * bypass the final print-safety check.
 */
export function findInvalidMobileFields(
  formData: Record<string, unknown>,
  fields: MobileFieldConfig[],
): InvalidMobileField[] {
  const issues: InvalidMobileField[] = []
  const seen = new Set<string>()

  for (const field of fields || []) {
    if (!field?.key || seen.has(field.key)) continue
    if (getFieldRole(field.key, field.label || "", field.role) !== "mobile") continue
    seen.add(field.key)

    const value = String(formData?.[field.key] ?? "").trim()
    if (!value) {
      if (field.required) {
        issues.push({
          key: field.key,
          label: field.label || field.key,
          value: "",
          reason: "missing",
        })
      }
      continue
    }

    if (!isValidIndianMobile(value)) {
      issues.push({
        key: field.key,
        label: field.label || field.key,
        value,
        reason: "invalid",
      })
    }
  }

  return issues
}

export function effectiveMobileFieldConfig(
  assignedFields: unknown,
  defaultFields: unknown,
): MobileFieldConfig[] {
  const assigned = Array.isArray(assignedFields) ? assignedFields : []
  if (assigned.length > 0) return assigned as MobileFieldConfig[]
  return (Array.isArray(defaultFields) ? defaultFields : []) as MobileFieldConfig[]
}
