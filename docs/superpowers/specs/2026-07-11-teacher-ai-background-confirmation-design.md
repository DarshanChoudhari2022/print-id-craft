# Teacher AI Background Confirmation Design

## Problem

The teacher photo editor mounts the AI background processor immediately after a crop is applied. Background removal therefore starts without explicit confirmation and may consume an AI credit even when the teacher only wanted to crop the photo.

## Chosen Approach

Add a confirmation stage between cropping and background processing for both teacher photo modes: **Change Photo** and **Crop Existing Photo**. Applying a crop never mounts the AI processor. The teacher must explicitly choose whether to keep the cropped photo without AI or start AI background processing.

## Teacher Workflow

1. The teacher selects or captures a replacement photo, or opens the existing photo directly.
2. The teacher applies the 3:4 crop.
3. A confirmation screen displays the cropped preview and three actions:
   - **Use Cropped Photo — No AI** returns the cropped image to Edit Student with a non-processed background status.
   - **Process AI Background** advances to the existing background processor. The screen states that this action may consume an AI credit.
   - **Back to Crop** returns to the cropper with the current source photo.
4. Only choosing **Process AI Background** mounts `PhotoBgProcessor` and permits its existing service calls.
5. The final image remains pending until **Save Changes** succeeds.

## State and Component Boundaries

- Extend `TeacherPhotoStage` with a `confirm-ai` stage.
- Change the `CROP_APPLIED` transition from `crop -> background` to `crop -> confirm-ai`.
- Add explicit `USE_CROPPED_PHOTO` and `PROCESS_AI_BACKGROUND` events.
- Keep the confirmation UI inside `TeacherPhotoEditor`, which already owns the crop and background stages.
- Keep `PhotoCropper`, `PhotoBgProcessor`, upload logic, and persistence unchanged.

## Credit-Safety Requirement

`PhotoBgProcessor` must not render during selection, cropping, or confirmation. No health check, background-removal request, or other AI-related network work may begin before **Process AI Background** is clicked.

## Error and Cancellation Behavior

- **Back to Crop** preserves the crop source and returns to manual cropping.
- Closing the editor leaves the stored photo unchanged.
- Existing AI retry, original-photo fallback, and error handling remain available after explicit opt-in.
- **Use Cropped Photo — No AI** returns the crop with the existing skipped/non-processed photo background status contract.

## Testing

- Unit-test that applying a crop advances to confirmation rather than background processing.
- Unit-test that explicit AI opt-in advances from confirmation to background processing.
- Unit-test that choosing the cropped photo completes without entering the AI stage.
- Unit-test that Back to Crop returns from confirmation to crop.
- Run focused workflow tests, the full Vitest suite, TypeScript validation, lint, and the production build.
