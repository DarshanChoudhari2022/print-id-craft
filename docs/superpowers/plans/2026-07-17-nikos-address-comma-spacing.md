# Nikos Address Comma Spacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render Nikos Public School address fields with exactly one space after every comma while preserving stored data and every other school's output.

**Architecture:** Add a pure school-aware display formatter in `src/lib` and call it only after the existing field resolver has produced card text. Thread the already-available school name into JPG preview, raster batch, and SVG batch rendering so preview and downloaded output use the same rule.

**Tech Stack:** TypeScript, React, Next.js, Vitest

## Global Constraints

- Match `Nikos Public School` case-insensitively after trimming surrounding whitespace.
- Format only fields whose semantic role is `address`.
- Replace a comma plus any following whitespace with `, `.
- Do not mutate `formData`, call an update API, or write to the database.
- Do not change student tables, exports, API responses, non-address fields, or other schools.

---

### Task 1: Pure Nikos Card Display Formatter

**Files:**
- Create: `src/lib/school-card-display.ts`
- Create: `src/__tests__/unit/school-card-display.test.ts`

**Interfaces:**
- Consumes: `getFieldRole(fieldKey: string): FieldRole` and `isPrefixedAddressField(fieldKey: string): boolean` from `src/lib/field-resolver.ts`.
- Produces: `formatSchoolCardFieldValue(schoolName: string | undefined, fieldKey: string, value: string): string`.

- [ ] **Step 1: Write the failing unit tests**

```ts
import { describe, expect, it } from "vitest"
import { formatSchoolCardFieldValue } from "@/lib/school-card-display"

describe("formatSchoolCardFieldValue", () => {
  it("adds one space after each comma in Nikos address fields", () => {
    expect(formatSchoolCardFieldValue(
      "Nikos Public School",
      "address",
      "403,Supreme Savera,lane no.3,sr.no.53/3/3,Shivneri nagar, Kondhwa",
    )).toBe("403, Supreme Savera, lane no.3, sr.no.53/3/3, Shivneri nagar, Kondhwa")
  })

  it("collapses comma-adjacent whitespace without changing other punctuation", () => {
    expect(formatSchoolCardFieldValue(
      "  nIkOs PuBlIc ScHoOl  ",
      "Address",
      "403,  Supreme Savera,\tlane no.3,\nsr.no.53/3/3, Pune-411048.",
    )).toBe("403, Supreme Savera, lane no.3, sr.no.53/3/3, Pune-411048.")
  })

  it("leaves Nikos non-address fields unchanged", () => {
    expect(formatSchoolCardFieldValue(
      "Nikos Public School",
      "name",
      "Hussain,Sajid",
    )).toBe("Hussain,Sajid")
  })

  it("formats Nikos prefixed address placeholders", () => {
    expect(formatSchoolCardFieldValue(
      "Nikos Public School",
      "addressWithLabel",
      "Address: 403,Supreme Savera",
    )).toBe("Address: 403, Supreme Savera")
  })

  it("leaves another school's address unchanged", () => {
    expect(formatSchoolCardFieldValue(
      "Shining Light English School",
      "address",
      "403,Supreme Savera",
    )).toBe("403,Supreme Savera")
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/__tests__/unit/school-card-display.test.ts`

Expected: FAIL because `@/lib/school-card-display` does not exist.

- [ ] **Step 3: Add the minimal pure formatter**

```ts
import { getFieldRole, isPrefixedAddressField } from "@/lib/field-resolver"

const NIKOS_PUBLIC_SCHOOL = "nikos public school"

export function formatSchoolCardFieldValue(
  schoolName: string | undefined,
  fieldKey: string,
  value: string,
): string {
  const isNikos = schoolName?.trim().toLowerCase() === NIKOS_PUBLIC_SCHOOL
  const isAddress = getFieldRole(fieldKey) === "address" || isPrefixedAddressField(fieldKey)
  if (!isNikos || !isAddress) return value
  return value.replace(/,\s*/g, ", ")
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/__tests__/unit/school-card-display.test.ts`

Expected: 5 tests PASS with zero failures.

- [ ] **Step 5: Commit the formatter**

```bash
git add src/lib/school-card-display.ts src/__tests__/unit/school-card-display.test.ts
git commit -m "feat: format Nikos address comma spacing"
```

---

### Task 2: Wire Preview and Batch Renderers

**Files:**
- Modify: `src/components/JpgCardPreview.tsx`
- Modify: `src/app/(manufacturer)/schools/[id]/page.tsx`
- Modify: `src/components/BatchGenerator.tsx`
- Create: `src/__tests__/unit/nikos-address-rendering-wiring.test.ts`

**Interfaces:**
- Consumes: `formatSchoolCardFieldValue(schoolName, fieldKey, value)` from Task 1.
- Produces: optional `schoolName?: string` on `JpgCardPreviewProps` and `generateJpgCard`; `schoolName: string` parameters for internal batch raster/SVG renderers.

- [ ] **Step 1: Write failing source-wiring tests**

```ts
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const previewSource = readFileSync("src/components/JpgCardPreview.tsx", "utf8")
const schoolPageSource = readFileSync("src/app/(manufacturer)/schools/[id]/page.tsx", "utf8")
const batchSource = readFileSync("src/components/BatchGenerator.tsx", "utf8")

describe("Nikos address rendering wiring", () => {
  it("formats resolved JPG preview values with the supplied school name", () => {
    expect(previewSource).toContain("formatSchoolCardFieldValue")
    expect(previewSource).toMatch(/schoolName\?: string/)
    expect(previewSource).toMatch(/formatSchoolCardFieldValue\(schoolName, field\.fieldKey, value\)/)
  })

  it("supplies the manufacturer school's name to both card previews", () => {
    const suppliedNames = schoolPageSource.match(/schoolName=\{school\.name\}/g) || []
    expect(suppliedNames.length).toBeGreaterThanOrEqual(2)
  })

  it("formats both raster and SVG batch values using the batch school name", () => {
    expect(batchSource).toContain("formatSchoolCardFieldValue")
    const formattedValues = batchSource.match(/formatSchoolCardFieldValue\(schoolName, field\.fieldKey,/g) || []
    expect(formattedValues.length).toBeGreaterThanOrEqual(2)
  })
})
```

- [ ] **Step 2: Run the wiring test and verify RED**

Run: `npm test -- src/__tests__/unit/nikos-address-rendering-wiring.test.ts`

Expected: FAIL because the formatter is not imported or called by the renderers.

- [ ] **Step 3: Wire the JPG preview renderer**

In `src/components/JpgCardPreview.tsx`:

```ts
import { formatSchoolCardFieldValue } from "@/lib/school-card-display"
```

Add `schoolName?: string` to the existing `JpgCardPreviewProps` type.

Destructure `schoolName`, include it in the render callback dependency list, and format each resolved value before date/text transformations:

```ts
let value = resolveCardFieldValue(formData, field.fieldKey, hasDivisionPlaceholder)
value = formatSchoolCardFieldValue(schoolName, field.fieldKey, value)
```

Add `schoolName?: string` to `generateJpgCard` after its existing optional parameters and apply the same formatter to its resolved value before rendering.

- [ ] **Step 4: Supply the school name in manufacturer previews**

In both front and back `JpgCardPreview` instances in `src/app/(manufacturer)/schools/[id]/page.tsx`, add:

```tsx
schoolName={school.name}
```

- [ ] **Step 5: Wire raster and SVG batch rendering**

In `src/components/BatchGenerator.tsx`, import the helper and add `schoolName: string` as the final parameter of `renderIdCard` and `renderIdCardSvg`. Immediately after resolving card text in each function, format it before trimming or applying other display transformations:

```ts
const formattedValue = formatSchoolCardFieldValue(
  schoolName,
  field.fieldKey,
  String(val || ""),
)
let value = formattedValue.trim()
```

For the SVG path, use `const value = formattedValue.trim()`. Pass the component's existing `schoolName` to every `renderIdCard(...)` and `renderIdCardSvg(...)` call, including front, back, preview, PDF, BMP, JPEG, and CDR paths.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `npm test -- src/__tests__/unit/school-card-display.test.ts src/__tests__/unit/nikos-address-rendering-wiring.test.ts`

Expected: 8 tests PASS with zero failures.

- [ ] **Step 7: Run regression verification**

Run: `npm test`

Expected: all Vitest suites PASS with zero failures.

Run: `npm run lint`

Expected: exit code 0 with no ESLint errors.

Run: `npm run build`

Expected: exit code 0 and a successful Next.js production build.

- [ ] **Step 8: Commit the rendering integration**

```bash
git add src/components/JpgCardPreview.tsx "src/app/(manufacturer)/schools/[id]/page.tsx" src/components/BatchGenerator.tsx src/__tests__/unit/nikos-address-rendering-wiring.test.ts
git commit -m "feat: apply Nikos address spacing to card output"
```
