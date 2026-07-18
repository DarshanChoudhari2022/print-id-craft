import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import {
  applyFixedOfficeNumberToFormData,
  fixedOfficeNumberForField,
  isOfficeNumberField,
} from "@/lib/fixed-template-values"

describe("fixed company template values", () => {
  it("recognizes common office number field names accurately", () => {
    expect(isOfficeNumberField("officeNo")).toBe(true)
    expect(isOfficeNumberField("custom_1", "Office no")).toBe(true)
    expect(isOfficeNumberField("officeAddress", "Office Address")).toBe(false)
  })

  it("overrides only office number fields without mutating employee data", () => {
    const original = { officeNo: "old", mobile: "9999999999", name: "Asha" }
    const result = applyFixedOfficeNumberToFormData(original, "020-12345678", [
      { fieldKey: "officeNo", label: "Office no" },
      { fieldKey: "mobile", label: "Employee Contact Number" },
    ])

    expect(result).toEqual({
      officeNo: "020-12345678",
      mobile: "9999999999",
      name: "Asha",
    })
    expect(original.officeNo).toBe("old")
  })

  it("returns the fixed value only for an office number mapping", () => {
    expect(fixedOfficeNumberForField(" 020-12345678 ", "officeNo", "Office no")).toBe("020-12345678")
    expect(fixedOfficeNumberForField("020-12345678", "mobile", "Employee Contact")).toBe("")
  })

  it("is wired into saved templates, previews, and print generation", () => {
    const mapper = readFileSync("src/components/JpgTemplateMapper.tsx", "utf8")
    const preview = readFileSync("src/components/JpgCardPreview.tsx", "utf8")
    const generateRoute = readFileSync("src/app/api/schools/[id]/generate/route.ts", "utf8")
    const printBatch = readFileSync("src/lib/jobs/processors/generate-print-batch.ts", "utf8")
    const fixedValueRoute = readFileSync("src/app/api/schools/[id]/fixed-office-number/route.ts", "utf8")
    const templatesRoute = readFileSync("src/app/api/schools/[id]/templates/route.ts", "utf8")

    expect(mapper).toContain("Fixed Office Number (Optional)")
    expect(mapper).toContain("fixedOfficeNo,")
    expect(preview).toContain("fixedOfficeNumberForField")
    expect(generateRoute).toContain("applyFixedOfficeNumberToFormData")
    expect(printBatch).toContain("studentsForPrint")
    expect(fixedValueRoute).toContain("updatedTemplates")
    expect(templatesRoute).toContain("companyFixedOfficeNo")
  })
})
