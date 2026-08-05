import { describe, expect, it } from "vitest"
import {
  effectiveMobileFieldConfig,
  findInvalidMobileFields,
} from "@/lib/student-mobile-validation"

const fields = [
  { key: "name", label: "Student Name", role: "name", required: true },
  { key: "father", label: "Father's Mobile No.", role: "mobile", required: true },
  { key: "mother", label: "Mother's Mobile No.", role: "mobile", required: false },
]

describe("print mobile preflight", () => {
  it("accepts valid numbers, including a local number starting with 91", () => {
    expect(findInvalidMobileFields({
      father: "+91 9152314560",
      mother: "8152314560",
    }, fields)).toEqual([])
  })

  it("blocks a required 9-digit number", () => {
    expect(findInvalidMobileFields({ father: "+91 930942887" }, fields)).toEqual([
      {
        key: "father",
        label: "Father's Mobile No.",
        value: "+91 930942887",
        reason: "invalid",
      },
    ])
  })

  it("blocks all-zero placeholders", () => {
    expect(findInvalidMobileFields({ father: "+91 0000000000" }, fields)[0]?.reason).toBe("invalid")
  })

  it("blocks a missing required mobile but permits an empty optional mobile", () => {
    expect(findInvalidMobileFields({ mother: "" }, fields)).toEqual([
      {
        key: "father",
        label: "Father's Mobile No.",
        value: "",
        reason: "missing",
      },
    ])
  })

  it("uses default fields when an assigned template has no field configuration", () => {
    expect(effectiveMobileFieldConfig([], fields)).toEqual(fields)
    expect(effectiveMobileFieldConfig([{ key: "phone", role: "mobile" }], fields)).toEqual([
      { key: "phone", role: "mobile" },
    ])
  })
})
