-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fullName" TEXT NOT NULL,
    "bio" TEXT,
    "birthDate" TIMESTAMP(3),
    "deathDate" TIMESTAMP(3),
    "location" TEXT,
    "photoUrl" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Person_fullName_idx" ON "Person"("fullName");

-- CreateIndex
CREATE INDEX "Person_createdById_idx" ON "Person"("createdById");

-- CreateIndex
CREATE INDEX "Person_isPrivate_idx" ON "Person"("isPrivate");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
