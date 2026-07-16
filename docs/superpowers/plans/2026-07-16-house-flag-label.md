# House Flag Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the selected house name beneath its uploaded flag inside the existing flag placeholder in every preview and export format.

**Architecture:** Add a pure shared layout function to `house-flags.ts` that derives the label and image/label regions from student form data and placeholder geometry. Canvas and SVG renderers consume the same geometry, keeping public/manufacturer previews and print exports aligned without changing stored templates or student data.

**Tech Stack:** TypeScript, React, HTML Canvas 2D, SVG, Vitest, Next.js.

## Global Constraints

- The existing flag placeholder position and total size remain unchanged.
- The flag image uses contain-fit in the upper region; the normalized house name is centered and bold in the lower region.
- If a house name exists without an available image, render the label; if no house is selected, render neither.
- Do not change Prisma schema, migrations, student records, template records, or flag uploads.
- Public preview, manufacturer preview, JPEG/PDF generation, and SVG output must agree.

---

### Task 1: Shared flag layout

**Files:**
- Modify: `src/lib/house-flags.ts`
- Test: `src/__tests__/unit/house-flags.test.ts`

**Interfaces:**
- Produces: `getHouseFlagRenderLayout(formData, x, y, width, height): HouseFlagRenderLayout | null`
- `HouseFlagRenderLayout` contains `label`, `imageX`, `imageY`, `imageWidth`, `imageHeight`, `labelX`, `labelY`, `labelWidth`, `labelHeight`, and `fontSize`.

- [ ] **Step 1: Write the failing geometry tests**

```ts
it("places the house label below the flag inside the original placeholder", () => {
  const layout = getHouseFlagRenderLayout({ House: "Red" }, 10, 20, 100, 200)
  expect(layout?.label).toBe("Red")
  expect(layout?.imageY).toBe(20)
  expect(layout!.imageY + layout!.imageHeight).toBeLessThan(layout!.labelY)
  expect(layout!.labelY + layout!.labelHeight).toBeLessThanOrEqual(220)
})

it("returns no layout when the student has no selected house", () => {
  expect(getHouseFlagRenderLayout({}, 0, 0, 100, 100)).toBeNull()
})
```

- [ ] **Step 2: Run the tests and verify the expected missing-export failure**

Run: `npx vitest run src/__tests__/unit/house-flags.test.ts`

Expected: FAIL because `getHouseFlagRenderLayout` is not exported.

- [ ] **Step 3: Implement the shared layout**

```ts
export function getHouseFlagRenderLayout(
  formData: Record<string, string> | null | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
): HouseFlagRenderLayout | null {
  const label = resolveHouseValue(formData)
  if (!label) return null
  const gap = height * 0.03
  const labelHeight = height * 0.2
  const imageHeight = Math.max(0, height - labelHeight - gap)
  const fontSize = Math.max(1, Math.min(labelHeight * 0.68, width / Math.max(label.length * 0.62, 1)))
  return {
    label,
    imageX: x,
    imageY: y,
    imageWidth: width,
    imageHeight,
    labelX: x,
    labelY: y + imageHeight + gap,
    labelWidth: width,
    labelHeight,
    fontSize,
  }
}
```

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `npx vitest run src/__tests__/unit/house-flags.test.ts`

Expected: PASS.

### Task 2: Canvas previews and raster exports

**Files:**
- Modify: `src/components/JpgCardPreview.tsx`
- Modify: `src/components/BatchGenerator.tsx`
- Test: `src/__tests__/unit/house-flag-ui-wiring.test.ts`

**Interfaces:**
- Consumes: `getHouseFlagRenderLayout(...)` from Task 1.
- Produces: matching flag image and label output in browser preview, standalone JPG generation, batch preview, JPEG export, and PDF input canvases.

- [ ] **Step 1: Add failing renderer wiring assertions**

```ts
it.each(["src/components/JpgCardPreview.tsx", "src/components/BatchGenerator.tsx"])(
  "uses the shared flag image-and-label layout in %s",
  file => expect(read(file)).toContain("getHouseFlagRenderLayout"),
)
```

- [ ] **Step 2: Run the wiring test and verify it fails**

Run: `npx vitest run src/__tests__/unit/house-flag-ui-wiring.test.ts`

Expected: FAIL because neither renderer imports the new layout helper.

- [ ] **Step 3: Render image and text in both canvas paths**

For each `field.type === "flag"` branch, calculate the shared layout from the current form data, contain-fit the image within the image region when a URL exists, and always draw the label when the layout exists:

```ts
const flagLayout = getHouseFlagRenderLayout(formData, fx, fy, fw, fh)
if (flagLayout) {
  if (flagImageUrl) drawImageContain(ctx, flagImg, flagLayout.imageX, flagLayout.imageY, flagLayout.imageWidth, flagLayout.imageHeight)
  ctx.save()
  ctx.font = `bold ${flagLayout.fontSize}px ${field.fontFamily || "Arial"}`
  ctx.fillStyle = field.fontColor || "#000000"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(flagLayout.label, flagLayout.labelX + flagLayout.labelWidth / 2, flagLayout.labelY + flagLayout.labelHeight / 2)
  ctx.restore()
}
```

- [ ] **Step 4: Run utility and wiring tests**

Run: `npx vitest run src/__tests__/unit/house-flags.test.ts src/__tests__/unit/house-flag-ui-wiring.test.ts src/__tests__/unit/public-house-flag-preview-wiring.test.ts`

Expected: PASS.

### Task 3: SVG parity and final verification

**Files:**
- Modify: `src/components/BatchGenerator.tsx`
- Test: `src/__tests__/unit/house-flag-ui-wiring.test.ts`

**Interfaces:**
- Consumes: the same shared flag layout from Task 1.
- Produces: SVG `<image>` in the upper region and escaped centered `<text>` in the lower region.

- [ ] **Step 1: Add a failing assertion for SVG label output**

```ts
expect(read("src/components/BatchGenerator.tsx")).toContain("flagLayout.label")
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npx vitest run src/__tests__/unit/house-flag-ui-wiring.test.ts`

Expected: FAIL until the SVG flag branch uses the label.

- [ ] **Step 3: Implement SVG image-and-label rendering**

Use the shared regions, `preserveAspectRatio="xMidYMid meet"`, the existing XML escaping helper, and a centered bold `<text>` node with the calculated font size.

- [ ] **Step 4: Run complete verification**

Run: `npm test`

Expected: all tests pass.

Run: `npm run lint`

Expected: exit code 0.

Run: `npm run build`

Expected: optimized production build exits 0.

Run: `git diff --check && git diff --stat && git status --short --branch`

Expected: no whitespace errors and no Prisma schema, migration, or database files changed.

- [ ] **Step 5: Commit and push**

```bash
git add src/lib/house-flags.ts src/components/JpgCardPreview.tsx src/components/BatchGenerator.tsx src/__tests__/unit/house-flags.test.ts src/__tests__/unit/house-flag-ui-wiring.test.ts docs/superpowers/plans/2026-07-16-house-flag-label.md
git commit -m "show house names below flags"
git push origin main
```
