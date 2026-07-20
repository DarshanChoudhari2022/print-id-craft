import { describe, expect, it } from "vitest"

import { fitTextToBoxCanvas } from "@/components/BatchGenerator"

describe("PDF class and division text fitting", () => {
  it("shrinks X - EXTERNAL to one line instead of clipping EXTERNAL", () => {
    let currentFontSize = 0
    const ctx = {
      get font() {
        return `${currentFontSize}px Century Gothic`
      },
      set font(value: string) {
        currentFontSize = Number(value.match(/([\d.]+)px/)?.[1] || 0)
      },
      measureText(text: string) {
        return { width: text.length * currentFontSize * 0.6 }
      },
    } as unknown as CanvasRenderingContext2D

    const result = fitTextToBoxCanvas(
      ctx,
      "X - EXTERNAL",
      241,
      42,
      "Century Gothic",
      "bold",
      685,
      9,
      "wrap",
      "normal",
      58,
    )

    expect(result.lines).toEqual(["X - EXTERNAL"])
    expect(result.fontSize).toBeLessThan(37)
    expect(result.fontSize).toBeGreaterThanOrEqual(42 * 0.28)
  })
})
