-- ChangeLog: audit trail for the accountability model (Phase 1b).
-- No foreign keys on purpose: log rows must survive deletion of the rows they
-- describe.
CREATE TABLE "ChangeLog" (
    "id" TEXT NOT NULL,
    "familyGraphId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "targetPersonId" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChangeLog_familyGraphId_createdAt_idx" ON "ChangeLog"("familyGraphId", "createdAt");
CREATE INDEX "ChangeLog_targetPersonId_idx" ON "ChangeLog"("targetPersonId");
