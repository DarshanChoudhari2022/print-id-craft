# Student House Flag Preview and Output Correction

## Goal

Ensure a student's uploaded House flag is visible in generated previews and every generated output whenever that student's active front or back template contains a flag placeholder.

## Root Cause

`BatchGenerator` currently decides whether to load the school flag catalogue by checking only the initially selected template's front and back mappings. During school-wide or section-wide generation, individual students can use assigned templates that differ from that initial template. If an assigned student template contains a flag placeholder but the initial template does not, the generator skips loading all flag images and its `getFlagUrl` helper always returns `undefined`.

The renderer correctly draws a supplied flag URL, and the shared House resolver correctly matches current and legacy House field aliases. The missing URL at the generator boundary is therefore the failure point.

## Approved Design

After the generation API returns the students and their resolved templates, the generator will inspect every template actually used by those students. It will consider both front and back field mappings. If any active mapping has `type: "flag"`, it will fetch the school's existing flag catalogue.

Flag resolution will be based on each student's form data and the shared `resolveHouseImageUrl` helper. It will not be gated by whether the initial/default template contains a flag field.

The resolved flag URL will continue through the existing renderer arguments for:

- generated-card previews;
- PDF print output;
- JPEG output;
- BMP output;
- CDR/SVG output;
- front and back templates.

No fallback flag will be invented. If a student has no House value or no matching uploaded flag image, only that student's flag placeholder remains empty.

## Compatibility and Safety

- Schools and templates without flag placeholders behave exactly as before and do not make the flag-catalogue request.
- Existing House aliases and punctuation-insensitive image matching remain unchanged.
- No database migration, schema update, student update, template update, or storage mutation is required.
- The existing manufacturer authorization and school-scoped flag endpoint remain unchanged.
- The change is confined to generator flag detection and regression coverage.

## Testing

Add a regression test proving that a flag field present only in a student's assigned template triggers flag-catalogue loading and does not allow `getFlagUrl` to return early based on the initial template. Retain existing House resolver tests, then run the focused tests, full test suite, lint, and production build before Git integration.
