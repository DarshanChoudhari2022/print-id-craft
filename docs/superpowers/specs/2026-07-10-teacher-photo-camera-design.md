# Teacher Photo Update and Camera Design

## Problem

Saving a replacement student photo from the teacher dashboard returns `Internal Server Error`. The edit endpoint selects the recently introduced `photoAiRunCount` field in its update response. During a staggered deployment, a database without that column rejects the update response, even though the selected image itself is valid.

The teacher editor currently offers only a browser file picker. Teachers also need the same live-camera, photo-checking, manual-crop, and AI background-cleanup experience used by the public submission form.

## Chosen Approach

Reuse the existing `PhotoVerifier`, `PhotoCropper`, and `PhotoBgProcessor` components in a focused teacher photo workflow. This keeps camera permissions, front/back camera support, validation, AI cleanup, retry behavior, and prepared/original choice consistent with the public form.

The edit API will use the existing missing-column compatibility helper for its response. It will retry only Prisma `P2022` errors without selecting `photoAiRunCount`, defaulting that response field to zero. Unrelated database errors will continue to fail visibly.

## Teacher Workflow

1. The teacher opens Edit Student and chooses **Change Photo**.
2. `PhotoVerifier` offers **Browse File** and **Take Photo**, including camera permission help and phone-camera fallback.
3. After the photo passes or the teacher explicitly accepts warnings, the manual 3:4 crop screen opens.
4. Cropping is never automatic. The teacher positions and resizes the crop and must tap **Apply Crop**. Cancelling returns to photo selection.
5. AI background cleanup starts only after the teacher applies the crop, using the school template's configured background colour.
6. The teacher compares the cropped original with the prepared version and chooses which to keep.
7. The selected result appears in Edit Student. **Save Changes** uploads it and updates the student together with any edited form fields.

The existing student photo remains unchanged until Save Changes succeeds.

## Component Boundaries

- Add a `TeacherPhotoEditor` component that owns the select/verify, crop, and background-processing stages. It receives the current photo and school background colour and returns the final data URL and background status.
- Extend `PhotoCropper` with an optional cancel-button label so the teacher flow can say **Choose Another Photo** instead of **Skip Cropping**. Public-form behavior remains unchanged by default.
- Keep upload and student-data persistence in the dashboard page. Convert the selected data URL to a normalized JPEG with the existing client photo utility before calling `/api/upload`.
- Send `photoBgStatus` with the edit request so the stored record reflects whether AI preparation was used or the original was retained.

## Error Handling

- A camera denial shows the existing browser-specific permission guidance and retains file-upload fallback.
- Photo validation warnings can be explicitly overridden exactly as on the public form.
- AI failure offers retry or the cropped original.
- Upload or edit failure leaves the editor open, preserves the selected preview, and shows the server-provided error.
- The API compatibility fallback handles only a missing optional database column and never hides unrelated failures.

## Testing

- Unit-test the edit-response compatibility path for `P2022` and unrelated errors.
- Unit-test conversion of the final data URL into an uploadable JPEG where practical through the existing client utility.
- Verify the teacher workflow component exposes file and camera selection, requires manual crop confirmation, and proceeds to AI only after that confirmation.
- Run focused Vitest tests, the full suite, TypeScript, lint, and the production build.
