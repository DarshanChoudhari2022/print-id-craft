# Class and Division Generation Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe cascading Section, Class/Grade, and Division filters to every ID-card generation format and include the selected scope in download filenames.

**Architecture:** Put alias-compatible scope extraction, option construction, exact filtering, and filename naming in a pure shared module. Extend the existing authorized generation GET route with a read-only filter-options mode and optional generation filters, then wire `BatchGenerator` to cascading controls and the existing PDF/JPEG/BMP/CDR render paths.

**Tech Stack:** TypeScript, React, Next.js App Router, Prisma, Vitest

## Global Constraints

- No database migration, schema edit, student update, template update, or storage mutation.
- Preserve All Sections / All Classes / All Divisions behavior.
- Keep filtering school-, status-, and manufacturer-scoped.
- Apply the selected scope to PDF, JPEG, BMP, and CDR/SVG generation.
- Clear invalid downstream selections when an upstream selection changes.

---

### Task 1: Shared generation-scope logic

**Files:**
- Create: `src/lib/generation-scope.ts`
- Create: `src/__tests__/unit/generation-scope.test.ts`

**Interfaces:**
- Produces: `getGenerationStudentScope(formData)`, `buildGenerationFilterOptions(students)`, `filterStudentsByGenerationScope(students, classGrade?, division?)`, and `buildGenerationScopeName(schoolName, sectionName?, classGrade?, division?)`.
- Consumes: `resolveClassDisplayValue` and `resolveDivisionDisplayValue` from `src/lib/section-class.ts`.

- [ ] **Step 1: Write failing tests**

Test canonical and legacy class/division aliases, case-insensitive exact matching, natural-sorted distinct options with counts, dependent divisions, unfiltered behavior, and non-duplicated scope names.

```ts
expect(getGenerationStudentScope({ classGrade: "III", division: "A" }))
  .toEqual({ classGrade: "III", division: "A" })
expect(getGenerationStudentScope({ class: "IV - B" }))
  .toEqual({ classGrade: "IV", division: "B" })
expect(filterStudentsByGenerationScope(students, "iii", "a")).toHaveLength(1)
expect(buildGenerationScopeName("Nikos Public School", "Nikos Public School", "III", "A"))
  .toBe("Nikos Public School-III-A")
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/__tests__/unit/generation-scope.test.ts`

Expected: FAIL because `@/lib/generation-scope` does not exist.

- [ ] **Step 3: Implement the pure module**

Use `resolveClassDisplayValue(formData, true)` and `resolveDivisionDisplayValue(formData, true)`, normalize comparison with trimmed lowercase alphanumerics, preserve first-seen display casing, count options, naturally sort them, and omit a section name equal to the school name from filenames.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- src/__tests__/unit/generation-scope.test.ts`

Expected: all generation-scope tests PASS.

```bash
git add src/lib/generation-scope.ts src/__tests__/unit/generation-scope.test.ts
git commit -m "Add shared generation scope filters"
```

### Task 2: Read-only filter options and exact API filtering

**Files:**
- Modify: `src/app/api/schools/[id]/generate/route.ts`
- Create: `src/__tests__/unit/generation-filter-api-wiring.test.ts`

**Interfaces:**
- Consumes: shared generation-scope functions from Task 1.
- Produces: `GET .../generate?mode=filters&status=APPROVED&classId=...` with `{ classes, divisionsByClass }`, plus optional `classGrade` and `division` generation filters.

- [ ] **Step 1: Write the failing wiring test**

Require the route to parse `mode`, `classGrade`, and `division`, call `buildGenerationFilterOptions` for filter mode, and call `filterStudentsByGenerationScope` before the empty-result check and render-data mapping.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/__tests__/unit/generation-filter-api-wiring.test.ts`

Expected: FAIL because the route lacks option and filtering wiring.

- [ ] **Step 3: Implement the API behavior**

Build the existing `{ schoolId, status, optional classId }` Prisma scope first. For `mode=filters`, select only `formData`, build options, and return without template lookup. For generation, retain the existing student query, filter the returned students exactly by class/grade and division, use the filtered list for not-found handling and render data, and name the active scope in the error message.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- src/__tests__/unit/generation-scope.test.ts src/__tests__/unit/generation-filter-api-wiring.test.ts`

Expected: all focused API and scope tests PASS.

```bash
git add src/app/api/schools/[id]/generate/route.ts src/__tests__/unit/generation-filter-api-wiring.test.ts
git commit -m "Filter generation by class and division"
```

### Task 3: Cascading generator controls and scoped output names

**Files:**
- Modify: `src/components/BatchGenerator.tsx`
- Create: `src/__tests__/unit/generation-filter-ui-wiring.test.ts`

**Interfaces:**
- Consumes: the Task 2 filter-options response and `buildGenerationScopeName`.
- Produces: Section, Class/Grade, and Division controls; scoped generation query parameters; scoped PDF/JPEG/BMP/CDR filenames.

- [ ] **Step 1: Write the failing UI wiring test**

Require `selectedClassGrade`, `selectedDivision`, `mode=filters`, generation query parameters, labels `Section`, `Class/Grade`, and `Division`, reset behavior, and `buildGenerationScopeName` usage.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/__tests__/unit/generation-filter-ui-wiring.test.ts`

Expected: FAIL because cascading controls and scope wiring are absent.

- [ ] **Step 3: Implement cascading state and loading**

Add typed filter-option state. Fetch options whenever school, selected section, or status changes using an `AbortController`. Reset class and division when section/status changes; reset division when class changes. Disable Class/Grade while loading or when empty, and disable Division until a class is selected.

- [ ] **Step 4: Apply scope to generation and filenames**

Send `classGrade` and `division` with the generation request. Build the scope name once from school, selected section, class, and division. Use it for PDF `schoolName`, JPEG/CDR ZIP names, and BMP page names. Clear staged previews/downloads whenever a scope control changes.

- [ ] **Step 5: Run focused tests and full verification**

Run: `npm test -- src/__tests__/unit/generation-scope.test.ts src/__tests__/unit/generation-filter-api-wiring.test.ts src/__tests__/unit/generation-filter-ui-wiring.test.ts`

Expected: all focused tests PASS.

Run: `npm test && npm run lint && npm run build && git diff --check`

Expected: full tests, lint, production build, and diff check all exit successfully.

- [ ] **Step 6: Commit**

```bash
git add src/components/BatchGenerator.tsx src/__tests__/unit/generation-filter-ui-wiring.test.ts
git commit -m "Add cascading generation scope controls"
```

### Task 4: Final committed-state verification and deployment

**Files:**
- Verify only; no additional production files expected.

- [ ] **Step 1: Verify the committed state**

Run: `npm test && npm run lint && npm run build && git diff --check`

Expected: zero failures and a clean working tree.

- [ ] **Step 2: Push main and verify synchronization**

```bash
git push origin main
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
```

Expected: local and remote `main` hashes match.
