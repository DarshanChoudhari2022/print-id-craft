/**
 * Field resolution utilities for ID card data mapping.
 * Maps student form data keys to their canonical field names using
 * normalization and fuzzy group matching.
 */

/**
 * Normalizes a field key by lowercasing and stripping non-alphanumeric chars.
 */
export function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z0-9]/g, "")
}

/**
 * Known field group aliases — maps canonical keys to their common variants.
 */
export const FIELD_GROUPS: Record<string, string[]> = {
  name: ["fullname", "studentname", "name", "student_name", "full_name", "full name", "student name"],
  father: ["fathername", "father", "fatherphone", "mobfather", "mob_father", "fatherno", "father name", "father mobile"],
  mother: ["mothername", "mother", "motherphone", "motherno", "mother name", "mother mobile"],
  mob_father: ["mobfather", "mob_father", "fatherphone", "father", "fathername", "phone", "mobile no", "contact no", "telephone"],
  phone: ["phone", "mobile", "contact", "fatherphone", "mobfather", "contact no", "mobile no", "mob", "ph", "phno", "phoneno"],
  mobile: ["mobile", "phone", "contact", "fatherphone", "mobfather", "mob_father", "mob", "ph", "phno", "phoneno", "mobile no", "contact no", "telephone", "motherphone"],
  class: ["class", "classsection", "class_section", "standard", "grade"],
  branch: ["branch", "campus", "location"],
  rollno: ["rollno", "roll", "srno", "no", "admissionno", "roll number"],
  address: ["address", "addr", "location"],
  dateofbirth: ["dob", "dateofbirth", "birthdate", "birthday"],
  bloodgroup: ["bloodgroup", "blood group", "bg"],
  admissionno: ["admissionno", "admno", "registrationno", "regno"],
  photoid: ["photoid", "photo_id", "imageid", "imgid", "photono", "photo_no", "photonumber", "img", "imgno", "img_no", "imageno", "image_no"],
  serialnumber: ["serialnumber", "serial", "sr"],
  flagcolor: ["flagcolor", "flag_color", "flag", "house", "housecolor", "house_color", "colour", "color", "team", "group"],
}

/**
 * Reverse-lookup: find which FIELD_GROUPS canonical key a normalized
 * field-key belongs to.
 *
 * This lets custom-built keys like "mobile_no" (→ "mobileno"),
 * "studentmobile", "mobno", "fathermobileno" resolve to the same
 * group ("mobile") even though they aren't a canonical FIELD_GROUPS key.
 */
function findGroupForKey(normKey: string): string | null {
  if (!normKey) return null
  // Direct canonical hit
  if (FIELD_GROUPS[normKey]) return normKey
  // Search every group's aliases for a normalized substring match
  for (const [canonical, aliases] of Object.entries(FIELD_GROUPS)) {
    const nc = normalizeKey(canonical)
    if (normKey.includes(nc) || nc.includes(normKey)) return canonical
    for (const a of aliases) {
      const na = normalizeKey(a)
      if (!na) continue
      if (na === normKey || normKey.includes(na) || na.includes(normKey)) {
        return canonical
      }
    }
  }
  return null
}

/**
 * Resolves a field value from student form data using:
 * 1. Direct key match
 * 2. Normalized key match
 * 3. Field group alias matching (fuzzy, bidirectional reverse-lookup)
 *
 * @param fd       - student form data key-value pairs
 * @param fieldKey - the canonical field key to resolve
 * @returns the resolved value (trimmed string) or empty string
 */
// WeakMap-based cache: normalized lookup is built once per formData object,
// then reused across all resolveFieldValue calls for the same student.
// This avoids O(fields × keys) normalization work during batch rendering
// (2000 students × 10 fields → 20K loops → 2K loops).
const _fdNormCache = new WeakMap<Record<string, string>, Record<string, string>>()

function getNormalizedFd(fd: Record<string, string>): Record<string, string> {
  let cached = _fdNormCache.get(fd)
  if (cached) return cached
  cached = {}
  for (const [k, v] of Object.entries(fd)) {
    if (v && String(v).trim()) cached[normalizeKey(k)] = String(v).trim()
  }
  _fdNormCache.set(fd, cached)
  return cached
}

export function resolveFieldValue(fd: Record<string, string>, fieldKey: string): string {
  // 1. Direct exact match (skip empty/whitespace-only values)
  const directVal = fd[fieldKey]
  if (directVal != null && String(directVal).trim()) return String(directVal).trim()

  // 2. Build normalized lookup (cached per formData object)
  const fdNormalized = getNormalizedFd(fd)

  const normKey = normalizeKey(fieldKey)
  if (fdNormalized[normKey]) return fdNormalized[normKey]

  // 3. Field group alias match — resolve via the group that owns this key
  //    (works for canonical keys AND custom keys like "mobile_no", "mobno").
  const groupKey = findGroupForKey(normKey)
  if (groupKey) {
    const patterns = FIELD_GROUPS[groupKey]
    for (const p of patterns) {
      const simpleP = normalizeKey(p)
      if (fdNormalized[simpleP]) return fdNormalized[simpleP]
      for (const [nk, nv] of Object.entries(fdNormalized)) {
        if (nk === simpleP || nk.includes(simpleP) || simpleP.includes(nk)) return nv
      }
    }
  }

  return ""
}

/**
 * Formats a date string according to the user's chosen format.
 * Parses DD/MM/YYYY, YYYY-MM-DD, and DD-MM-YYYY inputs.
 * Returns the original value if parsing fails.
 */
export function formatDateValue(value: string, format: string): string {
  if (!value || !format) return value
  const datePatterns = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // DD/MM/YYYY or MM/DD/YYYY
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // YYYY-MM-DD
    /^(\d{1,2})-(\d{1,2})-(\d{4})$/, // DD-MM-YYYY
  ]
  let day = "", month = "", year = ""
  for (const pattern of datePatterns) {
    const match = value.match(pattern)
    if (match) {
      if (pattern === datePatterns[1]) {
        year = match[1]; month = match[2]; day = match[3]
      } else {
        day = match[1]; month = match[2]; year = match[3]
      }
      break
    }
  }
  if (!day || !month || !year) return value
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"]
  const monthShort = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
  const mIdx = parseInt(month, 10) - 1
  switch (format) {
    case "DD/MM/YYYY": return `${day.padStart(2,"0")}/${month.padStart(2,"0")}/${year}`
    case "MM/DD/YYYY": return `${month.padStart(2,"0")}/${day.padStart(2,"0")}/${year}`
    case "YYYY-MM-DD": return `${year}-${month.padStart(2,"0")}-${day.padStart(2,"0")}`
    case "DD-MM-YYYY": return `${day.padStart(2,"0")}-${month.padStart(2,"0")}-${year}`
    case "DD.MM.YYYY": return `${day.padStart(2,"0")}.${month.padStart(2,"0")}.${year}`
    case "DD MMM YYYY": return `${day.padStart(2,"0")} ${monthShort[mIdx] || month} ${year}`
    case "MMMM DD, YYYY": return `${months[mIdx] || month} ${day}, ${year}`
    default: return value
  }
}
