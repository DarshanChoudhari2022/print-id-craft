# Production Photo AI Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `Student.photoAiRunCount` to production and ensure future Prisma migrations deploy before Vercel builds.

**Architecture:** Deploy the checked-in additive migration through Prisma's production migration command. Add a tested Vercel build hook and narrow the teacher edit authorization projection so rolling schema deployments cannot break authorization lookups.

**Tech Stack:** PostgreSQL, Prisma 5, Vercel, Next.js 16, Vitest 4

## Global Constraints

- Do not print database credentials or student records.
- Apply only checked-in pending migrations.
- Preserve all existing student data and authorization filters.
- Push the verified fix to `main`.

---

### Task 1: Deploy and verify the production migration

**Files:**
- Existing migration: `prisma/migrations/20260710180000_add_photo_ai_run_count/migration.sql`

- [x] **Step 1: Check migration state**

Run: `npx prisma migrate status`

Expected: the database is reachable and the photo AI migration is reported pending, or Prisma reports a compatible already-applied state.

- [x] **Step 2: Apply checked-in pending migrations**

Run: `npm run db:migrate:deploy`

Expected: Prisma applies pending migrations successfully without resetting or deleting data.

- [x] **Step 3: Verify migration state**

Run: `npx prisma migrate status`

Expected: `Database schema is up to date!`

### Task 2: Test and add automatic Vercel migration deployment

**Files:**
- Create: `src/__tests__/unit/deployment-config.test.ts`
- Modify: `vercel.json`

- [x] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

it("deploys Prisma migrations before the Vercel application build", () => {
  const config = JSON.parse(readFileSync(resolve("vercel.json"), "utf8"))
  expect(config.buildCommand).toBe("npm run db:migrate:deploy && npm run build")
})
```

- [x] **Step 2: Verify RED**

Run: `npm test -- src/__tests__/unit/deployment-config.test.ts`

Expected: FAIL because the current build command is `npm run build`.

- [x] **Step 3: Update Vercel configuration**

```json
"buildCommand": "npm run db:migrate:deploy && npm run build"
```

- [x] **Step 4: Verify GREEN**

Run: `npm test -- src/__tests__/unit/deployment-config.test.ts`

Expected: PASS.

### Task 3: Harden teacher edit authorization lookup

**Files:**
- Modify: `src/lib/teacher-student-edit.ts`
- Modify: `src/__tests__/unit/teacher-student-edit.test.ts`
- Modify: `src/app/api/teacher/students/[id]/edit/route.ts`

**Interfaces:**
- Produces: `TEACHER_EDIT_AUTH_SELECT = { id: true, classId: true } as const`.

- [x] **Step 1: Write the failing projection test**

```ts
expect(TEACHER_EDIT_AUTH_SELECT).toEqual({ id: true, classId: true })
expect(TEACHER_EDIT_AUTH_SELECT).not.toHaveProperty("photoAiRunCount")
```

- [x] **Step 2: Verify RED**

Run: `npm test -- src/__tests__/unit/teacher-student-edit.test.ts`

Expected: FAIL because the projection is not exported.

- [x] **Step 3: Add and use the projection**

```ts
export const TEACHER_EDIT_AUTH_SELECT = { id: true, classId: true } as const

const student = await prisma.student.findFirst({
  where: whereClause,
  select: TEACHER_EDIT_AUTH_SELECT,
})
```

- [x] **Step 4: Verify and deliver**

Run: `npm test`

Run: `npx tsc --noEmit`

Run: `npm run lint`

Run: `npm run build`

Expected: all commands exit zero. Then commit with `Deploy photo AI database column` and push `main`.
