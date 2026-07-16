export type HouseFlagDefinition = {
  color: string
  imageUrl: string | null
}

export type HouseFlagRenderLayout = {
  label: string
  imageX: number
  imageY: number
  imageWidth: number
  imageHeight: number
  labelX: number
  labelY: number
  labelWidth: number
  labelHeight: number
  fontSize: number
}

type HouseFlagMapping = {
  type?: string
}

type HouseFlagTemplateStudent = {
  template?: {
    fieldMappings?: HouseFlagMapping[] | null
    backFieldMappings?: HouseFlagMapping[] | null
  } | null
}

const HOUSE_KEYS = new Set([
  "flag",
  "flagcolor",
  "house",
  "houseflag",
  "housecolor",
  "colour",
  "color",
  "team",
  "group",
])

export const normalizeHouseName = (value: string) =>
  String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "")

export function generationUsesHouseFlags(
  fallbackFront: HouseFlagMapping[] = [],
  fallbackBack: HouseFlagMapping[] = [],
  students: HouseFlagTemplateStudent[] = [],
): boolean {
  return [
    fallbackFront,
    fallbackBack,
    ...students.flatMap(student => [
      student.template?.fieldMappings || [],
      student.template?.backFieldMappings || [],
    ]),
  ].some(mappings => mappings.some(mapping => mapping?.type === "flag"))
}

export function humanizeHouseFilename(filename: string): string {
  const base = filename
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase()
  return base.replace(/\b\w/g, c => c.toUpperCase())
}

export function buildHouseFlagDefinitions(
  studentValues: string[],
  storedFiles: string[],
  imageUrlForFile: (filename: string) => string,
): HouseFlagDefinition[] {
  const byName = new Map<string, HouseFlagDefinition>()

  for (const filename of storedFiles) {
    const color = humanizeHouseFilename(filename)
    const key = normalizeHouseName(color)
    if (key && !byName.has(key)) {
      byName.set(key, { color, imageUrl: imageUrlForFile(filename) })
    }
  }

  for (const value of studentValues) {
    const color = String(value || "").trim()
    const key = normalizeHouseName(color)
    if (key && !byName.has(key)) {
      byName.set(key, { color, imageUrl: null })
    }
  }

  return Array.from(byName.values()).sort((a, b) => a.color.localeCompare(b.color))
}

export function resolveHouseValue(
  formData: Record<string, string> | null | undefined,
): string {
  if (!formData) return ""
  for (const [key, value] of Object.entries(formData)) {
    if (HOUSE_KEYS.has(normalizeHouseName(key)) && String(value || "").trim()) {
      return String(value).trim()
    }
  }
  return ""
}

export function resolveHouseImageUrl(
  formData: Record<string, string> | null | undefined,
  images: Record<string, string>,
): string | undefined {
  const wanted = normalizeHouseName(resolveHouseValue(formData))
  if (!wanted) return undefined
  const match = Object.entries(images).find(([name]) => normalizeHouseName(name) === wanted)
  return match?.[1]
}

export function getHouseFlagRenderLayout(
  formData: Record<string, string> | null | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
): HouseFlagRenderLayout | null {
  const rawLabel = resolveHouseValue(formData)
  if (!rawLabel) return null

  const label = rawLabel
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, character => character.toUpperCase())
  const gap = height * 0.03
  const labelHeight = height * 0.2
  const imageHeight = Math.max(0, height - labelHeight - gap)
  const fontSize = Math.max(
    1,
    Math.min(labelHeight * 0.68, width / Math.max(label.length * 0.62, 1)),
  )

  return {
    label,
    imageX: x,
    imageY: y,
    imageWidth: width,
    imageHeight,
    labelX: x,
    labelY: y + imageHeight + gap,
    labelWidth: width,
    labelHeight,
    fontSize,
  }
}
