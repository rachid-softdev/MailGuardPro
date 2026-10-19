import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });
try {
  const keys = Object.keys(p)
    .filter((k) => !k.startsWith("_") && !k.startsWith("$"))
    .sort();
  console.log(keys.join("\n"));
} finally {
  await p.$disconnect();
  await pool.end();
}
