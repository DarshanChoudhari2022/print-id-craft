# Manufacturer Section Rename Design

## Problem

Manufacturers can create sections and edit their classes, divisions, expiry, templates, and status, but the school page provides no way to correct or change an existing section name.

## Chosen Approach

Add an **Edit Name** action to every section row. The action opens a compact inline editor within that row, following the existing inline editors used for classes, divisions, and expiry. The existing section update endpoint already accepts an optional `name`, so no new API route or data migration is required.

## Interaction

1. The manufacturer selects **Edit Name** in a section's Actions column.
2. An inline panel opens below that row's actions with the current name prefilled.
3. **Save Name** trims the value and sends it to the existing section `PUT` endpoint.
4. On success, the section list updates immediately and the panel closes.
5. **Cancel** closes the panel without changing data.

Only one section-name editor is active at a time. Opening another section's editor replaces the previous draft.

## Data and Compatibility

Renaming changes only the section's `name`. The section ID, registration token and URL, students, class and division options, templates, expiry, status, and teacher assignments remain unchanged. Existing submissions retain their stored historical metadata, while future form loads and submissions use the new section name.

## Validation and Errors

- Trim leading and trailing whitespace before saving.
- Disable saving an empty or unchanged name.
- Show the existing toast error message if the request fails and keep the editor open with its draft intact.
- Disable the editor actions while the request is saving to prevent duplicate updates.

## Testing

- Add a pure rename helper that trims names and identifies empty or unchanged drafts.
- Unit-test valid, empty, whitespace-only, and unchanged names.
- Verify the page uses the existing `PUT /api/schools/[id]/classes/[cid]` endpoint with `{ name }` only.
- Run focused Vitest tests, the full suite, TypeScript, lint, and the production build.
