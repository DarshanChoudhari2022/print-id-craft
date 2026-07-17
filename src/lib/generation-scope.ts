import {
  resolveClassDisplayValue,
  resolveDivisionDisplayValue,
} from "@/lib/section-class"
import {
  normalizeFormValue,
  resolveFieldValue,
} from "@/lib/field-resolver"

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

const PRE_PRIMARY_CLASS_ORDER: Record<string, number> = {
  nursery: -30,
  nur: -30,
  lkg: -20,
  lowerkg: -20,
  ukg: -10,
  upperkg: -10,
}

const ROMAN_CLASS_ORDER: Record<string, number> = {
  i: 1,
  ii: 2,
  iii: 3,
  iv: 4,
  v: 5,
  vi: 6,
  vii: 7,
  viii: 8,
  ix: 9,
  x: 10,
  xi: 11,
  xii: 12,
}

function classSortRank(value: string): number {
  const normalized = normalizeScopeValue(value)
  if (!normalized) return Number.MAX_SAFE_INTEGER
  if (PRE_PRIMARY_CLASS_ORDER[normalized] !== undefined) return PRE_PRIMARY_CLASS_ORDER[normalized]
  if (ROMAN_CLASS_ORDER[normalized] !== undefined) return ROMAN_CLASS_ORDER[normalized]
  const numeric = normalized.match(/\d+/)?.[0]
  return numeric ? Number(numeric) : Number.MAX_SAFE_INTEGER
}

function compareScopeText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
}

function compareRollValues(a: string, b: string): number {
  const normalizedA = normalizeFormValue(a)
  const normalizedB = normalizeFormValue(b)
  const numberA = normalizedA.match(/\d+/)?.[0]
  const numberB = normalizedB.match(/\d+/)?.[0]
  if (numberA && numberB && Number(numberA) !== Number(numberB)) {
    return Number(numberA) - Number(numberB)
  }
  return compareScopeText(normalizedA, normalizedB)
}

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

export function sortStudentsForGeneration<T extends StudentWithFormData & {
  serialNumber?: string | null
}>(
  students: T[],
): T[] {
  return [...students].sort((a, b) => {
    const scopeA = getGenerationStudentScope(a.formData)
    const scopeB = getGenerationStudentScope(b.formData)
    const rankA = classSortRank(scopeA.classGrade)
    const rankB = classSortRank(scopeB.classGrade)
    if (rankA !== rankB) return rankA - rankB

    const classCompare = compareScopeText(scopeA.classGrade, scopeB.classGrade)
    if (classCompare) return classCompare

    const divisionCompare = compareScopeText(scopeA.division, scopeB.division)
    if (divisionCompare) return divisionCompare

    const formA = (a.formData || {}) as Record<string, string>
    const formB = (b.formData || {}) as Record<string, string>
    const rollCompare = compareRollValues(
      resolveFieldValue(formA, "rollno"),
      resolveFieldValue(formB, "rollno"),
    )
    if (rollCompare) return rollCompare

    const serialCompare = compareScopeText(a.serialNumber || "", b.serialNumber || "")
    if (serialCompare) return serialCompare

    return compareScopeText(
      resolveFieldValue(formA, "name"),
      resolveFieldValue(formB, "name"),
    )
  })
}

export function reconcileGenerationScopeSelection(
  options: GenerationFilterOptions,
  classGrade: string = "",
  division: string = "",
): { classGrade: string; division: string } {
  const wantedClass = normalizeScopeValue(classGrade)
  if (!wantedClass) return { classGrade: "", division: "" }

  const matchedClass = options.classes.find(
    option => normalizeScopeValue(option.value) === wantedClass,
  )
  if (!matchedClass) return { classGrade: "", division: "" }

  const wantedDivision = normalizeScopeValue(division)
  if (!wantedDivision) {
    return { classGrade: matchedClass.value, division: "" }
  }

  const matchedDivision = (options.divisionsByClass[matchedClass.value] || []).find(
    option => normalizeScopeValue(option.value) === wantedDivision,
  )
  return {
    classGrade: matchedClass.value,
    division: matchedDivision?.value || "",
  }
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
