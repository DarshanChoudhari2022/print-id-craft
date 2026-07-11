import { describe, expect, it } from "vitest"
import { prepareSectionRename } from "@/lib/section-name"

describe("prepareSectionRename", () => {
  it("trims a valid changed section name", () => {
    expect(prepareSectionRename("UnityPark", "  Unity Park  ")).toEqual({
      name: "Unity Park",
      error: null,
    })
  })

  it("rejects an empty section name", () => {
    expect(prepareSectionRename("UnityPark", "")).toEqual({
      name: null,
      error: "Section name is required",
    })
  })

  it("rejects a whitespace-only section name", () => {
    expect(prepareSectionRename("UnityPark", "   ")).toEqual({
      name: null,
      error: "Section name is required",
    })
  })

  it("rejects an unchanged trimmed section name", () => {
    expect(prepareSectionRename("Unity Park", "  Unity Park ")).toEqual({
      name: null,
      error: "Enter a different section name",
    })
  })
})
