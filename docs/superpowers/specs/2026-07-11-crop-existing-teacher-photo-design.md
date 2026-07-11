# Crop Existing Teacher Photo Design

## Problem

The teacher's **Change Photo** action opens the replacement-photo step. Even when a student already has a usable photo, the teacher must browse for a file or take a new picture before reaching the cropper. Teachers need a direct way to reframe the stored photo.

## Chosen Approach

Add a separate **Crop Existing Photo** button beside **Change Photo** in the Edit Student modal. Both actions reuse `TeacherPhotoEditor`, but the crop-existing action initializes the editor at the crop stage with the student's current photo while Change Photo continues to initialize at photo selection.

This preserves the existing crop and background-processing behavior without adding a second crop implementation.

## Interaction and Data Flow

1. When a current photo exists, the Edit Student photo area shows **Crop Existing Photo** next to **Change Photo**.
2. **Crop Existing Photo** opens `TeacherPhotoEditor` directly at **Crop Student Photo**, using the current stored photo as the crop source.
3. The teacher moves or resizes the fixed 3:4 crop and selects **Apply Crop**.
4. The existing background-processing step opens. The teacher can keep the cropped original or use the prepared result.
5. The selected result returns to the Edit Student modal as the pending preview.
6. The stored student photo is not replaced until the teacher selects **Save Changes** and the existing save flow succeeds.
7. **Change Photo** retains its current browse-file and camera workflow.

If no current photo exists, only **Change Photo** is shown.

## Component Changes

- Add an initial mode to `TeacherPhotoEditor`: replacement selection or cropping the current photo.
- Derive initial stage and source URL from that mode and `currentPhotoUrl`.
- Track the selected mode in the teacher dashboard and pass it when opening the editor.
- Keep `PhotoCropper`, `PhotoBgProcessor`, upload handling, and persistence unchanged.

Cancelling from the direct crop returns to the Edit Student modal. Cancelling from a replacement crop continues to return to replacement selection.

## Error Handling

- Do not display or enable **Crop Existing Photo** without a current photo URL.
- If the current image cannot load in the cropper, no pending replacement is created and the existing saved photo remains intact.
- Existing background-processing and save errors retain their current retry and preservation behavior.

## Testing

- Unit-test that replacement mode starts at selection with an empty source.
- Unit-test that crop-existing mode starts at crop with the current photo URL.
- Unit-test that crop cancellation resolves to the correct destination for each mode.
- Run the focused photo-workflow tests, full Vitest suite, TypeScript validation, lint, and production build.
