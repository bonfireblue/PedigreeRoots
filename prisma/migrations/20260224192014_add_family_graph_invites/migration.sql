/*
  Warnings:

  - A unique constraint covering the columns `[claimedByUserId]` on the table `Person` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "GraphRole" AS ENUM ('FOUNDER', 'TRUSTED', 'MEMBER', 'ADMIN');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "claimedByUserId" TEXT,
ADD COLUMN     "familyGraphId" TEXT;

-- CreateTable
CREATE TABLE "FamilyGraph" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "name" TEXT,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "FamilyGraph_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "familyGraphId" TEXT NOT NULL,
    "role" "GraphRole" NOT NULL DEFAULT 'MEMBER',
    "invitedByUserId" TEXT,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "token" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "familyGraphId" TEXT NOT NULL,
    "targetPersonId" TEXT NOT NULL,
    "inviterUserId" TEXT NOT NULL,
    "acceptedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vouch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "familyGraphId" TEXT NOT NULL,
    "vouchedByUserId" TEXT NOT NULL,
    "vouchedUserId" TEXT NOT NULL,

    CONSTRAINT "Vouch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FamilyGraph_createdById_idx" ON "FamilyGraph"("createdById");

-- CreateIndex
CREATE INDEX "Membership_familyGraphId_idx" ON "Membership"("familyGraphId");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE INDEX "Membership_invitedByUserId_idx" ON "Membership"("invitedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_familyGraphId_key" ON "Membership"("userId", "familyGraphId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_familyGraphId_idx" ON "Invitation"("familyGraphId");

-- CreateIndex
CREATE INDEX "Invitation_targetPersonId_idx" ON "Invitation"("targetPersonId");

-- CreateIndex
CREATE INDEX "Invitation_inviterUserId_idx" ON "Invitation"("inviterUserId");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "Vouch_familyGraphId_idx" ON "Vouch"("familyGraphId");

-- CreateIndex
CREATE INDEX "Vouch_vouchedByUserId_idx" ON "Vouch"("vouchedByUserId");

-- CreateIndex
CREATE INDEX "Vouch_vouchedUserId_idx" ON "Vouch"("vouchedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Vouch_familyGraphId_vouchedByUserId_vouchedUserId_key" ON "Vouch"("familyGraphId", "vouchedByUserId", "vouchedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "Person_claimedByUserId_key" ON "Person"("claimedByUserId");

-- CreateIndex
CREATE INDEX "Person_familyGraphId_idx" ON "Person"("familyGraphId");

-- AddForeignKey
ALTER TABLE "FamilyGraph" ADD CONSTRAINT "FamilyGraph_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_familyGraphId_fkey" FOREIGN KEY ("familyGraphId") REFERENCES "FamilyGraph"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_familyGraphId_fkey" FOREIGN KEY ("familyGraphId") REFERENCES "FamilyGraph"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_targetPersonId_fkey" FOREIGN KEY ("targetPersonId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_inviterUserId_fkey" FOREIGN KEY ("inviterUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedByUserId_fkey" FOREIGN KEY ("acceptedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vouch" ADD CONSTRAINT "Vouch_familyGraphId_fkey" FOREIGN KEY ("familyGraphId") REFERENCES "FamilyGraph"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vouch" ADD CONSTRAINT "Vouch_vouchedByUserId_fkey" FOREIGN KEY ("vouchedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vouch" ADD CONSTRAINT "Vouch_vouchedUserId_fkey" FOREIGN KEY ("vouchedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_familyGraphId_fkey" FOREIGN KEY ("familyGraphId") REFERENCES "FamilyGraph"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
