const { databaseProvider } = require("./database-provider");
const path = require("node:path");

const { PrismaClient } = databaseProvider() === "postgresql"
  ? eval("require")(path.join(/* turbopackIgnore: true */ process.cwd(), "generated", "postgres-client"))
  : require("@prisma/client");

const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

module.exports = { prisma };
