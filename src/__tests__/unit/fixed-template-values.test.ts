import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import {
  applyFixedTemplateValuesToFormData,
  getFixedTemplateFieldKeys,
  getFixedTemplateValue,
} from "@/lib/fixed-template-values"
import { buildTemplateFallbackFields } from "@/lib/submit-fields"

describe("optional fixed template field values", () => {
  it("supports a fixed value on any explicitly enabled field", () => {
    expect(getFixedTemplateValue({
      fieldKey: "officeNo",
      useFixedValue: true,
      fixedValue: " 020-12345678 ",
    })).toBe("020-12345678")
    expect(getFixedTemplateValue({
      fieldKey: "department",
      useFixedValue: true,
      fixedValue: "Operations",
    })).toBe("Operations")
    expect(getFixedTemplateValue({
      fieldKey: "officeNo",
      useFixedValue: false,
      fixedValue: "020-12345678",
    })).toBeUndefined()
  })

  it("overrides only enabled mappings without mutating employee data", () => {
    const original = { officeNo: "employee value", mobile: "9999999999", name: "Asha" }
    const result = applyFixedTemplateValuesToFormData(original, [
      { fieldKey: "officeNo", useFixedValue: true, fixedValue: "020-12345678" },
      { fieldKey: "mobile", useFixedValue: false, fixedValue: "0000000000" },
    ])

    expect(result).toEqual({
      officeNo: "020-12345678",
      mobile: "9999999999",
      name: "Asha",
    })
    expect(original.officeNo).toBe("employee value")
  })

  it("removes fixed mappings from compulsory registration questions", () => {
    const fields = buildTemplateFallbackFields({
      fieldMappings: [
        {
          fieldKey: "officeNo",
          label: "Office No",
          type: "text",
          required: false,
          useFixedValue: true,
          fixedValue: "020-12345678",
        },
        { fieldKey: "mobile", label: "Employee Contact", type: "text", required: true },
      ],
      fieldConfig: [
        { key: "officeNo", label: "Office No", type: "text", required: true },
        { key: "mobile", label: "Employee Contact", type: "tel", required: true },
      ],
    })

    expect(fields.map(field => field.key)).toEqual(["mobile"])
    expect(getFixedTemplateFieldKeys([
      { fieldKey: "officeNo", useFixedValue: true, fixedValue: "020-12345678" },
    ])).toEqual(new Set(["officeno"]))
  })

  it("is wired into editor, previews, browser generation, and server generation", () => {
    const mapper = readFileSync("src/components/JpgTemplateMapper.tsx", "utf8")
    const preview = readFileSync("src/components/JpgCardPreview.tsx", "utf8")
    const batchGenerator = readFileSync("src/components/BatchGenerator.tsx", "utf8")
    const generateRoute = readFileSync("src/app/api/schools/[id]/generate/route.ts", "utf8")
    const printBatch = readFileSync("src/lib/jobs/processors/generate-print-batch.ts", "utf8")

    expect(mapper).toContain("Use a fixed / hardcoded value on every ID card")
    expect(mapper).toContain("Add Fixed Field")
    expect(mapper).toContain("addFixedCustomField")
    expect(mapper).toContain("useFixedValue")
    expect(preview).toContain("getFixedTemplateValue(field)")
    expect(batchGenerator).toContain("getFixedTemplateValue(field)")
    expect(generateRoute).toContain("applyFixedTemplateValuesToFormData")
    expect(printBatch).toContain("applyFixedTemplateValuesToFormData")
    expect(mapper).not.toContain("Fixed Office Number")
  })

  it("is applied before manufacturer edit validation and save", () => {
    const manufacturerPage = readFileSync("src/app/(manufacturer)/schools/[id]/page.tsx", "utf8")

    expect(manufacturerPage).toContain("getEditTemplateMappings")
    expect(manufacturerPage).toContain("getFixedTemplateFieldKeys(mappings)")
    expect(manufacturerPage).toContain("!m.useFixedValue")
    expect(manufacturerPage).toContain("const formDataForSave = applyFixedTemplateValuesToFormData")
    expect(manufacturerPage).toContain("validatePublicSubmissionDetails(formDataForSave, editFields)")
    expect(manufacturerPage).toContain("shouldSendFormData")
    expect(manufacturerPage).toContain("...(shouldSendFormData ? { formData: formDataForSave } : {})")
  })
})
