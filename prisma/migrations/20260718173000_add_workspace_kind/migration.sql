ALTER TABLE "School"
ADD COLUMN "workspaceKind" TEXT NOT NULL DEFAULT 'school';

UPDATE "School" AS school
SET "workspaceKind" = 'company'
WHERE EXISTS (
  SELECT 1
  FROM "Template" AS template
  WHERE template."schoolId" = school."id"
    AND template."name" ILIKE '%Employee Template%'
);

CREATE INDEX "School_workspaceKind_createdAt_idx"
ON "School"("workspaceKind", "createdAt");
