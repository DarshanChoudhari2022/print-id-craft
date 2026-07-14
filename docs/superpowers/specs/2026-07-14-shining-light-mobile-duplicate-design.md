# Shining Light Mobile Duplicate Design

## Goal

Allow siblings in Shining Light School to register with the same parent mobile number when their full student names differ, without changing duplicate behavior for any other school and without modifying existing database records.

## Root Cause

Shining Light stores the parent number under `mobile_no` and has no genuine roll-number field. The shared fuzzy field resolver normalizes `mobile_no` to `mobileno`, then matches the broad roll-number alias `no`. As a result, the student index stores the mobile number in `normalizedRollNo`, and duplicate submission checks reject a sibling using the same number as if the roll number were duplicated.

## Scoped Behavior

- Apply the exception only to Shining Light's existing class ID `cmr0fgn1d00037286escfox15`.
- During duplicate checking for that class, compare the resolved roll value with the resolved mobile value.
- If the two normalized values are identical, treat the roll value as empty for that duplicate check.
- Continue blocking an exact normalized full-name match in the same class.
- Continue blocking a genuine roll/admission number when it is distinct from the mobile value.
- Leave every other school's duplicate logic unchanged.

## Data Safety

- Do not update, delete, backfill, or migrate any database row.
- Do not change stored student indexes.
- Do not change registration data, serial numbers, photos, templates, or school configuration.
- Limit production changes to the duplicate-checking module and its regression tests.

## Testing

- Add a regression test reproducing Shining Light's `name`, `mobile_no`, class, division, address, and DOB field shape.
- Verify that a different full student name with the same mobile number is not rejected as a duplicate roll number.
- Verify that the same full student name remains rejected.
- Verify that a genuine repeated roll number remains rejected.
- Verify that another class retains the existing duplicate behavior.
- Run the focused regression test, the complete test suite, TypeScript checking, and the production build.
