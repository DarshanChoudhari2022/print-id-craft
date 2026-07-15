# PDF Photo Cover-Fit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make dynamically generated PDF cards use the same cover-fit, top-aligned student-photo placement as the JPG template preview without changing data, templates, page layout, or non-PDF exports.

**Architecture:** Add a pure geometry helper for cover-fit placement and use it in the live preview and the PDF card-rendering path. Keep `renderIdCard`'s default contain-fit behaviour, and pass `"cover"` only from the `PDF_PRINT` branch so existing JPG and BMP callers are unchanged.

**Tech Stack:** TypeScript, React canvas rendering, Next.js, Vitest.

## Global Constraints

- Photo mappings remain dynamic and continue using saved position, width, height, corner radius, and border values.
- Do not add Nikos-specific school, template, student, or dimension values.
- Do not change student records, stored photos, school records, template mappings, or database contents.
- Do not change PDF sheet size, card size, grid placement, text rendering, flags, JPG export, BMP export, or SVG export behaviour.
- Do not run database commands or migrations.

---

### Task 1: Add Tested Cover-Fit Geometry

**Files:**
- Create: `src/lib/card-photo-placement.ts`
- Create: `src/__tests__/unit/card-photo-placement.test.ts`

**Interfaces:**
- Produces: `getCoverPhotoPlacement(sourceWidth, sourceHeight, boxX, boxY, boxWidth, boxHeight): PhotoPlacement`
- Produces: `PhotoPlacement` with numeric `dx`, `dy`, `dw`, and `dh` fields for canvas `drawImage`.

- [ ] **Step 1: Write the failing geometry tests**

```ts
import { describe, expect, it } from "vitest"
import { getCoverPhotoPlacement } from "@/lib/card-photo-placement"

describe("getCoverPhotoPlacement", () => {
  it("fills a wider box with a tall photo and aligns overflow to the top", () => {
    expect(getCoverPhotoPlacement(300, 600, 10, 20, 200, 200)).toEqual({
      dx: 10,
      dy: 20,
      dw: 200,
      dh: 400,
    })
  })

  it("fills a tall box with a wide photo and centers horizontal overflow", () => {
    expect(getCoverPhotoPlacement(600, 300, 10, 20, 100, 200)).toEqual({
      dx: -140,
      dy: 20,
      dw: 400,
      dh: 200,
    })
  })

  it("matches the mapped rectangle when aspect ratios are equal", () => {
    expect(getCoverPhotoPlacement(400, 200, 10, 20, 200, 100)).toEqual({
      dx: 10,
      dy: 20,
      dw: 200,
      dh: 100,
    })
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/__tests__/unit/card-photo-placement.test.ts`

Expected: FAIL because `@/lib/card-photo-placement` does not exist.

- [ ] **Step 3: Implement the minimal pure helper**

```ts
export type PhotoPlacement = {
  dx: number
  dy: number
  dw: number
  dh: number
}

export function getCoverPhotoPlacement(
  sourceWidth: number,
  sourceHeight: number,
  boxX: number,
  boxY: number,
  boxWidth: number,
  boxHeight: number,
): PhotoPlacement {
  const photoAspect = sourceWidth / sourceHeight
  const boxAspect = boxWidth / boxHeight

  if (photoAspect < boxAspect) {
    return {
      dx: boxX,
      dy: boxY,
      dw: boxWidth,
      dh: boxWidth / photoAspect,
    }
  }

  const dw = boxHeight * photoAspect
  return {
    dx: boxX + (boxWidth - dw) / 2,
    dy: boxY,
    dw,
    dh: boxHeight,
  }
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/__tests__/unit/card-photo-placement.test.ts`

Expected: 3 tests pass.

- [ ] **Step 5: Commit the geometry helper and tests**

```bash
git add src/lib/card-photo-placement.ts src/__tests__/unit/card-photo-placement.test.ts
git commit -m "Add card photo cover-fit geometry"
```

### Task 2: Make PDF Rendering Match Preview

**Files:**
- Modify: `src/components/JpgCardPreview.tsx:380-400`
- Modify: `src/components/BatchGenerator.tsx:378-445`
- Modify: `src/components/BatchGenerator.tsx:1370-1390`
- Create: `src/__tests__/unit/pdf-photo-cover-fit.test.ts`

**Interfaces:**
- Consumes: `getCoverPhotoPlacement(...)` from Task 1.
- Adds: `type PhotoFit = "contain" | "cover"` in `BatchGenerator.tsx`.
- Changes: `renderIdCard(..., cardHeightMm?: number, photoFit: PhotoFit = "contain")`.

- [ ] **Step 1: Write the failing PDF wiring regression test**

```ts
import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

describe("PDF card photo fit wiring", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "src/components/BatchGenerator.tsx"),
    "utf8",
  )

  it("keeps contain as the raster renderer default", () => {
    expect(source).toMatch(/photoFit:\s*PhotoFit\s*=\s*"contain"/)
  })

  it("requests cover-fit from the PDF print path", () => {
    expect(source).toMatch(
      /if \(outputFormat === "PDF_PRINT"\)[\s\S]*?studentTemplate\.cardHeightMm,\s*"cover",\s*\)/,
    )
  })
})
```

- [ ] **Step 2: Run the wiring test and verify RED**

Run: `npm test -- src/__tests__/unit/pdf-photo-cover-fit.test.ts`

Expected: 2 tests fail because `renderIdCard` has no photo-fit option and the PDF caller does not pass `"cover"`.

- [ ] **Step 3: Replace duplicated preview cover math with the helper**

Import `getCoverPhotoPlacement` in `JpgCardPreview.tsx`. Replace the live preview's local aspect-ratio calculation with:

```ts
const { dx, dy, dw, dh } = getCoverPhotoPlacement(
  photoImg.naturalWidth,
  photoImg.naturalHeight,
  fx,
  fy,
  fw,
  fh,
)
```

Keep the existing rounded clip path, `drawImage`, fallback, and border code unchanged.

- [ ] **Step 4: Add the explicit fit option to the raster renderer**

Import `getCoverPhotoPlacement` in `BatchGenerator.tsx`, define `type PhotoFit = "contain" | "cover"`, and append this defaulted parameter to `renderIdCard`:

```ts
photoFit: PhotoFit = "contain",
```

Inside the photo branch, retain the current contain calculation for the default path. For cover mode, use:

```ts
if (photoFit === "cover") {
  ;({ dx, dy, dw, dh } = getCoverPhotoPlacement(
    photoImg.naturalWidth,
    photoImg.naturalHeight,
    fx,
    fy,
    fw,
    fh,
  ))
} else if (photoAspect > boxAspect) {
  dw = fw
  dh = fw / photoAspect
  dx = fx
  dy = fy + (fh - dh) / 2
} else {
  dh = fh
  dw = fh * photoAspect
  dx = fx + (fw - dw) / 2
  dy = fy
}
```

Keep the existing clipping, border, image loading, and all non-photo rendering unchanged.

- [ ] **Step 5: Request cover-fit only in the PDF print branch**

Append `"cover"` to both PDF `renderIdCard` calls, after `studentTemplate.cardHeightMm`:

```ts
const frontDataUrl = await renderIdCard(
  studentTemplate.templateImageUrl,
  studentTemplate.fieldMappings,
  student,
  getFlagUrl(student),
  studentTemplate.cardWidthMm,
  studentTemplate.cardHeightMm,
  "cover",
)
```

Apply the same final argument to the PDF back-side call. Do not change the JPG, BMP, CDR preview, or other callers, which will continue using the default contain-fit.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `npm test -- src/__tests__/unit/card-photo-placement.test.ts src/__tests__/unit/pdf-photo-cover-fit.test.ts`

Expected: 5 tests pass.

- [ ] **Step 7: Run complete verification**

Run each command and require exit code 0:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: all Vitest tests pass, lint reports no errors, the Next.js production build succeeds, and `git diff --check` prints no errors.

- [ ] **Step 8: Review scope and commit the implementation**

Confirm `git diff --stat` contains only the two renderer files, the helper, and the two tests. Then:

```bash
git add src/lib/card-photo-placement.ts src/components/JpgCardPreview.tsx src/components/BatchGenerator.tsx src/__tests__/unit/card-photo-placement.test.ts src/__tests__/unit/pdf-photo-cover-fit.test.ts
git commit -m "Match PDF student photos to preview cover fit"
```

- [ ] **Step 9: Push the verified commits to main**

```bash
git push origin main
```

Expected: the remote `main` branch advances to the implementation commit.

