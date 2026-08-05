import { describe, expect, it } from "vitest"
import {
  isValidIndianMobile,
  stripIndianPrefix,
  validatePublicSubmissionDetails,
} from "@/lib/form-validation"

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

  it("does not count +91 as part of a 9-digit local number", () => {
    expect(stripIndianPrefix("+91 930942887")).toBe("930942887")
  })

  it("rejects 9-digit country-code values", () => {
    expect(isValidIndianMobile("+91 930942887")).toBe(false)
  })

  it("rejects all-zero and repeated-digit placeholders", () => {
    expect(isValidIndianMobile("+91 0000000000")).toBe(false)
    expect(isValidIndianMobile("9999999999")).toBe(false)
  })

  it("rejects 10-digit values outside the Indian mobile range", () => {
    expect(isValidIndianMobile("5123456789")).toBe(false)
  })

  it("validates local numbers starting with 91 as 10 digits", () => {
    expect(validatePublicSubmissionDetails(
      { mobile: "9168683282" },
      [{ key: "mobile", label: "Mobile", type: "tel", required: true, role: "mobile" }],
    )).toEqual({ ok: true })
  })

  it("rejects malformed mobile values at server validation", () => {
    const fields = [{ key: "mobile", label: "Mobile", type: "tel", required: true, role: "mobile" }]

    expect(validatePublicSubmissionDetails({ mobile: "+91 930942887" }, fields)).toEqual({
      ok: false,
      error: "Please enter a valid 10-digit Indian mobile number.",
    })
    expect(validatePublicSubmissionDetails({ mobile: "+91 0000000000" }, fields)).toEqual({
      ok: false,
      error: "Please enter a valid 10-digit Indian mobile number.",
    })
  })
})
