ALTER TABLE "User"
ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "expiresAt" TIMESTAMP(3);

CREATE INDEX "User_role_isActive_expiresAt_idx"
ON "User"("role", "isActive", "expiresAt");
