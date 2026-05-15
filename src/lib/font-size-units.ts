/**
 * Font-size unit handling.
 *
 * Historically `field.fontSize` was stored in "editor pixels at a 600-px
 * reference card width". This made the value meaningless to the user
 * (size 10 in our picker rendered as ~4 pt on the printed card) and
 * caused mismatches between editor preview, on-screen card preview,
 * and the printed PDF.
 *
 * Going forward, `field.fontSize` is stored in **typographic points
 * (pt)** so the value matches what the user sees in Word / Photoshop:
 * size 10 = 10 pt, size 22 = 22 pt, etc.
 *
 * Migration: legacy templates have all their stored fontSize values
 * multiplied by `LEGACY_TO_PT` so they render identically to before
 * the unit change. The migration is one-shot per template, gated by
 * `template.printConfig.fontSizeUnit === "pt"`.
 *
 * Render formula (same in every renderer + the editor):
 *
 *     pxPerPt = canvasW * 25.4 / (cardWidthMm * 72)
 *     renderedPx = fontSize_pt * pxPerPt
 *
 * For a standard CR-80 card (85.6 mm) at 300 DPI canvas:
 *     pxPerPt = 1011 * 25.4 / (85.6 * 72) = 4.167 px/pt
 *     fontSize 10 pt → 41.7 print px ≈ 10 pt on paper ✓
 */

/** Convert pt → display pixels for a given canvas width + card width. */
export function ptToPx(fontSizePt: number, canvasW: number, cardWidthMm: number): number {
  if (!fontSizePt || fontSizePt <= 0 || !canvasW || !cardWidthMm) return 0
  return (fontSizePt * canvasW * 25.4) / (cardWidthMm * 72)
}

/**
 * Conversion factor from the legacy "editor px @ 600 ref, 85.6 mm
 * card" unit into typographic points.
 *
 *   1 legacy unit
 *     = 1 px at 600-px reference
 *     = (85.6 mm / 600) mm
 *     = 0.14267 mm
 *     = 0.14267 / 25.4 inch
 *     = 0.14267 / 25.4 * 72 pt
 *     = 0.40441 pt
 *
 * Templates authored on non-CR-80 cards are slightly off after
 * migration but the visual difference is < 5% for common ID sizes
 * and the user can re-tune. We intentionally pick a single constant
 * here rather than back-computing from each template's card size
 * because the historical authoring resolution wasn't recorded.
 */
export const LEGACY_TO_PT = 0.40441

/** Walk an array of layout / field-mapping items and multiply every
 *  `fontSize` by `multiplier`. Mutation-free — returns a new array. */
function rescaleFontSizes<T extends Record<string, any>>(items: T[] | undefined | null, multiplier: number): T[] {
  if (!Array.isArray(items)) return []
  return items.map((it) => {
    if (!it || typeof it !== "object") return it
    const next: any = { ...it }
    if (typeof next.fontSize === "number" && next.fontSize > 0) {
      next.fontSize = Math.round(next.fontSize * multiplier * 100) / 100
    }
    return next as T
  })
}

/**
 * Migrate a template object in place so its fontSize values are in pt.
 * No-op if `printConfig.fontSizeUnit === "pt"` already.
 *
 * Returns `{ migrated, data }` — `migrated` indicates whether the
 * fontSizes were rescaled. Callers should persist `data` when
 * `migrated` is true so the migration runs only once.
 */
export function migrateTemplateToPt(template: {
  frontLayout?: unknown
  backLayout?: unknown
  fieldMappings?: unknown
  backFieldMappings?: unknown
  printConfig?: unknown
} | null) {
  if (!template) return { migrated: false, data: template }

  const pc = (template.printConfig as Record<string, unknown> | null) || {}
  if (pc?.fontSizeUnit === "pt") {
    return { migrated: false, data: template }
  }

  const next = {
    ...template,
    frontLayout: rescaleFontSizes(template.frontLayout as any[], LEGACY_TO_PT),
    backLayout: rescaleFontSizes(template.backLayout as any[], LEGACY_TO_PT),
    fieldMappings: rescaleFontSizes(template.fieldMappings as any[], LEGACY_TO_PT),
    backFieldMappings: rescaleFontSizes(template.backFieldMappings as any[], LEGACY_TO_PT),
    printConfig: { ...pc, fontSizeUnit: "pt" },
  }
  return { migrated: true, data: next }
}
