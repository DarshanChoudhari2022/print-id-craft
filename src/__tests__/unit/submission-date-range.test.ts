import { describe, expect, it } from "vitest"
import { buildSubmissionDateRange } from "@/lib/export/submission-date-range"

describe("buildSubmissionDateRange", () => {
  it("includes both selected India calendar dates", () => {
    const range = buildSubmissionDateRange("2026-08-05", "2026-08-06")

    expect(range?.gte.toISOString()).toBe("2026-08-04T18:30:00.000Z")
    expect(range?.lt.toISOString()).toBe("2026-08-06T18:30:00.000Z")
  })

  it("allows a single-day inclusive range", () => {
    const range = buildSubmissionDateRange("2026-08-05", "2026-08-05")

    expect(range?.gte.toISOString()).toBe("2026-08-04T18:30:00.000Z")
    expect(range?.lt.toISOString()).toBe("2026-08-05T18:30:00.000Z")
  })

  it("rejects partial, reversed, and invalid dates", () => {
    expect(() => buildSubmissionDateRange("2026-08-05", null)).toThrow("Both from and to dates")
    expect(() => buildSubmissionDateRange("2026-08-06", "2026-08-05")).toThrow("cannot be after")
    expect(() => buildSubmissionDateRange("2026-02-31", "2026-03-01")).toThrow("valid calendar dates")
  })
})
