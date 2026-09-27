const fs = require("node:fs");
const { spawnSync } = require("node:child_process");

const prismaCli = require.resolve("prisma/build/index.js");

function generate(args, extraEnv = {}) {
  const result = spawnSync(process.execPath, [prismaCli, ...args], { stdio: "inherit", env: { ...process.env, ...extraEnv } });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

if (!fs.existsSync("node_modules/.prisma/client/default.js")) generate(["generate", "--schema", "prisma/schema.prisma"]);
if (!fs.existsSync("generated/postgres-client/index.js")) {
  generate(["generate", "--schema", "prisma/postgres/schema.prisma"], {
    POSTGRES_DATABASE_URL: process.env.POSTGRES_DATABASE_URL || "postgresql://client_generation:unused@127.0.0.1:5432/client_generation",
  });
}
