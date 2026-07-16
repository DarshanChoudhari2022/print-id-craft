import { describe, expect, it } from "vitest"
import {
  buildHouseFlagDefinitions,
  generationUsesHouseFlags,
  getHouseFlagRenderLayout,
  humanizeHouseFilename,
  resolveHouseImageUrl,
  resolveHouseValue,
} from "@/lib/house-flags"

describe("house flag utilities", () => {
  it("humanizes existing underscored filenames", () => {
    expect(humanizeHouseFilename("Red_.png")).toBe("Red")
    expect(humanizeHouseFilename("yellow_house.webp")).toBe("Yellow House")
  })

  it("builds uploaded-only definitions with exact storage URLs", () => {
    expect(buildHouseFlagDefinitions([], ["Blue.png", "Red_.png"], f => `/flags/${f}`)).toEqual([
      { color: "Blue", imageUrl: "/flags/Blue.png" },
      { color: "Red", imageUrl: "/flags/Red_.png" },
    ])
  })

  it("keeps legacy student houses without images", () => {
    expect(buildHouseFlagDefinitions(["Green"], [], f => `/flags/${f}`)).toEqual([
      { color: "Green", imageUrl: null },
    ])
  })

  it("resolves current and legacy house aliases", () => {
    expect(resolveHouseValue({ flag: "Blue" })).toBe("Blue")
    expect(resolveHouseValue({ House: "Green" })).toBe("Green")
    expect(resolveHouseValue({ "Flag Color": "Red" })).toBe("Red")
  })

  it("matches house images case-insensitively and ignores punctuation", () => {
    expect(resolveHouseImageUrl({ flagColor: "red" }, { Red_: "/red.png" })).toBe("/red.png")
  })

  it("places the house label below the flag inside the original placeholder", () => {
    const layout = getHouseFlagRenderLayout({ House: "red" }, 10, 20, 100, 200)

    expect(layout?.label).toBe("Red")
    expect(layout?.imageY).toBe(20)
    expect(layout!.imageY + layout!.imageHeight).toBeLessThan(layout!.labelY)
    expect(layout!.labelY + layout!.labelHeight).toBeLessThanOrEqual(220)
  })

  it("returns no flag layout when the student has no selected house", () => {
    expect(getHouseFlagRenderLayout({}, 0, 0, 100, 100)).toBeNull()
  })

  it("detects a flag field in an assigned student's front template", () => {
    expect(generationUsesHouseFlags([], [], [{
      template: { fieldMappings: [{ type: "flag" }], backFieldMappings: [] },
    }])).toBe(true)
  })

  it("detects a flag field in an assigned student's back template", () => {
    expect(generationUsesHouseFlags([], [], [{
      template: { fieldMappings: [], backFieldMappings: [{ type: "flag" }] },
    }])).toBe(true)
  })

  it("does not report flags when no active template contains one", () => {
    expect(generationUsesHouseFlags([{ type: "text" }], [], [{}])).toBe(false)
  })
})
