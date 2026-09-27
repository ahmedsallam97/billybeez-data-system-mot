const { spawnSync } = require("node:child_process");

const prismaCli = require.resolve("prisma/build/index.js");
const result = spawnSync(process.execPath, [prismaCli, "validate", "--schema", "prisma/postgres/schema.prisma"], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    POSTGRES_DATABASE_URL: process.env.POSTGRES_DATABASE_URL || "postgresql://schema_validation:unused@127.0.0.1:5432/schema_validation",
  },
  stdio: "inherit",
});

if (result.error) console.error(result.error.message);
process.exitCode = result.status == null ? 1 : result.status;
