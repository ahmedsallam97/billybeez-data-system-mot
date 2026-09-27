const { databaseProvider } = require("./database-provider");

const { PrismaClient } = databaseProvider() === "postgresql"
  ? require("../generated/postgres-client")
  : require("@prisma/client");

const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

module.exports = { prisma };
