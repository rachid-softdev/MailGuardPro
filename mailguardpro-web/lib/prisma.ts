import { PrismaClient } from "@prisma/client";
import { decryptToken, encryptToken } from "./crypto";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const TOKEN_FIELDS = ["access_token", "refresh_token", "id_token"];

function encryptFields(data: any): void {
  if (!data) return;
  for (const field of TOKEN_FIELDS) {
    if (data[field]) {
      data[field] = encryptToken(data[field]);
    }
  }
}

function decryptFields(result: any): void {
  if (!result) return;
  if (Array.isArray(result)) {
    for (const item of result) {
      for (const field of TOKEN_FIELDS) {
        if (item?.[field]) item[field] = decryptToken(item[field]);
      }
    }
  } else {
    for (const field of TOKEN_FIELDS) {
      if (result[field]) result[field] = decryptToken(result[field]);
    }
  }
}

function createTokenExtension() {
  return {
    name: "token-encryption",
    query: {
      account: {
        // Encrypt on write
        async create({ args, query }: { args: any; query: any }) {
          encryptFields(args.data);
          return query(args);
        },
        async update({ args, query }: { args: any; query: any }) {
          encryptFields(args.data);
          return query(args);
        },
        // Decrypt on read
        async findUnique({ args, query }: { args: any; query: any }) {
          const result = await query(args);
          decryptFields(result);
          return result;
        },
        async findFirst({ args, query }: { args: any; query: any }) {
          const result = await query(args);
          decryptFields(result);
          return result;
        },
        async findMany({ args, query }: { args: any; query: any }) {
          const result = await query(args);
          decryptFields(result);
          return result;
        },
        async findUniqueOrThrow({ args, query }: { args: any; query: any }) {
          const result = await query(args);
          decryptFields(result);
          return result;
        },
        async findFirstOrThrow({ args, query }: { args: any; query: any }) {
          const result = await query(args);
          decryptFields(result);
          return result;
        },
      },
    },
  } as const;
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient().$extends(createTokenExtension());

if (process.env.NODE_ENV !== "production") (globalForPrisma as any).prisma = prisma;

export default prisma;
