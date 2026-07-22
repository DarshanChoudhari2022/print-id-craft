import { describe, expect, it } from "vitest"
import { stripIndianPrefix, validatePublicSubmissionDetails } from "@/lib/form-validation"

describe("stripIndianPrefix", () => {
  it("keeps a 10-digit local number that starts with 91", () => {
    expect(stripIndianPrefix("9168683282")).toBe("9168683282")
  })

  it("strips explicit +91 country code", () => {
    expect(stripIndianPrefix("+91 9168683282")).toBe("9168683282")
  })

  it("strips 12-digit country-code values", () => {
    expect(stripIndianPrefix("919168683282")).toBe("9168683282")
  })

  it("validates local numbers starting with 91 as 10 digits", () => {
    expect(validatePublicSubmissionDetails(
      { mobile: "9168683282" },
      [{ key: "mobile", label: "Mobile", type: "tel", required: true, role: "mobile" }],
    )).toEqual({ ok: true })
  })
})
