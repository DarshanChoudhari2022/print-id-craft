import { normalizeKey } from "@/lib/field-resolver"

type WorkspaceField = { key?: string; label?: string }

const COMPANY_FIELD_MARKERS = new Set([
  "company",
  "companyname",
  "employee",
  "employeeid",
  "employeecode",
  "idcode",
  "dateofjoining",
  "officeaddress",
  "corporateaddress",
  "emergencycontactnumber",
])

export function isCompanyWorkspace(
  schoolName: string | null | undefined,
  fields: WorkspaceField[] = [],
  workspaceKind?: string | null,
): boolean {
  const explicitKind = normalizeKey(String(workspaceKind || ""))
  if (explicitKind === "company") return true
  if (explicitKind === "school") return false

  const normalizedName = normalizeKey(String(schoolName || ""))
  if (
    normalizedName.includes("companyidcard") ||
    normalizedName.includes("employeeidcard") ||
    normalizedName.includes("corporateidcard")
  ) {
    return true
  }

  const markers = new Set<string>()
  for (const field of fields) {
    for (const value of [field.key, field.label]) {
      const normalized = normalizeKey(String(value || ""))
      if (COMPANY_FIELD_MARKERS.has(normalized)) markers.add(normalized)
    }
  }
  return markers.size >= 2
}
