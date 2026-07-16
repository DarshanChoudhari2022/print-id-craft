# House Flag Label Design

## Goal

Display the selected house name directly beneath its matching uploaded flag inside the existing flag placeholder. For example, a student assigned to Red house sees the red flag with **Red** centered below it.

## Scope

- Applies to every dynamic house flag placeholder, including Villoo Poonawalla School.
- Uses the existing student house value and uploaded flag catalogue.
- Covers public registration previews, manufacturer previews, print-ready JPEG/PDF output, and SVG output.
- Does not change the database schema, student records, templates, flag uploads, or unrelated card fields.

## Rendering

The existing flag placeholder remains in its current position and size. Its interior is divided into two regions:

- The upper region displays the uploaded flag using contain-fit so the entire flag remains visible.
- The lower region displays the normalized selected house name, centered and bold.

The label is derived from the same house value used to resolve the image, ensuring the image and wording cannot disagree. The renderer may shrink the label font to keep longer house names within the placeholder width.

If the selected house has a name but its uploaded image is unavailable, the name still renders in the label region. If no house is selected, neither image nor label is rendered.

## Architecture

A shared pure layout helper will calculate the image and label regions and the display label. Canvas preview, generated raster output, and SVG output will consume that shared result so dimensions and behavior stay consistent. Existing flag URL resolution remains unchanged.

## Verification

- Unit tests will verify house-label resolution and the image/label region layout.
- Wiring tests will verify all flag renderers use the shared layout behavior.
- Existing flag preview, generation, full test, lint, and production build checks must pass.
- Git diff review must confirm there are no Prisma schema, migration, or database-operation changes.
