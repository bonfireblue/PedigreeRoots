-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedByUserId" TEXT,
ADD COLUMN     "purgeAfter" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Person_familyGraphId_deletedAt_idx" ON "Person"("familyGraphId", "deletedAt");

-- CreateIndex
CREATE INDEX "Person_purgeAfter_idx" ON "Person"("purgeAfter");
