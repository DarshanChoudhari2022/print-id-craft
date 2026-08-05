import { getFieldRole } from "@/lib/field-resolver"
import { applyFixedBranchToFormData } from "@/lib/fixed-branch"
import { isValidIndianMobile } from "@/lib/indian-mobile"

export { isValidIndianMobile, stripIndianPrefix } from "@/lib/indian-mobile"

export type FormField = {
  key: string
  label: string
  type: string
  required: boolean
  role?: string
}

const ADDRESS_MIN_WORDS = 5

function wordCount(value: string): number {
  return (value || "").trim().split(/\s+/).filter(Boolean).length
}

export function isHiddenFixedBranchField(
  field: FormField,
  fixedBranch?: string
): boolean {
  if (!fixedBranch?.trim()) return false
  return getFieldRole(field.key, field.label, field.role) === "branch"
}

export function validatePublicSubmissionDetails(
  formData: Record<string, unknown>,
  fields: FormField[],
  options?: { fixedBranch?: string }
): { ok: true } | { ok: false; error: string } {
  const fixedBranch = options?.fixedBranch?.trim() || ""
  const fd = applyFixedBranchToFormData(formData, fixedBranch, fields)

  for (const field of fields) {
    if (field.key === "class") continue
    if (isHiddenFixedBranchField(field, fixedBranch)) continue
    const value = (fd[field.key] || "").trim()
    const label = field.label || field.key
    const role = getFieldRole(field.key, field.label, field.role)

    if (field.required && !value) {
      return { ok: false, error: `Please fill in ${label}.` }
    }
    if (!value) continue

    if (role === "address" && field.required && wordCount(value) < ADDRESS_MIN_WORDS) {
      return { ok: false, error: `Please write the full address with at least ${ADDRESS_MIN_WORDS} words.` }
    }
    if (role === "mobile" && !isValidIndianMobile(value)) {
      return { ok: false, error: "Please enter a valid 10-digit Indian mobile number." }
    }
    if (role === "branch" && field.required && value.length < 2) {
      return { ok: false, error: "Please enter the branch name." }
    }
  }

  return { ok: true }
}
