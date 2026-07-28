import { describe, expect, it } from "vitest"
import { formatSchoolCardFieldValue } from "@/lib/school-card-display"

describe("formatSchoolCardFieldValue", () => {
  it("adds one space after each comma and title-cases address words", () => {
    expect(formatSchoolCardFieldValue(
      "Nikos Public School",
      "address",
      "403,supreme Savera,lane no.3,sr.no.53/3/3,Shivneri nagar, Kondhwa",
    )).toBe("403, Supreme Savera, Lane No.3, Sr.No.53/3/3, Shivneri Nagar, Kondhwa")
  })

  it("collapses comma-adjacent whitespace without changing other punctuation", () => {
    expect(formatSchoolCardFieldValue(
      "  nIkOs PuBlIc ScHoOl  ",
      "Address",
      "403,  Supreme Savera,\tlane no.3,\nsr.no.53/3/3, Pune-411048.",
    )).toBe("403, Supreme Savera, Lane No.3, Sr.No.53/3/3, Pune-411048.")
  })

  it("proper-cases student names", () => {
    expect(formatSchoolCardFieldValue(
      "Nikos Public School",
      "name",
      "IQRA BANU RAVEEN",
    )).toBe("Iqra Banu Raveen")
  })

  it("formats Nikos prefixed address placeholders", () => {
    expect(formatSchoolCardFieldValue(
      "Nikos Public School",
      "addressWithLabel",
      "Address: 403,Supreme Savera",
    )).toBe("Address: 403, Supreme Savera")
  })

  it("applies the same address rule to every school", () => {
    expect(formatSchoolCardFieldValue(
      "Shining Light English School",
      "address",
      "403,supreme Savera",
    )).toBe("403, Supreme Savera")
  })
})
