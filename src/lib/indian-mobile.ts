/**
 * Return only the local digits from an Indian mobile-number input.
 *
 * An explicit +91 prefix is removed even when the remaining number is the
 * wrong length. Validation must see the real local length instead of a
 * truncated country-code value that can accidentally look valid.
 */
export function stripIndianPrefix(raw: string): string {
  const value = String(raw || "").trim()
  if (!value) return ""

  const explicitCountryCode = value.match(/^\+\s*91[\s-]*(.*)$/)
  if (explicitCountryCode) {
    return explicitCountryCode[1].replace(/\D/g, "")
  }

  const digits = value.replace(/\D/g, "")
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2)
  return digits
}

/** Validate a real 10-digit Indian mobile number, not just its length. */
export function isValidIndianMobile(raw: string): boolean {
  const local = stripIndianPrefix(raw)
  return /^[6-9]\d{9}$/.test(local) && !/^(\d)\1{9}$/.test(local)
}
