import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: "admin@mailguardpro.com" },
    update: {
      role: "ADMIN",
      userRoles: {
        deleteMany: {},
        create: [{ role: "ADMIN" }, { role: "USER" }],
      },
    },
    create: {
      email: "admin@mailguardpro.com",
      name: "Admin",
      role: "ADMIN",
      credits: 999999,
      userRoles: {
        create: [{ role: "ADMIN" }, { role: "USER" }],
      },
    },
  });

  console.log("Admin user created:", admin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
