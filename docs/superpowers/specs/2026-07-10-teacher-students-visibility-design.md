# Teacher Students Visibility Fix

## Problem

The teacher overview reports six submissions while the Students tab shows zero rows. The dashboard API independently counts students and loads their row details. The detail query selects the recently added `photoAiRunCount` field; during a staggered deployment, a database without that column rejects the complete detail query. The current generic fallback converts that failure into an empty array, so valid submissions disappear even though the count query succeeds.

The Students layout also exposes Division both as a filter and as a table column. Division should be a filter immediately after Class and should not consume a table column.

## Chosen Approach

Keep the full query as the normal path. If Prisma specifically reports a missing-column error for the optional AI-run field, retry the student query without that field and supply a default AI-run count for the UI. Other database errors must propagate to the dashboard error handler instead of being presented as an empty student list.

This is preferred over relying only on migration timing because it keeps submissions visible during deployments. Removing the AI feature entirely would avoid the query mismatch but would regress existing functionality.

## UI Behavior

- Every student returned for the teacher's school or assigned section appears when filters are clear.
- Filter order is Section, Class, Division, Status.
- Division remains available as a filter when division values exist.
- The table columns are Photo, Serial, Name, Section, Class, Status, Comment, and Actions.
- The empty state appears only when there truly are no matching records.

## Error Handling

- Retry only for Prisma's missing-column condition.
- Preserve the existing dashboard-level error handling for unrelated failures.
- Default `photoAiRunCount` to zero only for compatibility rows loaded by the fallback query.

## Testing

- A regression test proves a missing optional column invokes the compatible query and retains all students.
- A regression test proves unrelated query errors are not converted into an empty list.
- Existing student filter tests continue to prove clear filters retain all rows.
- Run focused Vitest tests, type/build verification, and lint for the touched files.
