# Dynamic House Flags Design

## Problem

Villoo Poonawalla School has four uploaded house flag images and a flag placeholder in its JPG template, but the public registration form does not show a House field.

Two gaps cause this:

1. When a template already has `fieldConfig`, form generation uses those fields and does not merge in a `type: "flag"` mapping.
2. Public form dropdown options are derived only from house values already stored on students. Uploaded flag files are not used, so a new school has no dropdown vocabulary even when its images are configured.

The existing school-scoped flag upload, storage, preview, and card-rendering paths should be reused.

## Required Behaviour

- Any school with a front- or back-side flag placeholder gets exactly one required House dropdown on its public registration form.
- The dropdown list is dynamic and contains every house configured through uploaded flag files, similar to dynamic class and division lists.
- The manufacturer can configure any number of houses by providing a house name and image, while the existing bulk filename upload remains available.
- Selecting a house stores the selected display name in the student's form data and resolves the matching image in preview and all card export paths.
- Existing aliases such as `House`, `house`, `flag`, `flagColor`, `Flag Color`, `Colour`, and `Color` remain compatible.
- Existing uploads with punctuation or trailing underscores remain usable. Their display names are humanized, so `Red_` and `Yellow_` appear as `Red` and `Yellow`, while their original storage paths are preserved.
- The feature applies to every school using a flag placeholder; no Villoo-specific IDs, names, colors, or dimensions are introduced.
- Existing student records are not rewritten. No Prisma schema change or database migration is required.

## Architecture

### School flag catalogue

Extract the existing flag discovery logic into a server-side helper that returns canonical school flag definitions. A definition contains a human-readable house name and the exact existing image URL. The catalogue combines:

- files stored under `flags/{schoolId}`; and
- legacy house values found in student form data, including entries that do not yet have an image.

Stored filenames are humanized for display without changing their storage paths. Matching uses a normalized comparison that ignores case, spaces, punctuation, and trailing underscores.

The authenticated manufacturer flags endpoint and both public submit configuration endpoints consume the same catalogue, preventing their option lists from drifting.

### Form field generation

When either side of the selected template contains a flag mapping, form generation checks the resolved fields for an existing flag-role field. If one exists, its original key and label are preserved. If none exists, generation appends one required field with key `flagColor`, label `House`, type `select`, and role `flag`.

The public UI already renders flag-role fields as dropdowns when options exist. It will receive the catalogue's house names as `flagColors`, so the four current uploads immediately produce four choices without requiring a pre-existing student.

Submission validation continues through the existing required-field path. The selected value is stored under the field key returned by form configuration; no backfill or mutation of older records occurs.

### Manufacturer management

The existing Manage Flags modal becomes Manage Houses & Flags. It keeps bulk filename upload and adds an explicit single-house row consisting of a house-name input and image picker. Submitting the row uses the existing upload endpoint and refreshes the shared catalogue.

Existing individual replace controls remain unchanged. Deletion, reordering, and database-backed house records are outside this scope.

### Rendering and matching

Create one shared resolver for finding a student's house value across current and legacy aliases and for matching it to the catalogue case-insensitively. Manufacturer preview and `BatchGenerator` use the same resolver. Flag placeholder position, size, and image-fit behaviour remain controlled by the saved template mapping.

## Error Handling

- Reject an explicit house upload when the name is empty, the image is missing, the file exceeds the existing 5 MB limit, or its type is unsupported.
- If storage listing fails, preserve the current non-fatal behaviour and allow legacy student-derived options to load.
- If a configured house has no image, keep it visible to the manufacturer but do not invent an image URL.
- Public form configuration should continue loading if flag discovery fails; the House field remains present and falls back to the existing text input only when no options can be recovered.

## Testing

- Unit-test filename humanization and normalized house matching, including `Red_` to `Red` and case-insensitive aliases.
- Unit-test form-field merging when `fieldConfig` exists and a flag mapping is present.
- Verify an existing House/flag-role field is preserved and no duplicate is added.
- Test that uploaded flag definitions become public `flagColors` even when the school has no student house values.
- Test that both front- and back-side flag mappings trigger the field.
- Add source or focused integration assertions that manufacturer preview and batch generation use the shared resolver.
- Run the complete Vitest suite, lint, and production build. Do not run database commands or migrations.

