import { prisma } from "../src/lib/db";

async function main() {
  // Earliest-created user becomes founder for the default graph
  const founder = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!founder) throw new Error("NO_USERS_FOUND");

  // Create or reuse a default graph
  let graph = await prisma.familyGraph.findFirst({ orderBy: { createdAt: "asc" } });

  if (!graph) {
    graph = await prisma.familyGraph.create({
      data: {
        name: "Default Family",
        createdById: founder.id,
      },
    });
  }

  // Ensure founder membership exists
  const existingMembership = await prisma.membership.findUnique({
    where: { userId_familyGraphId: { userId: founder.id, familyGraphId: graph.id } },
  });

  if (!existingMembership) {
    await prisma.membership.create({
      data: {
        userId: founder.id,
        familyGraphId: graph.id,
        role: "FOUNDER",
      },
    });
  }

  // IMPORTANT: use raw SQL so we can update rows where familyGraphId IS NULL
  const updatedCount = await prisma.$executeRawUnsafe(
    `UPDATE "Person" SET "familyGraphId" = $1 WHERE "familyGraphId" IS NULL`,
    graph.id
  );

  console.log({
    graphId: graph.id,
    founderId: founder.id,
    peopleUpdated: Number(updatedCount),
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });