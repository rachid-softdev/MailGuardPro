import { PrismaClient } from "@prisma/client";
import { decryptToken, encryptToken } from "./crypto";

const TOKEN_FIELDS = ["access_token", "refresh_token", "id_token"];

function encryptFields(data: any): void {
  if (!data) return;
  for (const field of TOKEN_FIELDS) {
    if (data[field]) {
      data[field] = encryptToken(data[field]);
    }
  }
}

function decryptFields(result: any, args?: any): void {
  if (!result) return;

  // If select is specified and doesn't include token fields, skip decryption
  if (args?.select && TOKEN_FIELDS.every((f) => !args.select[f])) {
    return;
  }

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
          decryptFields(result, args);
          return result;
        },
        async findFirst({ args, query }: { args: any; query: any }) {
          const result = await query(args);
          decryptFields(result, args);
          return result;
        },
        async findMany({ args, query }: { args: any; query: any }) {
          const result = await query(args);
          decryptFields(result, args);
          return result;
        },
        async findUniqueOrThrow({ args, query }: { args: any; query: any }) {
          const result = await query(args);
          decryptFields(result, args);
          return result;
        },
        async findFirstOrThrow({ args, query }: { args: any; query: any }) {
          const result = await query(args);
          decryptFields(result, args);
          return result;
        },
      },
    },
  } as const;
}

// Create the extended client with proper typing
const prismaClient = new PrismaClient().$extends(createTokenExtension());
type ExtendedPrismaClient = typeof prismaClient;

// Fix the global type
const globalForPrisma = globalThis as unknown as {
  prisma: ExtendedPrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClient;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
