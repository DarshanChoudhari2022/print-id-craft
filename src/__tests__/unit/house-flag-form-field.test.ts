import { describe, expect, it } from "vitest"
import { buildTemplateFallbackFields } from "@/lib/submit-fields"

describe("house flag form field generation", () => {
  it("adds House when fieldConfig exists and the front template has a flag placeholder", () => {
    const fields = buildTemplateFallbackFields({
      fieldConfig: [{ key: "name", label: "Student Name", type: "text", required: true }],
      fieldMappings: [{ fieldKey: "flag", label: "House Flag", type: "flag" }],
    })

    expect(fields).toContainEqual({
      key: "flagColor",
      label: "House",
      type: "select",
      required: true,
      role: "flag",
    })
  })

  it("adds House for a back-side flag placeholder", () => {
    const fields = buildTemplateFallbackFields({
      fieldConfig: [{ key: "name", label: "Student Name" }],
      fieldMappings: [],
      backFieldMappings: [{ fieldKey: "flag", label: "House Flag", type: "flag" }],
    })

    expect(fields.filter(field => field.role === "flag")).toHaveLength(1)
  })

  it("preserves an existing House field without adding a duplicate", () => {
    const fields = buildTemplateFallbackFields({
      fieldConfig: [{ key: "House", label: "House", type: "text", required: true }],
      fieldMappings: [{ fieldKey: "flag", label: "House Flag", type: "flag" }],
    })

    expect(fields).toEqual([
      { key: "House", label: "House", type: "text", required: true },
    ])
  })
})
