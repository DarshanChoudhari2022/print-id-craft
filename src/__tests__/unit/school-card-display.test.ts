import { describe, expect, it } from "vitest"
import { formatSchoolCardFieldValue } from "@/lib/school-card-display"

describe("formatSchoolCardFieldValue", () => {
  it("adds one space after each comma in Nikos address fields", () => {
    expect(formatSchoolCardFieldValue(
      "Nikos Public School",
      "address",
      "403,Supreme Savera,lane no.3,sr.no.53/3/3,Shivneri nagar, Kondhwa",
    )).toBe("403, Supreme Savera, lane no.3, sr.no.53/3/3, Shivneri nagar, Kondhwa")
  })

  it("collapses comma-adjacent whitespace without changing other punctuation", () => {
    expect(formatSchoolCardFieldValue(
      "  nIkOs PuBlIc ScHoOl  ",
      "Address",
      "403,  Supreme Savera,\tlane no.3,\nsr.no.53/3/3, Pune-411048.",
    )).toBe("403, Supreme Savera, lane no.3, sr.no.53/3/3, Pune-411048.")
  })

  it("leaves Nikos non-address fields unchanged", () => {
    expect(formatSchoolCardFieldValue(
      "Nikos Public School",
      "name",
      "Hussain,Sajid",
    )).toBe("Hussain,Sajid")
  })

  it("formats Nikos prefixed address placeholders", () => {
    expect(formatSchoolCardFieldValue(
      "Nikos Public School",
      "addressWithLabel",
      "Address: 403,Supreme Savera",
    )).toBe("Address: 403, Supreme Savera")
  })

  it("leaves another school's address unchanged", () => {
    expect(formatSchoolCardFieldValue(
      "Shining Light English School",
      "address",
      "403,Supreme Savera",
    )).toBe("403,Supreme Savera")
  })
})
