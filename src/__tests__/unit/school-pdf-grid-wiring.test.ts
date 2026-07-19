import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"

import { calculateGridLayout } from "@/lib/pdf-layout"

describe("school PDF grid", () => {
  it("fits Dnyanvardhini's saved 100x58 mm cards in a 2x5 A4 portrait grid", () => {
    const layout = calculateGridLayout(210, 297, 100, 58, 0, 0, 10)

    expect(layout.cols).toBe(2)
    expect(layout.rows).toBe(5)
    expect(layout.cardsPerPage).toBe(10)
    expect(layout.totalPages).toBe(1)
  })

  it("only enables paired FRONT/BACK sheets when cards have a back side", () => {
    const source = readFileSync(
      resolve("src/components/BatchGenerator.tsx"),
      "utf8",
    )

    expect(source).toContain(
      "pairSidesPerEmployee: chunk.some(card => Boolean(card.backDataUrl))",
    )
    expect(source).toContain("const pairedLayout = hasBackSide")
    expect(source).toContain(
      'const pairedLayout = fmt === "PDF_PRINT" && hasBackSide',
    )
    expect(source).toContain("pairedSides: Boolean(pairedLayout)")
  })
})
