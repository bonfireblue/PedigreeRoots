import "dotenv/config";
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient();

  const one = await prisma.$queryRaw<{ one: number }[]>`SELECT 1 as one`;
  console.log("queryRaw:", one);

  const users = await prisma.user.findMany({
    select: { email: true, createdAt: true },
    take: 5,
    orderBy: { createdAt: "desc" },
  });
  console.log("users:", users);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
