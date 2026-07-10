import { describe, expect, it } from "vitest"
import { MANUFACTURER_BG_MODEL_OPTIONS } from "@/lib/manufacturer-bg-models"

describe("manufacturer background models", () => {
  it("offers API AI alongside the existing processing models", () => {
    expect(MANUFACTURER_BG_MODEL_OPTIONS.map((option) => option.value)).toEqual([
      "bria-rmbg2",
      "gemini",
      "removebg",
      "birefnet",
      "isnet",
    ])
    expect(MANUFACTURER_BG_MODEL_OPTIONS.find((option) => option.value === "removebg")?.label)
      .toContain("API AI")
  })
})
