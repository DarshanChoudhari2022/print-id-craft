const INDIA_TIME_OFFSET = "+05:30"
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isCalendarDate(value: string) {
  if (!DATE_KEY_PATTERN.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const candidate = new Date(Date.UTC(year, month - 1, day))
  return candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
}

export type SubmissionDateRange = {
  gte: Date
  lt: Date
}

/** Builds an inclusive India-calendar-day range using an exclusive upper bound. */
export function buildSubmissionDateRange(
  dateFrom?: string | null,
  dateTo?: string | null
): SubmissionDateRange | null {
  if (!dateFrom && !dateTo) return null
  if (!dateFrom || !dateTo) {
    throw new Error("Both from and to dates are required")
  }
  if (!isCalendarDate(dateFrom) || !isCalendarDate(dateTo)) {
    throw new Error("Dates must be valid calendar dates in YYYY-MM-DD format")
  }

  const start = new Date(`${dateFrom}T00:00:00${INDIA_TIME_OFFSET}`)
  const endDayStart = new Date(`${dateTo}T00:00:00${INDIA_TIME_OFFSET}`)
  if (start.getTime() > endDayStart.getTime()) {
    throw new Error("From date cannot be after to date")
  }

  return {
    gte: start,
    lt: new Date(endDayStart.getTime() + 24 * 60 * 60 * 1000),
  }
}
