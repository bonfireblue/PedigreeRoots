import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Pick existing graph or create one (single stable graph)
  let graph = await prisma.familyGraph.findFirst();
  if (!graph) {
    graph = await prisma.familyGraph.create({
      data: { name: "Huynh Family (Seed)" } as any,
    });
  }

  const user = await prisma.user.findFirst();
  if (!user) throw new Error("No User found. Sign in once so a User exists.");

  const createdById = (user as any).id as string;
  const familyGraphId = (graph as any).id as string;

  // Ensure membership exists
  const mem = await prisma.membership.findUnique({
    where: { userId_familyGraphId: { userId: createdById, familyGraphId } },
    select: { id: true },
  });

  if (!mem) {
    await prisma.membership.create({
      data: {
        userId: createdById,
        familyGraphId,
        role: "FOUNDER",
      } as any,
    });
  }

  // Find-or-create person by name within this graph (idempotent)
  async function person(fullName: string) {
    const name = fullName.trim() || "Unnamed";

    const existing = await prisma.person.findFirst({
      where: { familyGraphId, fullName: name },
      select: { id: true, fullName: true },
    });

    if (existing) return existing;

    return prisma.person.create({
      data: {
        fullName: name,
        isPrivate: false,
        createdById,
        familyGraphId,
      } as any,
      select: { id: true, fullName: true },
    });
  }

  async function pc(parentId: string, childId: string) {
    await prisma.parentChild.upsert({
      where: { parentId_childId: { parentId, childId } },
      update: {},
      create: { parentId, childId },
    });
  }

  async function spouse(aId: string, bId: string) {
    // avoid duplicates if no unique constraint: check first
    const exists = await prisma.spouse.findFirst({
      where: {
        OR: [
          { aId, bId },
          { aId: bId, bId: aId },
        ],
      },
      select: { id: true },
    });
    if (exists) return;

    await prisma.spouse.create({ data: { aId, bId } as any });
  }

  // Build stable family
  const xe = await person("Xe Huynh");
  const chau = await person("Chau Tat");
  await spouse(xe.id, chau.id);

  const cuong = await person("Cuong Huynh");
  const quoc = await person("Bon Quoc Huynh");
  const bon = await person("Bon (Test)");

  for (const kid of [cuong, quoc, bon]) {
    await pc(xe.id, kid.id);
    await pc(chau.id, kid.id);
  }

  const kid1 = await person("Cuong's Kid 1");
  const kid2 = await person("Cuong's Kid 2");
  await pc(cuong.id, kid1.id);
  await pc(cuong.id, kid2.id);

  const qkid = await person("Quoc's Kid 1");
  await pc(quoc.id, qkid.id);

  console.log("Seed complete:");
  console.log({ graphId: familyGraphId, xeId: xe.id, cuongId: cuong.id });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });