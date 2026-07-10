# Teacher Students Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep every submitted student visible during a database rollout mismatch and place Division beside Class as a filter instead of a table column.

**Architecture:** Add a small query compatibility helper that retries only Prisma missing-column failures. Use it in the teacher dashboard API with full and compatibility student queries, then simplify the Students table columns while preserving the existing Division filter.

**Tech Stack:** Next.js 16, TypeScript, Prisma 5, React 18, Vitest 4

## Global Constraints

- All matching submissions must remain visible when filters are clear.
- Retry only Prisma missing-column failures; unrelated database errors must propagate.
- Preserve the AI-run UI and default its count to zero only on compatibility rows.
- Keep Division immediately after Class in the filter row and remove Division from the table.

---

### Task 1: Missing-column query compatibility

**Files:**
- Create: `src/lib/prisma-query-compat.ts`
- Create: `src/__tests__/unit/prisma-query-compat.test.ts`
- Modify: `src/app/api/teacher/dashboard/route.ts`

**Interfaces:**
- Produces: `runWithMissingColumnFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T>`
- Consumes: Prisma errors exposing `code`, specifically `P2022` for a missing database column.

- [x] **Step 1: Write the failing tests**

```ts
it("uses the compatibility query when Prisma reports a missing column", async () => {
  const rows = [{ id: "s1" }, { id: "s2" }]
  await expect(runWithMissingColumnFallback(
    async () => { throw Object.assign(new Error("missing"), { code: "P2022" }) },
    async () => rows,
  )).resolves.toEqual(rows)
})

it("does not hide unrelated query failures", async () => {
  const error = Object.assign(new Error("connection"), { code: "P1001" })
  await expect(runWithMissingColumnFallback(
    async () => { throw error },
    async () => [],
  )).rejects.toBe(error)
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/__tests__/unit/prisma-query-compat.test.ts`

Expected: FAIL because `@/lib/prisma-query-compat` does not exist.

- [x] **Step 3: Implement the compatibility helper**

```ts
export async function runWithMissingColumnFallback<T>(
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await primary()
  } catch (error) {
    if ((error as { code?: string } | null)?.code !== "P2022") throw error
    return fallback()
  }
}
```

- [x] **Step 4: Use the helper in the dashboard API**

Replace the generic `safeQuery(..., [])` wrapper around the student detail query with `runWithMissingColumnFallback`. The primary query selects `photoAiRunCount`; the fallback query uses the same `where`, ordering, pagination, and fields except `photoAiRunCount`, then maps each row to `{ ...row, photoAiRunCount: 0 }`.

- [x] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- src/__tests__/unit/prisma-query-compat.test.ts src/__tests__/unit/teacher-student-view.test.ts`

Expected: both test files PASS.

### Task 2: Students table layout and full verification

**Files:**
- Modify: `src/app/teacher/dashboard/page.tsx`

**Interfaces:**
- Consumes: existing `uniqueDivisions`, `divisionFilter`, and `filtered` values.
- Produces: an eight-column Students table with Division present only in the filter row.

- [x] **Step 1: Add a source-level regression assertion**

Add a test in `src/__tests__/unit/teacher-student-view.test.ts` verifying empty filter values return all fixture students:

```ts
expect(filterTeacherStudents(students, {
  section: "", grade: "", division: "", status: "",
})).toHaveLength(students.length)
```

- [x] **Step 2: Run the test**

Run: `npm test -- src/__tests__/unit/teacher-student-view.test.ts`

Expected: PASS, documenting the required existing behavior before the JSX-only layout change.

- [x] **Step 3: Remove Division from the table**

Delete the `<th>Division</th>` header and the `getStudentDivision(s)` data cell. Change the empty-state `colSpan` from 9 to 8. Keep the Division filter block immediately after the Class filter block.

- [x] **Step 4: Verify the complete change**

Run: `npm test -- src/__tests__/unit/prisma-query-compat.test.ts src/__tests__/unit/teacher-student-view.test.ts`

Run: `npx tsc --noEmit`

Run: `npm run lint`

Expected: all commands exit 0 with no new errors.

- [x] **Step 5: Commit and push**

```bash
git add docs/superpowers/plans/2026-07-10-teacher-students-visibility.md src/lib/prisma-query-compat.ts src/__tests__/unit/prisma-query-compat.test.ts src/__tests__/unit/teacher-student-view.test.ts src/app/api/teacher/dashboard/route.ts src/app/teacher/dashboard/page.tsx
git commit -m "Fix teacher student visibility"
git push
```
