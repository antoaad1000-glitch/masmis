import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var masmisPrisma: PrismaClient | undefined;
}

export const prisma = globalThis.masmisPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.masmisPrisma = prisma;
}

export * from "@prisma/client";
