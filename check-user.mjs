import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const email = "bon@local.test";

function dbHost(url) {
  try {
    const u = new URL(url);
    return u.host;
  } catch {
    return "INVALID_DATABASE_URL";
  }
}

async function main() {
  console.log("DB host:", dbHost(process.env.DATABASE_URL || ""));
  console.log("Has DATABASE_URL:", Boolean(process.env.DATABASE_URL));

  const u = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  console.log("Lookup result:", u);

  const count = await prisma.user.count();
  console.log("Total users in DB:", count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });