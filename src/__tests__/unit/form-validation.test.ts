import { describe, expect, it } from "vitest"
import {
  isValidIndianMobile,
  stripIndianPrefix,
  validatePublicSubmissionDetails,
} from "@/lib/form-validation"

describe("stripIndianPrefix", () => {
  const validCases = [
    ["10-digit local number starting with 91", "9152314560", "9152314560"],
    ["spaced +91 prefix and local number starting with 91", "+91 9152314560", "9152314560"],
    ["compact +91 prefix and local number starting with 91", "+919152314560", "9152314560"],
    ["12-digit 91 prefix and local number starting with 91", "919152314560", "9152314560"],
    ["hyphenated +91 prefix", "+91-8152314560", "8152314560"],
    ["spaced local number", "71523 14560", "7152314560"],
    ["number starting with 6", "6152314560", "6152314560"],
    ["number starting with 7", "7152314560", "7152314560"],
    ["number starting with 8", "8152314560", "8152314560"],
    ["number starting with 9", "9152314560", "9152314560"],
  ] as const

  it.each(validCases)("accepts %s", (_description, input, expectedLocal) => {
    expect(stripIndianPrefix(input)).toBe(expectedLocal)
    expect(isValidIndianMobile(input)).toBe(true)
  })

  const invalidCases = [
    ["empty value", ""],
    ["country code without a number", "+91"],
    ["8 local digits", "93094288"],
    ["9 local digits", "930942887"],
    ["+91 followed by 8 local digits", "+91 93094288"],
    ["+91 followed by 9 local digits", "+91 930942887"],
    ["11 local digits", "91523145601"],
    ["+91 followed by 11 local digits", "+91 91523145601"],
    ["all-zero placeholder", "+91 0000000000"],
    ["all-six placeholder", "6666666666"],
    ["all-seven placeholder", "7777777777"],
    ["all-eight placeholder", "8888888888"],
    ["all-nine placeholder", "9999999999"],
    ["10 digits starting with 0", "0123456789"],
    ["10 digits starting with 1", "1123456789"],
    ["10 digits starting with 5", "5123456789"],
    ["duplicated country code", "+91 91 9152314560"],
  ] as const

  it.each(invalidCases)("rejects %s", (_description, input) => {
    expect(isValidIndianMobile(input)).toBe(false)
  })

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

  it("validates Date of Joining in DD/MM/YYYY format", () => {
    const fields = [{ key: "doj", label: "Date of Joining", type: "date", required: true, role: "doj" }]

    expect(validatePublicSubmissionDetails({ doj: "15/08/2023" }, fields)).toEqual({ ok: true })
    expect(validatePublicSubmissionDetails({ doj: "2023-08-15" }, fields)).toEqual({ ok: true })
    expect(validatePublicSubmissionDetails({ doj: "invalid-date" }, fields)).toEqual({
      ok: false,
      error: "Please select date of joining in DD/MM/YYYY format.",
    })
  })

  it("validates Date of Birth in DD/MM/YYYY format", () => {
    const fields = [{ key: "dob", label: "Date of Birth", type: "date", required: true, role: "dob" }]

    expect(validatePublicSubmissionDetails({ dob: "01/01/2015" }, fields)).toEqual({ ok: true })
    expect(validatePublicSubmissionDetails({ dob: "2015-01-01" }, fields)).toEqual({ ok: true })
    expect(validatePublicSubmissionDetails({ dob: "bad" }, fields)).toEqual({
      ok: false,
      error: "Please select date of birth in DD/MM/YYYY format.",
    })
  })
})
