# Production Photo AI Column Design

## Problem

Production returns `Internal Server Error` when saving teacher edits because the generated Prisma client expects `Student.photoAiRunCount`, while the live database does not contain that column. The repository already contains migration `20260710180000_add_photo_ai_run_count`, but the Vercel build command runs only the application build and never deploys pending Prisma migrations.

## Design

1. Check the target database's Prisma migration status without printing connection credentials.
2. Apply pending migrations with `prisma migrate deploy`, which executes the existing additive SQL:

   ```sql
   ALTER TABLE "Student" ADD COLUMN "photoAiRunCount" INTEGER NOT NULL DEFAULT 0;
   ```

3. Change Vercel's build command to run `DIRECT_URL=$DATABASE_URL npm run db:migrate:deploy && npm run build`. This reuses Vercel's existing database connection for the CLI without adding or copying another secret, while ensuring future checked-in migrations run before dependent application code.
4. Narrow the teacher edit authorization lookup to select only `id` and `classId`. This avoids reading unrelated optional columns during rolling deployments and keeps authorization behavior unchanged.

## Safety

- `prisma migrate deploy` applies only checked-in, pending migrations and records them in Prisma's migration table.
- The new integer column is non-null with default zero, so existing students receive a valid value.
- No student records are deleted or rewritten.
- The lookup hardening does not bypass school or class authorization filters.

## Verification

- Confirm Prisma reports no pending migrations after deployment.
- Query only the column's presence/value shape through Prisma without exposing student data.
- Add a regression test for the narrow authorization projection.
- Run the full test suite, TypeScript, lint, and production build before committing and pushing.
