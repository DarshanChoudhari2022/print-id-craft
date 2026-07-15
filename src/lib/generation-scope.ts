import {
  resolveClassDisplayValue,
  resolveDivisionDisplayValue,
} from "@/lib/section-class"

export type GenerationScopeOption = {
  value: string
  count: number
}

export type GenerationFilterOptions = {
  classes: GenerationScopeOption[]
  divisionsByClass: Record<string, GenerationScopeOption[]>
}

type StudentWithFormData = {
  formData: unknown
}

const normalizeScopeValue = (value: string) =>
  String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "")

const naturalSort = <T extends GenerationScopeOption>(a: T, b: T) =>
  a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: "base" })

export function getGenerationStudentScope(formData: unknown): {
  classGrade: string
  division: string
} {
  const fd = (formData || {}) as Record<string, string>
  return {
    classGrade: resolveClassDisplayValue(fd, true).trim(),
    division: resolveDivisionDisplayValue(fd, true).trim().toUpperCase(),
  }
}

export function buildGenerationFilterOptions(
  students: StudentWithFormData[],
): GenerationFilterOptions {
  const classEntries = new Map<string, {
    value: string
    count: number
    divisions: Map<string, GenerationScopeOption>
  }>()

  for (const student of students) {
    const { classGrade, division } = getGenerationStudentScope(student.formData)
    const classKey = normalizeScopeValue(classGrade)
    if (!classKey) continue

    let classEntry = classEntries.get(classKey)
    if (!classEntry) {
      classEntry = { value: classGrade, count: 0, divisions: new Map() }
      classEntries.set(classKey, classEntry)
    }
    classEntry.count += 1

    const divisionKey = normalizeScopeValue(division)
    if (!divisionKey) continue
    const currentDivision = classEntry.divisions.get(divisionKey)
    if (currentDivision) currentDivision.count += 1
    else classEntry.divisions.set(divisionKey, { value: division, count: 1 })
  }

  const sortedClasses = Array.from(classEntries.values())
    .sort((a, b) => naturalSort(a, b))
  const divisionsByClass: Record<string, GenerationScopeOption[]> = {}
  for (const entry of sortedClasses) {
    divisionsByClass[entry.value] = Array.from(entry.divisions.values()).sort(naturalSort)
  }

  return {
    classes: sortedClasses.map(({ value, count }) => ({ value, count })),
    divisionsByClass,
  }
}

export function filterStudentsByGenerationScope<T extends StudentWithFormData>(
  students: T[],
  classGrade: string = "",
  division: string = "",
): T[] {
  const wantedClass = normalizeScopeValue(classGrade)
  const wantedDivision = normalizeScopeValue(division)
  if (!wantedClass && !wantedDivision) return students

  return students.filter(student => {
    const scope = getGenerationStudentScope(student.formData)
    if (wantedClass && normalizeScopeValue(scope.classGrade) !== wantedClass) return false
    if (wantedDivision && normalizeScopeValue(scope.division) !== wantedDivision) return false
    return true
  })
}

export function buildGenerationScopeName(
  schoolName: string,
  sectionName: string = "",
  classGrade: string = "",
  division: string = "",
): string {
  const parts = [String(schoolName || "School").trim() || "School"]
  const section = String(sectionName || "").trim()
  if (section && normalizeScopeValue(section) !== normalizeScopeValue(parts[0])) {
    parts.push(section)
  }
  if (String(classGrade || "").trim()) parts.push(String(classGrade).trim())
  if (String(division || "").trim()) parts.push(String(division).trim())
  return parts.join("-")
}
