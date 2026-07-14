# Shining Light Mobile Duplicate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow different Shining Light students to share a parent mobile number without changing existing data or duplicate behavior for other schools.

**Architecture:** Keep the shared fuzzy field resolver unchanged. Add a class-scoped normalization inside `checkDuplicateSubmission`: only for Shining Light class `cmr0fgn1d00037286escfox15`, discard the resolved roll value when it is identical to the resolved mobile value. All remaining fingerprint, exact-name, genuine-roll, and fallback checks continue through the existing code path.

**Tech Stack:** TypeScript, Prisma, Vitest, Next.js 16

## Global Constraints

- Do not update, delete, backfill, or migrate database rows.
- Apply the behavior exception only to class ID `cmr0fgn1d00037286escfox15`.
- Preserve exact-name duplicate protection for Shining Light.
- Preserve all duplicate behavior for every other class.
- Do not refactor unrelated modules.

---

### Task 1: Shining Light duplicate regression

**Files:**
- Create: `src/__tests__/unit/shining-light-mobile-duplicate.test.ts`
- Modify: `src/lib/submit-fields.ts:317-443`

**Interfaces:**
- Consumes: `checkDuplicateSubmission(classId: string, formData: Record<string, string>): Promise<DuplicateCheckResult>`
- Produces: unchanged public function signature and return type.

- [ ] **Step 1: Write the failing sibling regression test**

Create a Vitest test that imports `prisma` and `checkDuplicateSubmission`, resets `student.findFirst` and `student.findMany`, and configures `findFirst` to return an existing student only when the query contains `normalizedRollNo`. Call the function with Shining Light's class ID and `{ name: "Aarav Sunil Choudhari", mobile_no: "+91 8605589062", class: "I - A", division: "A", address: "Wanawadi", dateOfBirth: "07/07/2021" }`. Assert `{ isDuplicate: false }` and assert no query contains `normalizedRollNo`.

- [ ] **Step 2: Verify the regression test fails for the reported reason**

Run:

```bash
npx vitest run src/__tests__/unit/shining-light-mobile-duplicate.test.ts
```

Expected: FAIL because the current resolver produces `normalizedRollNo: "918605589062"` and the mock returns an existing registration.

- [ ] **Step 3: Add the class-scoped false-roll guard**

In `src/lib/submit-fields.ts`, add:

```ts
const SHINING_LIGHT_CLASS_ID = "cmr0fgn1d00037286escfox15"

function isShiningLightMobileMisreadAsRoll(
  classId: string,
  formData: Record<string, string>,
  roll: string
): boolean {
  if (classId !== SHINING_LIGHT_CLASS_ID || !roll) return false
  const mobile = resolveFieldValue(formData, "mobile")
  return !!mobile && normalizeFormValue(roll) === normalizeFormValue(mobile)
}
```

Inside `checkDuplicateSubmission`, rename the extracted roll to `resolvedRoll`, compute `ignoreResolvedRoll`, set `roll` to an empty string when true, and set `indexData.normalizedRollNo` to an empty string only in that case:

```ts
const { name, father, dob, roll: resolvedRoll } = extractIdentityFields(formData)
const indexData = buildStudentIndexData(formData, classId)
const ignoreResolvedRoll = isShiningLightMobileMisreadAsRoll(classId, formData, resolvedRoll)
const roll = ignoreResolvedRoll ? "" : resolvedRoll
if (ignoreResolvedRoll) indexData.normalizedRollNo = ""
```

- [ ] **Step 4: Add preservation tests**

In the same test file, add tests proving:

1. The same Shining Light normalized full name still returns `DUPLICATE_NAME`.
2. A genuine Shining Light `rollno: "55"` distinct from the mobile returns `DUPLICATE_ROLL`.
3. A non-Shining class with the current mobile-as-roll field shape still follows the existing behavior, proving no other class changed.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run src/__tests__/unit/shining-light-mobile-duplicate.test.ts src/__tests__/field-resolver.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Run complete verification**

Run:

```bash
npm test -- --run
npx tsc --noEmit
npm run build
git diff --check
```

Expected: all tests pass, TypeScript exits 0, the production build succeeds, and `git diff --check` produces no errors.

- [ ] **Step 7: Commit and push**

```bash
git add src/__tests__/unit/shining-light-mobile-duplicate.test.ts src/lib/submit-fields.ts docs/superpowers/plans/2026-07-14-shining-light-mobile-duplicate.md
git commit -m "Fix Shining Light sibling duplicate detection"
git push
```
