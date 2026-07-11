# Crop Existing Teacher Photo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a button beside Change Photo that opens the stored student photo directly in the existing crop workflow.

**Architecture:** Extend the pure teacher photo state transition module with an initializer and mode-aware cancellation result. `TeacherPhotoEditor` consumes that state, while the dashboard chooses either replacement or existing-photo mode. Existing crop, background processing, upload, and save behavior remain unchanged.

**Tech Stack:** Next.js 16, React 18, TypeScript, Vitest

## Global Constraints

- Show **Crop Existing Photo** only when a current photo exists.
- Do not persist any crop until **Save Changes** succeeds.
- Keep **Change Photo** replacement and camera behavior unchanged.

---

### Task 1: Mode-Aware Teacher Photo State

**Files:**
- Modify: `src/lib/teacher-photo-workflow.ts`
- Test: `src/__tests__/unit/teacher-photo-workflow.test.ts`

**Interfaces:**
- Produces: `TeacherPhotoMode`, `initialTeacherPhotoState(mode, currentPhotoUrl)`, and `cancelTeacherCrop(mode)`.
- Consumed by: `TeacherPhotoEditor` in Task 2.

- [ ] **Step 1: Write failing unit tests**

Add assertions that replacement mode initializes to `{ stage: "select", sourceUrl: "" }`, existing mode initializes to `{ stage: "crop", sourceUrl: currentPhotoUrl }`, and cancellation returns `"select"` for replacement versus `"close"` for existing mode.

- [ ] **Step 2: Verify the tests fail**

Run: `npm test -- src/__tests__/unit/teacher-photo-workflow.test.ts`
Expected: FAIL because the new exports do not exist.

- [ ] **Step 3: Add the minimal state helpers**

Add the mode union and pure initializer/cancellation functions without changing existing stage transitions.

- [ ] **Step 4: Verify focused tests pass**

Run: `npm test -- src/__tests__/unit/teacher-photo-workflow.test.ts`
Expected: PASS.

### Task 2: Direct Crop UI Entry

**Files:**
- Modify: `src/components/TeacherPhotoEditor.tsx`
- Modify: `src/app/teacher/dashboard/page.tsx`

**Interfaces:**
- Consumes: `TeacherPhotoMode`, `initialTeacherPhotoState`, and `cancelTeacherCrop` from Task 1.
- Produces: `TeacherPhotoEditor` prop `mode: TeacherPhotoMode` and the visible **Crop Existing Photo** action.

- [ ] **Step 1: Initialize the editor from its mode**

Add a required `mode` prop. Initialize `stage` and `sourceUrl` from `initialTeacherPhotoState(mode, currentPhotoUrl)`. When cancelling the crop, close direct-existing mode and return replacement mode to selection.

- [ ] **Step 2: Add the dashboard action**

Track the requested editor mode in dashboard state. Make **Change Photo** open replacement mode. When `editingStudent.photoUrl` exists, render **Crop Existing Photo** beside it and open existing-photo mode.

- [ ] **Step 3: Verify types and focused behavior**

Run: `npx tsc --noEmit`
Expected: exit 0.

Run: `npm test -- src/__tests__/unit/teacher-photo-workflow.test.ts`
Expected: PASS.

### Task 3: Regression Verification

**Files:**
- Verify only.

**Interfaces:**
- Consumes the complete feature from Tasks 1 and 2.
- Produces a verified implementation ready to commit.

- [ ] **Step 1: Run full checks**

Run: `npm test`
Expected: all tests pass.

Run: `npm run lint`
Expected: exit 0 with no lint errors.

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 2: Inspect the final diff and commit**

Run `git diff --check` and inspect the changed files. Commit the plan, tests, and implementation with message `Add crop existing teacher photo option`.
