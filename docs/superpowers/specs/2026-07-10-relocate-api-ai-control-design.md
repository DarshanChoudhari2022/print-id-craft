# Relocate API AI Control Design

## Goal

Remove the manual API AI control from the teacher portal and consolidate it inside the manufacturer's AI Background workflow as another processing model.

## Teacher Portal

- Remove the `API AI` action button from every student table row.
- Remove the `Run API AI` action from the student detail modal.
- Remove the teacher-only handler and loading state that call the school-level endpoint and produce the Forbidden toast.
- Do not show `photoAiRunCount` in the teacher UI.
- Preserve automatic background cleanup in the teacher photo replacement workflow.

## Manufacturer Portal

- Remove standalone API AI action buttons from the manufacturer student table and detail modal so processing choices are not duplicated.
- Keep the API run count visible to manufacturers as an operational record.
- Add **API AI (Poof/remove.bg)** as a fifth model in the single-photo AI Background dialog beside BRIA, Gemini, Cloud AI, and Local ISNet.
- Add the same model to batch background processing.
- Route the new option through `/api/photo-bg/remove` with model `removebg`, which uses the configured public-form API chain.
- Preserve the existing preview and **Apply & Save Photo** workflow.
- Increment `photoAiRunCount` only when a manufacturer saves a result prepared with the API AI option.

## Data Flow

The manufacturer selects API AI, previews the processed photo with the chosen school background colour, and saves it through the existing assign-photo endpoint. The client includes the selected model. The endpoint validates that value, increments the counter only for `removebg`, and returns the updated counter with the saved photo.

Batch processing uses the same selected-model value for every student and increments each successfully saved API AI result.

## Error Handling

- Unconfigured or exhausted API providers display the existing background-removal error inside the manufacturer dialog.
- Failed previews do not overwrite the current student photo.
- Failed saves do not increment the counter.
- Teacher users can no longer trigger the forbidden school-level API AI action.

## Testing

- Test that the model type and manufacturer option list include `removebg`.
- Test that assign-photo increments the counter only for the validated API model.
- Test that teacher-dashboard source no longer renders or calls manual API AI controls.
- Run the full test suite, TypeScript, lint, and production build before committing.
