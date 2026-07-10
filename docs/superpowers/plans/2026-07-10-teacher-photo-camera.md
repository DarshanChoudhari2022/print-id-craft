# Teacher Photo Camera Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix teacher photo updates and add the public form's camera, manual crop, and AI background workflow to Edit Student.

**Architecture:** A focused `TeacherPhotoEditor` composes the existing photo verifier, cropper, and background processor. The dashboard owns upload and persistence, while a small API compatibility helper keeps edit responses working when the optional AI-run counter column is not yet deployed.

**Tech Stack:** Next.js 16, React 18, TypeScript, Prisma 5, Vitest 4

## Global Constraints

- Cropping is never automatic; the teacher must tap **Apply Crop**.
- AI cleanup starts only after manual crop confirmation.
- The existing photo remains unchanged until Save Changes succeeds.
- Camera denial retains file upload and phone-camera fallbacks.
- Only Prisma `P2022` triggers the optional-column compatibility path.

---

### Task 1: Edit API compatibility

**Files:**
- Create: `src/lib/teacher-student-edit.ts`
- Create: `src/__tests__/unit/teacher-student-edit.test.ts`
- Modify: `src/app/api/teacher/students/[id]/edit/route.ts`

**Interfaces:**
- Produces: `updateTeacherStudentWithPhotoAiFallback<T>(fullUpdate, compatibleUpdate): Promise<T & { photoAiRunCount: number }>`.
- Consumes: the existing `runWithMissingColumnFallback` helper.

- [x] **Step 1: Write failing tests** proving `P2022` returns the compatible row with `photoAiRunCount: 0` and `P1001` propagates.

```ts
await expect(updateTeacherStudentWithPhotoAiFallback(
  async () => { throw Object.assign(new Error("missing"), { code: "P2022" }) },
  async () => ({ id: "s1" }),
)).resolves.toEqual({ id: "s1", photoAiRunCount: 0 })

const connectionError = Object.assign(new Error("offline"), { code: "P1001" })
await expect(updateTeacherStudentWithPhotoAiFallback(
  async () => { throw connectionError },
  async () => ({ id: "s1" }),
)).rejects.toBe(connectionError)
```
- [x] **Step 2: Run** `npm test -- src/__tests__/unit/teacher-student-edit.test.ts` and verify failure because the helper does not exist.
- [x] **Step 3: Implement the generic update helper** by wrapping `runWithMissingColumnFallback` and adding the default counter only to the compatible result.

```ts
export async function updateTeacherStudentWithPhotoAiFallback<T extends object>(
  fullUpdate: () => Promise<T & { photoAiRunCount: number }>,
  compatibleUpdate: () => Promise<T>,
): Promise<T & { photoAiRunCount: number }> {
  return runWithMissingColumnFallback(
    fullUpdate,
    async () => ({ ...(await compatibleUpdate()), photoAiRunCount: 0 }),
  )
}
```
- [x] **Step 4: Update the edit route** to accept validated `photoBgStatus`, use a full update selecting `photoAiRunCount`, and retry the same update without that selected field only for `P2022`. Build `updateData` once so both queries persist identical values:

```ts
const updateData = {
  formData,
  ...(hasPhotoUpdate ? {
    photoUrl,
    photoPath,
    originalPhotoUrl: photoUrl,
    originalPhotoPath: photoPath,
    photoBgStatus,
  } : {}),
  ...buildStudentIndexData(formData, student.classId),
}
```
- [x] **Step 5: Run the focused test** and verify it passes.

### Task 2: Manual teacher photo workflow

**Files:**
- Create: `src/lib/teacher-photo-workflow.ts`
- Create: `src/__tests__/unit/teacher-photo-workflow.test.ts`
- Create: `src/components/TeacherPhotoEditor.tsx`
- Modify: `src/components/PhotoCropper.tsx`

**Interfaces:**
- Produces: `TeacherPhotoStage = "select" | "crop" | "background"` and `nextTeacherPhotoStage(stage, event)`.
- Produces: `TeacherPhotoEditor({ currentPhotoUrl, backgroundColor, onReady, onCancel })` where `onReady(dataUrl, photoBgStatus)` returns the teacher-selected result.

- [x] **Step 1: Write failing workflow tests** proving `PHOTO_ACCEPTED` transitions to `crop`, `CROP_APPLIED` transitions to `background`, and `CHOOSE_AGAIN` returns to `select`.

```ts
expect(nextTeacherPhotoStage("select", "PHOTO_ACCEPTED")).toBe("crop")
expect(nextTeacherPhotoStage("crop", "CROP_APPLIED")).toBe("background")
expect(nextTeacherPhotoStage("crop", "CHOOSE_AGAIN")).toBe("select")
```
- [x] **Step 2: Run** `npm test -- src/__tests__/unit/teacher-photo-workflow.test.ts` and verify failure because the module does not exist.
- [x] **Step 3: Implement the stage transition helper** with no transition that skips crop after photo acceptance.

```ts
export function nextTeacherPhotoStage(stage: TeacherPhotoStage, event: TeacherPhotoEvent): TeacherPhotoStage {
  if (event === "CHOOSE_AGAIN") return "select"
  if (stage === "select" && event === "PHOTO_ACCEPTED") return "crop"
  if (stage === "crop" && event === "CROP_APPLIED") return "background"
  return stage
}
```
- [x] **Step 4: Extend `PhotoCropper`** with optional `cancelLabel = "Skip Cropping"`; teacher usage passes `Choose Another Photo` and returns to selection.

```tsx
<button type="button" onClick={onCancel} style={secondaryBtnStyle}>
  {cancelLabel}
</button>
```
- [x] **Step 5: Implement `TeacherPhotoEditor`**: render `PhotoVerifier` during selection, `PhotoCropper` after acceptance, and `PhotoBgProcessor` only after `onCropped`; return either processed data or the manually cropped original.

```tsx
{stage === "crop" && sourceUrl && (
  <PhotoCropper
    photoUrl={sourceUrl}
    cancelLabel="Choose Another Photo"
    onCancel={chooseAgain}
    onCropped={(dataUrl) => {
      setCroppedUrl(dataUrl)
      setStage((current) => nextTeacherPhotoStage(current, "CROP_APPLIED"))
    }}
  />
)}
{stage === "background" && croppedUrl && (
  <PhotoBgProcessor
    photoUrl={croppedUrl}
    defaultBgColor={backgroundColor}
    onProcessed={onReady}
    onSkip={(status) => onReady(croppedUrl, status)}
  />
)}
```
- [x] **Step 6: Run focused workflow tests** and verify they pass.

### Task 3: Dashboard integration and verification

**Files:**
- Modify: `src/app/teacher/dashboard/page.tsx`

**Interfaces:**
- Consumes: `TeacherPhotoEditor`, `prepareStudentPhotoForUpload`, and `PhotoBgStatus`.
- Sends: `{ formData, photoUrl, photoPath, photoBgStatus }` to the edit endpoint when a replacement is selected.

- [x] **Step 1: Replace the direct file input** with a Change Photo button and a prepared-photo status while retaining the current preview.

```tsx
<button type="button" className="btn btn-outline" onClick={() => setShowEditPhotoWorkflow(true)}>
  📷 Change Photo
</button>
```
- [x] **Step 2: Open `TeacherPhotoEditor`** in a higher-z-index overlay using the template's configured `photoBgColor`.

```tsx
<TeacherPhotoEditor
  currentPhotoUrl={editingStudent.photoUrl}
  backgroundColor={(templateData as any)?.photoBgColor || "#FFFFFF"}
  onCancel={() => setShowEditPhotoWorkflow(false)}
  onReady={(dataUrl, status) => {
    setEditPhotoDataUrl(dataUrl)
    setEditPhotoPreview(dataUrl)
    setEditPhotoBgStatus(status)
    setShowEditPhotoWorkflow(false)
  }}
/>
```
- [x] **Step 3: Preserve the selected data URL** in editor state; on Save Changes, normalize it to JPEG, upload it, and send the returned URL/path plus background status to the edit endpoint.

```ts
const uploadFile = await prepareStudentPhotoForUpload(editPhotoDataUrl, {
  fileName: `teacher-photo-${editingStudent.id}.jpg`,
})
uploadData.append("file", uploadFile)
body: JSON.stringify({ formData: editFormData, ...uploadedPhoto, photoBgStatus: editPhotoBgStatus })
```
- [x] **Step 4: Keep the modal open on error** and clear photo workflow state only after a successful save or explicit cancel.
- [x] **Step 5: Run verification:** `npm test`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`; all must exit zero.
- [x] **Step 6: Commit** the plan, tests, API fix, component, and dashboard changes with message `Fix teacher photo update and camera flow`.
