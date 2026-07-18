import { describe, expect, it } from "vitest"
import {
  normalizeAddress,
  normalizePersonName,
  normalizeStudentFormData,
  normalizeStudentFieldValue,
} from "@/lib/student-text-normalization"

describe("student text normalization", () => {
  it("proper-cases every name word and prevents all-capital names", () => {
    expect(normalizePersonName("IQRA BANU RAVEEN")).toBe("Iqra Banu Raveen")
    expect(normalizePersonName("dARSHAN sUNIL cHOUDHARI")).toBe("Darshan Sunil Choudhari")
  })

  it("handles apostrophes, hyphens, and Unicode letters", () => {
    expect(normalizePersonName("MARY-JANE O'CONNOR")).toBe("Mary-Jane O'Connor")
    expect(normalizePersonName("ÉLODIE D'SOUZA")).toBe("Élodie D'Souza")
  })

  it("does not remove or collapse whitespace in names", () => {
    expect(normalizePersonName("  ARUHI   PREETAM ARDE  ")).toBe("  Aruhi   Preetam Arde  ")
  })

  it("capitalizes the first address letter and inserts exactly one comma space", () => {
    expect(normalizeAddress("403,supreme Savera,  lane no.3,\nPune-411048"))
      .toBe("403, Supreme Savera, lane no.3, Pune-411048")
  })

  it("preserves address casing, numbers, punctuation, and spacing otherwise", () => {
    expect(normalizeAddress("  flat No. 7/A,MG Road  Pune-411001."))
      .toBe("  Flat No. 7/A, MG Road  Pune-411001.")
  })

  it("normalizes student, father, mother, and address aliases only", () => {
    expect(normalizeStudentFormData({
      "Student Name": "IQRA BANU",
      fatherName: "MOHAMMAD RAVEEN",
      "Mother Name": "SARA RAVEEN",
      homeAddress: "flat 1,pune",
      class: "UKG",
      bloodGroup: "AB+",
    })).toEqual({
      "Student Name": "Iqra Banu",
      fatherName: "Mohammad Raveen",
      "Mother Name": "Sara Raveen",
      homeAddress: "Flat 1, pune",
      class: "UKG",
      bloodGroup: "AB+",
    })
  })

  it("uses configured roles for school-specific field keys", () => {
    expect(normalizeStudentFieldValue("residence", "flat 2,pune", "Residence", "address"))
      .toBe("Flat 2, pune")
  })

  it("returns a new record and does not mutate existing data", () => {
    const original = { fullName: "IQRA BANU", address: "flat 1,pune", score: 10 }
    const normalized = normalizeStudentFormData(original)
    expect(normalized).not.toBe(original)
    expect(original).toEqual({ fullName: "IQRA BANU", address: "flat 1,pune", score: 10 })
  })
})
