import { describe, expect, it } from "vitest"
import { buildImportIdentityKeys } from "@/lib/import-identity"

describe("bulk import identity", () => {
  it("matches company rows by ID Code despite header punctuation", () => {
    expect(buildImportIdentityKeys({ "ID Code": "LPT055", Name: "Ravindra Panchal" }))
      .toContain("employee:lpt055:ravindrapanchal")
    expect(buildImportIdentityKeys({ id_code: " lpt-055 ", name: "Ravindra Panchal" }))
      .toContain("employee:lpt055:ravindrapanchal")
  })

  it("does not merge different employee names that reuse the same ID Code", () => {
    const first = buildImportIdentityKeys({ id_code: "CC00456", name: "Ashish Parmar" })
    const second = buildImportIdentityKeys({ id_code: "CC00456", name: "Tapas Hazra" })
    expect(first.find(key => key.startsWith("employee:")))
      .not.toBe(second.find(key => key.startsWith("employee:")))
  })

  it("uses name and DOB when no employee identifier exists", () => {
    expect(buildImportIdentityKeys({
      fullName: "Jane Smith",
      dob: "15/08/2010",
    })).toContain("name-dob:janesmith:15082010")
  })

  it("does not treat a shared mobile as duplicate without the same name", () => {
    const first = buildImportIdentityKeys({ fullName: "Aarav Rao", phone: "9999999999" })
    const second = buildImportIdentityKeys({ fullName: "Aditi Rao", phone: "9999999999" })
    expect(first).not.toContain(second.find(key => key.startsWith("name-mobile:")))
  })
})
