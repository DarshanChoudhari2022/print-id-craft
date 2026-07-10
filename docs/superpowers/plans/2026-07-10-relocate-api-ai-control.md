# Relocate API AI Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove manual API AI actions from teachers and consolidate API AI as a manufacturer background-processing model.

**Architecture:** Share one manufacturer model-option list across single and batch editors. Extend the existing background-processing client with the `removebg` server model, and let assign-photo atomically increment the API run counter only when that model's preview is successfully saved.

**Tech Stack:** React 18, Next.js 16, TypeScript, Prisma 5, Vitest 4

## Global Constraints

- Teacher automatic photo cleanup remains unchanged.
- Failed previews or saves never overwrite photos or increment counters.
- Manufacturer preview and Apply & Save behavior remains unchanged.
- Create a local commit without pushing.

---

### Task 1: Shared manufacturer API AI model

**Files:**
- Create: `src/lib/manufacturer-bg-models.ts`
- Create: `src/__tests__/unit/manufacturer-bg-models.test.ts`
- Modify: `src/lib/photo-bg-composite-client.ts`
- Modify: `src/components/ManufacturerPhotoBgEditor.tsx`
- Modify: `src/components/ManufacturerBgBatchProcessor.tsx`

- [x] **Step 1: Write a failing model test**

```ts
expect(MANUFACTURER_BG_MODEL_OPTIONS.map((option) => option.value)).toEqual([
  "bria-rmbg2", "gemini", "removebg", "birefnet", "isnet",
])
```

- [x] **Step 2: Verify RED** with `npm test -- src/__tests__/unit/manufacturer-bg-models.test.ts`.
- [x] **Step 3: Export `BgModelChoice` including `"removebg"` and create the shared option labelled `⚡ API AI (Poof/remove.bg)`.
- [x] **Step 4: Add a composited server call** that posts model `removebg` to `/api/photo-bg/remove` and returns its JPEG as a data URL without falling back to another model on failure.
- [x] **Step 5: Use the shared option list** in both manufacturer editors and append `processingModel` to successful assign-photo uploads.
- [x] **Step 6: Verify GREEN** with the focused model test.

### Task 2: Count only saved manufacturer API AI results

**Files:**
- Modify: `src/lib/student-photo-ai.ts`
- Modify: `src/__tests__/unit/student-photo-ai.test.ts`
- Modify: `src/app/api/schools/[id]/students/assign-photo/route.ts`

- [x] **Step 1: Write the failing classification test**

```ts
expect(isApiAiProcessingModel("removebg")).toBe(true)
expect(isApiAiProcessingModel("gemini")).toBe(false)
expect(isApiAiProcessingModel(null)).toBe(false)
```

- [x] **Step 2: Verify RED** with `npm test -- src/__tests__/unit/student-photo-ai.test.ts`.
- [x] **Step 3: Implement `isApiAiProcessingModel`** and read `processingModel` in assign-photo.
- [x] **Step 4: Add `photoAiRunCount: { increment: 1 }`** only when the saved model is `removebg`; keep the returned counter in the response.
- [x] **Step 5: Verify GREEN** with the focused helper test.

### Task 3: Remove standalone API AI controls

**Files:**
- Create: `src/__tests__/unit/api-ai-control-placement.test.ts`
- Modify: `src/app/teacher/dashboard/page.tsx`
- Modify: `src/app/(manufacturer)/schools/[id]/page.tsx`

- [x] **Step 1: Write a failing placement test** that reads both source files and asserts the teacher source does not contain `handleRunPhotoAi` or `API AI`, and the manufacturer page does not contain `handleRunApiPhotoAi`.
- [x] **Step 2: Verify RED** with `npm test -- src/__tests__/unit/api-ai-control-placement.test.ts`.
- [x] **Step 3: Remove teacher state, handler, row button, and detail button** while preserving the photo editor's automatic cleanup.
- [x] **Step 4: Remove manufacturer standalone state, handler, row button, and detail button** while retaining manufacturer-only count text.
- [x] **Step 5: Run full verification:** `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build` must exit zero.
- [ ] **Step 6: Commit** all changes with message `Move API AI control to manufacturer background tools`.
