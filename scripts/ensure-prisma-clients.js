const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

function generate(args, extraEnv = {}) {
  const prismaCli = require.resolve("prisma/build/index.js");
  const result = spawnSync(process.execPath, [prismaCli, ...args], { stdio: "inherit", env: { ...process.env, ...extraEnv } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

function hasGeneratedModels(client) {
  return Array.isArray(client?.Prisma?.dmmf?.datamodel?.models) && client.Prisma.dmmf.datamodel.models.length > 0;
}

function sqliteClientReady() {
  try { return hasGeneratedModels(require("@prisma/client")); }
  catch { return false; }
}

function ensureClients() {
  // npm ci may install Prisma's placeholder default.js without generating our schema.
  // File existence alone does not mean the client can construct or expose its models.
  if (!fs.existsSync("node_modules/.prisma/client/default.js") || !sqliteClientReady()) generate(["generate", "--schema", "prisma/schema.prisma"]);
  if (!fs.existsSync("generated/postgres-client/index.js")) {
    generate(["generate", "--schema", "prisma/postgres/schema.prisma"], {
      POSTGRES_DATABASE_URL: process.env.POSTGRES_DATABASE_URL || "postgresql://client_generation:unused@127.0.0.1:5432/client_generation",
    });
  }
}

if (require.main === module) ensureClients();
module.exports = { hasGeneratedModels, sqliteClientReady };
