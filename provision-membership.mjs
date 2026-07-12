import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const EMAIL = "bon@local.test"; // your test login email

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: EMAIL },
    select: { id: true, email: true },
  });
  if (!user) throw new Error(`User not found for email: ${EMAIL}`);

  // 1) Create a FamilyGraph
  const graph = await prisma.familyGraph.create({
    data: {
      name: "My Family",
      createdById: user.id,
    },
    select: { id: true, name: true },
  });

  // 2) Create a Person in that graph (unclaimed is fine, but we'll claim it)
  const person = await prisma.person.create({
    data: {
      fullName: "Bon (Test)",
      familyGraphId: graph.id,
      createdById: user.id,
      isPrivate: false,
      claimedByUserId: user.id,
    },
    select: { id: true, fullName: true },
  });

  // 3) Create Membership (ADMIN)
  await prisma.membership.create({
    data: {
      userId: user.id,
      familyGraphId: graph.id,
      role: "ADMIN",
    },
    select: { id: true },
  });

  console.log("Provisioned:");
  console.log("  user:", user.email, user.id);
  console.log("  graph:", graph.name, graph.id);
  console.log("  person:", person.fullName, person.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });