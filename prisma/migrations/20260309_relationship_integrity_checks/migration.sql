ALTER TABLE "ParentChild"
ADD CONSTRAINT "ParentChild_parent_not_child_check"
CHECK ("parentId" <> "childId");

ALTER TABLE "Spouse"
ADD CONSTRAINT "Spouse_a_not_b_check"
CHECK ("aId" <> "bId");