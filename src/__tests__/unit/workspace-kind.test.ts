import { describe, expect, it } from "vitest"
import { isCompanyWorkspace } from "@/lib/workspace-kind"

describe("company workspace detection", () => {
  it("detects the Company ID Cards workspace by name", () => {
    expect(isCompanyWorkspace("Company ID Cards")).toBe(true)
  })

  it("detects corporate employee templates by their fields", () => {
    expect(isCompanyWorkspace("LKART", [
      { key: "id_code", label: "ID Code" },
      { key: "date_of_joining", label: "Date of Joining" },
    ])).toBe(true)
  })

  it("keeps ordinary school templates in school mode", () => {
    expect(isCompanyWorkspace("Nikos Public School", [
      { key: "class", label: "Class" },
      { key: "dateOfBirth", label: "Date of Birth" },
    ])).toBe(false)
  })
})
