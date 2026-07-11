# Manufacturer Section Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let manufacturers rename an existing section without changing its related configuration or link.

**Architecture:** Add a small pure helper for rename validation and use it from an inline editor in the manufacturer school page. Submit `{ name }` to the existing section PUT endpoint and update the local class list from the returned record.

**Tech Stack:** Next.js 16, React 18, TypeScript, Vitest, Prisma API routes

## Global Constraints

- Preserve the section ID, link token, students, options, templates, teachers, status, and expiry.
- Trim names and reject empty or unchanged drafts.
- Keep the editor open when saving fails.

---

### Task 1: Rename Validation

**Files:**
- Create: `src/lib/section-name.ts`
- Create: `src/__tests__/unit/section-name.test.ts`

- [ ] Write failing tests for valid, empty, whitespace-only, and unchanged names.
- [ ] Run the focused test and confirm failure because the helper is absent.
- [ ] Implement `prepareSectionRename(currentName, draftName)` returning the trimmed name or a validation result.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Inline Rename Action

**Files:**
- Modify: `src/app/(manufacturer)/schools/[id]/page.tsx`

- [ ] Add state for active section, draft name, and saving state.
- [ ] Add **Edit Name** to each section's actions and open a prefilled inline panel.
- [ ] Save through the existing section PUT endpoint using `{ name }` only.
- [ ] Replace the updated section in local state, close on success, and retain the draft on failure.
- [ ] Add Save and Cancel disabled-state behavior.

### Task 3: Verification and Push

- [ ] Run focused tests and TypeScript.
- [ ] Run the full test suite, lint, and production build.
- [ ] Inspect `git diff --check`, commit, and push `main`.
