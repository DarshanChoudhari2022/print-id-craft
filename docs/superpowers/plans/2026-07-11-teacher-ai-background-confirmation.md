# Teacher AI Background Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent teacher photo cropping from starting paid AI work until the teacher explicitly confirms background processing.

**Architecture:** Add a pure `confirm-ai` workflow stage and events, then render the decision UI in `TeacherPhotoEditor`. `PhotoBgProcessor` remains mounted only for the explicit background stage, preserving its existing behavior after opt-in.

**Tech Stack:** Next.js 16, React 18, TypeScript, Vitest

## Global Constraints

- Apply the confirmation to both replacement and existing-photo crop modes.
- Do not mount `PhotoBgProcessor` before explicit AI opt-in.
- Keep the cropped photo usable without AI processing.

---

### Task 1: Confirmation State Transitions

**Files:**
- Modify: `src/lib/teacher-photo-workflow.ts`
- Test: `src/__tests__/unit/teacher-photo-workflow.test.ts`

- [ ] Add failing tests for crop-to-confirmation, explicit AI opt-in, and back-to-crop transitions.
- [ ] Run `npm test -- src/__tests__/unit/teacher-photo-workflow.test.ts` and confirm expected failures.
- [ ] Add `confirm-ai` and the minimal new events/transitions.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Teacher Confirmation UI

**Files:**
- Modify: `src/components/TeacherPhotoEditor.tsx`

- [ ] Make Apply Crop store the result and advance only to `confirm-ai`.
- [ ] Render the cropped preview with **Use Cropped Photo — No AI**, **Process AI Background**, and **Back to Crop** actions.
- [ ] Return the cropped photo immediately with skipped status for the no-AI action.
- [ ] Mount `PhotoBgProcessor` only after the explicit AI event advances to `background`.
- [ ] Run TypeScript and the focused workflow test.

### Task 3: Full Verification and Delivery

**Files:**
- Verify all changed files and documentation.

- [ ] Run `npm test`, `npm run lint`, and `npm run build`.
- [ ] Run `git diff --check`, inspect the diff, commit, and push `main`.
