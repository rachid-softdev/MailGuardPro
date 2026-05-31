import { defineConfig } from "@prisma/config";
import "dotenv/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  output: "../src/generated/prisma",
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
