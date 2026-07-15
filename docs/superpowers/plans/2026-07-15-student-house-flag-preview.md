# Student House Flag Preview Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load and render a student's matching House flag whenever any template actually used in a generation run contains a flag placeholder.

**Architecture:** Add one pure helper to the existing House-flag module that inspects fallback and per-student front/back mappings. Wire `BatchGenerator` to use that result for catalogue loading and let the existing resolver return `undefined` naturally when no match exists.

**Tech Stack:** TypeScript, React, Next.js, Vitest, Canvas rendering

## Global Constraints

- Do not change database schema or stored records.
- Do not mutate templates, students, or storage.
- Preserve behavior for schools without flag placeholders.
- Apply the resolved flag consistently to previews, PDF, JPEG, BMP, and CDR/SVG.

---

### Task 1: Detect flags in every active student template

**Files:**
- Modify: `src/lib/house-flags.ts`
- Test: `src/__tests__/unit/house-flags.test.ts`

**Interfaces:**
- Consumes: fallback front/back mapping arrays and generation students with optional resolved templates.
- Produces: `generationUsesHouseFlags(fallbackFront, fallbackBack, students): boolean`.

- [ ] **Step 1: Write the failing tests**

Add tests proving an assigned student's front or back template triggers detection even when fallback mappings contain no flag, while a run without flag mappings returns `false`.

```ts
expect(generationUsesHouseFlags([], [], [{
  template: { fieldMappings: [{ type: "flag" }], backFieldMappings: [] },
}])).toBe(true)

expect(generationUsesHouseFlags([], [], [{
  template: { fieldMappings: [], backFieldMappings: [{ type: "flag" }] },
}])).toBe(true)

expect(generationUsesHouseFlags([{ type: "text" }], [], [{}])).toBe(false)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/__tests__/unit/house-flags.test.ts`

Expected: FAIL because `generationUsesHouseFlags` is not exported.

- [ ] **Step 3: Implement the pure detector**

Add mapping and student-template types plus a function that combines fallback and per-student front/back mappings and returns `true` when any mapping has `type === "flag"`.

```ts
export function generationUsesHouseFlags(
  fallbackFront: HouseFlagMapping[] = [],
  fallbackBack: HouseFlagMapping[] = [],
  students: HouseFlagTemplateStudent[] = [],
): boolean {
  return [
    fallbackFront,
    fallbackBack,
    ...students.flatMap(student => [
      student.template?.fieldMappings || [],
      student.template?.backFieldMappings || [],
    ]),
  ].some(mappings => mappings.some(mapping => mapping?.type === "flag"))
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- src/__tests__/unit/house-flags.test.ts`

Expected: all House-flag utility tests PASS.

- [ ] **Step 5: Commit the detector**

```bash
git add src/lib/house-flags.ts src/__tests__/unit/house-flags.test.ts
git commit -m "Detect flags across active student templates"
```

### Task 2: Wire active-template detection into generation previews and output

**Files:**
- Modify: `src/components/BatchGenerator.tsx`
- Test: `src/__tests__/unit/house-flag-ui-wiring.test.ts`

**Interfaces:**
- Consumes: `generationUsesHouseFlags` and `resolveHouseImageUrl` from `@/lib/house-flags`.
- Produces: catalogue loading and per-student flag URLs for all existing render paths.

- [ ] **Step 1: Write the failing wiring test**

Require `BatchGenerator` to call the detector with fallback mappings and returned students, and prohibit the obsolete initial-template early return.

```ts
expect(source).toContain(
  "generationUsesHouseFlags(fieldMappings, backFieldMappings || [], students)",
)
expect(source).not.toContain("if (!hasFlagField) return undefined")
```

- [ ] **Step 2: Run the focused wiring test and verify RED**

Run: `npm test -- src/__tests__/unit/house-flag-ui-wiring.test.ts`

Expected: FAIL because the detector is not wired and the obsolete guard remains.

- [ ] **Step 3: Implement the minimal generator correction**

Import `generationUsesHouseFlags`, compute `hasFlagField` after the API returns `students`, and remove the obsolete early return from `getFlagUrl`. Preserve the existing school-scoped flag fetch and `resolveHouseImageUrl` call.

- [ ] **Step 4: Run focused regression tests**

Run: `npm test -- src/__tests__/unit/house-flags.test.ts src/__tests__/unit/house-flag-ui-wiring.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 5: Run full verification**

Run: `npm test && npm run lint && npm run build && git diff --check`

Expected: test suite, lint, build, and diff check all exit successfully.

- [ ] **Step 6: Commit the wiring correction**

```bash
git add src/components/BatchGenerator.tsx src/__tests__/unit/house-flag-ui-wiring.test.ts
git commit -m "Show assigned House flags in generated previews"
```
