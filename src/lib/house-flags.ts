export type HouseFlagDefinition = {
  color: string
  imageUrl: string | null
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
