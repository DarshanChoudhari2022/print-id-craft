# Nikos Address Comma Spacing Design

## Goal

Display Nikos Public School student addresses with exactly one space after every comma without changing stored student data or affecting other schools.

## Scope

- Apply only when the school name is `Nikos Public School`, matched case-insensitively after trimming surrounding whitespace.
- Apply only to fields resolved as student addresses on rendered ID cards.
- Cover the student detail card preview and generated/downloaded cards, including batch output.
- Leave student forms, tables, exports, API responses, and database values unchanged.
- Leave all non-address fields and all other schools unchanged.

## Formatting Rule

Replace each comma and any whitespace immediately following it with a comma followed by exactly one normal space.

Examples:

- `403,Supreme Savera,lane` becomes `403, Supreme Savera, lane`.
- `403,  Supreme Savera` becomes `403, Supreme Savera`.
- `Pune-411048.` remains unchanged.

The rule does not alter punctuation other than comma-adjacent whitespace.

## Design

Add a small pure formatting helper that accepts the school name, field key, and resolved display value. It returns the normalized value only when both conditions are true: the school is Nikos Public School and the rendered field resolves to the address role. Otherwise, it returns the original value.

Pass the school name into the JPG preview renderer and apply the helper after field resolution but before text transformation and wrapping. Apply the same helper in the batch canvas and SVG generation paths so previews and final output match. Optional school-name inputs preserve compatibility for any existing callers.

## Data Safety

Formatting occurs only in the rendering pipeline. No student `formData` object is mutated, and no update request or database write is performed.

## Testing

Unit tests will verify that:

- missing comma spaces are added for a Nikos address;
- multiple spaces after a comma collapse to one for a Nikos address;
- punctuation and other address text remain unchanged;
- a Nikos non-address field remains unchanged;
- another school's address remains unchanged;
- the preview and batch generation code are wired to use the school-aware formatter.

