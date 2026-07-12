-- CreateTable
CREATE TABLE "ParentChild" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,

    CONSTRAINT "ParentChild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Spouse" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aId" TEXT NOT NULL,
    "bId" TEXT NOT NULL,

    CONSTRAINT "Spouse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParentChild_parentId_idx" ON "ParentChild"("parentId");

-- CreateIndex
CREATE INDEX "ParentChild_childId_idx" ON "ParentChild"("childId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentChild_parentId_childId_key" ON "ParentChild"("parentId", "childId");

-- CreateIndex
CREATE INDEX "Spouse_aId_idx" ON "Spouse"("aId");

-- CreateIndex
CREATE INDEX "Spouse_bId_idx" ON "Spouse"("bId");

-- CreateIndex
CREATE UNIQUE INDEX "Spouse_aId_bId_key" ON "Spouse"("aId", "bId");

-- AddForeignKey
ALTER TABLE "ParentChild" ADD CONSTRAINT "ParentChild_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentChild" ADD CONSTRAINT "ParentChild_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Spouse" ADD CONSTRAINT "Spouse_aId_fkey" FOREIGN KEY ("aId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Spouse" ADD CONSTRAINT "Spouse_bId_fkey" FOREIGN KEY ("bId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
