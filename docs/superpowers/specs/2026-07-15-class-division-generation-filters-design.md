# Class and Division Generation Filters

## Goal

Allow the manufacturer to generate ID-card output for a selected student class/grade and division while preserving the existing section, status, and output-format behavior.

## Current Behavior

The generator's current "Select Class" control filters the database `Class` record. In this application that record represents a school section or registration group; for Nikos Public School it is a school-wide section containing all students. The student's actual class/grade and division are stored in `Student.formData`, so the current control cannot generate a class- or division-specific PDF.

## Approved User Experience

The generator will display three cascading scope controls:

1. **Section** — the existing database-class selector, renamed for clarity.
2. **Class/Grade** — values available within the selected section, plus **All Classes**.
3. **Division** — values available within the selected class/grade, plus **All Divisions**.

Changing Section or Class/Grade clears any now-invalid downstream selection. Division remains disabled until a class/grade is selected. The existing Student Status and Output Format controls remain unchanged.

The selected scope applies consistently to PDF, JPEG, CDR, and BMP output. Download filenames include the selected class/grade and division when present.

## Architecture

### Filter-option discovery

Add a manufacturer-authorized, read-only mode to the existing generation API that returns distinct class/grade and division values for the selected school and optional section. Values are derived from existing student `formData`; no schema change or stored-data update is required.

The option resolver will recognize the same established aliases used by card rendering and student filtering, including `classGrade`, `class`, `grade`, `division`, and `div`. Values are trimmed, empty values are ignored, duplicates are removed case-insensitively, and options are naturally sorted.

### Generation filtering

The existing `GET /api/schools/[id]/generate` request accepts optional `classGrade` and `division` query parameters in addition to `classId` and `status`. Prisma continues to restrict results by school, status, and optional section. Class/grade and division are then matched using the shared field-value resolver so legacy key aliases remain compatible.

Filtering is read-only. The explicit POST operation for marking physically printed students is unchanged and still receives only the IDs from the generated result.

### Generator component

`BatchGenerator` receives the existing section records, loads available class/grade values for the active section, and loads or derives division values for the active class. Its generation request includes the selected values. A changed filter clears staged previews/downloads so an old result cannot be mistaken for the newly selected scope.

## Error Handling

- If no students match the selected filters and status, the API returns a clear not-found message naming the active class/division scope.
- If option discovery fails, generation remains unavailable for that selection and the UI displays the API error rather than silently falling back to all students.
- Unknown or blank filter values never cause writes and never broaden an explicitly selected scope.

## Compatibility and Safety

- Selecting All Sections, All Classes, and All Divisions preserves current school-wide generation.
- Existing section-only generation remains supported.
- No database migration, schema edit, student update, or template update is required.
- Filtering is school-scoped and manufacturer-authorized using the existing session checks.
- No changes are made to registration forms or other school workflows.

## Testing

Automated tests will cover:

- extraction and natural sorting of class/grade and division options from legacy field aliases;
- API query wiring for section, class/grade, division, and status;
- exact combined filtering so only matching students are rendered;
- cascading UI reset behavior and generation request parameters;
- retention of unfiltered and section-only behavior;
- full lint, test, and production-build verification before Git integration.
