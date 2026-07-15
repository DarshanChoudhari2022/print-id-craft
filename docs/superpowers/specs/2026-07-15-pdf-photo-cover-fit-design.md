# PDF Photo Cover-Fit Design

## Problem

JPG template previews render student photos with cover-fit and top alignment, so each mapped photo region is completely filled and any overflow is clipped. The PDF generation path currently uses contain-fit, which preserves the entire source photo but can leave white strips when the photo and mapped region have different aspect ratios.

This mismatch is visible in Nikos Public School cards, but the cause is shared rendering code rather than school data or a Nikos-specific template setting.

## Required Behaviour

- Generated PDF cards must render student photos with the same cover-fit and top-alignment behaviour as the on-screen JPG template preview.
- Photo placement must remain dynamic. Every card must continue to use the saved mapping's position, width, height, corner radius, and border configuration.
- Wider and taller source photos must both completely cover their mapped photo regions. Overflow may be cropped by the existing clip path.
- The implementation must not contain Nikos-specific school, template, student, or dimension values.
- Student records, stored photos, school records, template mappings, and database contents must not be changed.
- PDF sheet size, card size, grid placement, text rendering, flags, and other export formats must remain unchanged.

## Design

Extract the cover-fit placement calculation into a small pure helper. Given the source image dimensions and the mapped photo rectangle, it returns the destination rectangle used by canvas `drawImage`. Its calculation will match the approved preview behaviour:

- If the source is relatively taller than the mapped box, scale it to the box width and align it to the top.
- Otherwise, scale it to the box height, center it horizontally, and align it to the top.

Both the live JPG preview and `BatchGenerator`'s raster card renderer will call this helper. The existing rounded-rectangle clip and border drawing remain in their current rendering paths. PDF print generation already consumes the raster card output from `BatchGenerator`, so no PDF page-layout changes are required.

The helper boundary prevents the preview and PDF calculations from drifting apart again while keeping the change limited to student-photo placement.

## Error Handling

Existing image loading and fallback behaviour remains unchanged. A failed image load will continue to follow the current preview or batch-renderer handling; the placement helper itself has no I/O or database access.

## Testing

Add focused unit tests for the pure placement helper before changing production rendering:

- A relatively tall source photo fills the mapped width, overflows vertically, and is top-aligned.
- A relatively wide source photo fills the mapped height, overflows horizontally, is centered horizontally, and is top-aligned.
- A source with the same aspect ratio exactly matches the mapped rectangle.

After implementation, run the focused regression test, the complete Vitest suite, lint, and the production build. No database commands or migrations are part of verification.

