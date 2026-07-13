-- Phase 3: collaboration quality (all additive).

-- 3a Scribe pattern: person edits may record who the information came from
--    ("told by Rose, recorded by Sarah").
ALTER TABLE "ChangeLog" ADD COLUMN "toldByPersonId" TEXT;

-- 3c Relationship types (null = unspecified; never forced in the UI).
ALTER TABLE "ParentChild" ADD COLUMN "type" TEXT;
ALTER TABLE "Spouse" ADD COLUMN "status" TEXT;
ALTER TABLE "Spouse" ADD COLUMN "startDate" TIMESTAMP(3);
ALTER TABLE "Spouse" ADD COLUMN "endDate" TIMESTAMP(3);

-- 3d Per-field privacy on claimed profiles: JSON map of field -> "family" |
--    "private" (absent = family). Only the claimer can set it.
ALTER TABLE "Person" ADD COLUMN "fieldVisibility" JSONB;
