import { describe, expect, it } from "vitest"

import {
  calculatePairedCardPageLayout,
  calculatePairedEmployeeSheetLayout,
} from "@/lib/pdf-layout"

describe("paired employee PDF layout", () => {
  it("keeps tall FRONT and BACK cards together side-by-side on A4 landscape", () => {
    const layout = calculatePairedCardPageLayout(297, 210, 58, 100, true)

    expect(layout.arrangement).toBe("horizontal")
    expect(layout.back).toBeDefined()
    expect(layout.front.x).toBeLessThan(layout.back!.x)
    expect(layout.front.y).toBe(layout.back!.y)
    expect(layout.front.x).toBeGreaterThanOrEqual(8)
    expect(layout.back!.x + 58).toBeLessThanOrEqual(297 - 8)
  })

  it("keeps wide FRONT and BACK cards together vertically on A4 portrait", () => {
    const layout = calculatePairedCardPageLayout(210, 297, 100, 58, true)

    expect(layout.arrangement).toBe("vertical")
    expect(layout.back).toBeDefined()
    expect(layout.front.x).toBe(layout.back!.x)
    expect(layout.front.y).toBeLessThan(layout.back!.y)
    expect(layout.front.headerY).toBeGreaterThanOrEqual(8)
    expect(layout.back!.y + 58).toBeLessThanOrEqual(297 - 8)
  })

  it("centers a front-only card without creating a back block", () => {
    const layout = calculatePairedCardPageLayout(210, 297, 58, 100, false)

    expect(layout.arrangement).toBe("front-only")
    expect(layout.back).toBeUndefined()
    expect(layout.front.x).toBe((210 - 58) / 2)
  })

  it("rejects paper that cannot hold both sides at exact physical size", () => {
    expect(() =>
      calculatePairedCardPageLayout(100, 100, 90, 90, true),
    ).toThrow(/Select a larger paper size/)
  })

  it("packs five exact 58×100 mm employee pairs onto A4 landscape", () => {
    const layout = calculatePairedEmployeeSheetLayout(
      297,
      210,
      58,
      100,
      true,
    )

    expect(layout.arrangement).toBe("vertical")
    expect(layout.pairsPerPage).toBe(5)
    expect(layout.placements).toHaveLength(5)

    for (const pair of layout.placements) {
      expect(pair.back).toBeDefined()
      expect(pair.front.x).toBe(pair.back!.x)
      expect(pair.front.y).toBe(5)
      expect(pair.back!.y).toBe(110)
      expect(pair.back!.y + 100).toBeLessThanOrEqual(210)
    }

    expect(layout.placements[0].front.x).toBe(3.5)
    expect(layout.placements[4].front.x + 58).toBe(293.5)
  })

  it("never exceeds the requested five-employee sheet cap", () => {
    const layout = calculatePairedEmployeeSheetLayout(
      420,
      297,
      58,
      100,
      true,
    )

    expect(layout.pairsPerPage).toBe(5)
  })
})
