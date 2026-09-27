const { spawnSync, spawn } = require("node:child_process");

const provider = String(process.env.DATABASE_PROVIDER || "sqlite").toLowerCase();
const prismaCli = require.resolve("prisma/build/index.js");
const databaseArgs = provider === "postgresql"
  ? ["prisma", "migrate", "deploy", "--schema", "prisma/postgres/schema.prisma"]
  : ["prisma", "db", "push", "--schema", "prisma/schema.prisma", "--skip-generate"];
const prepared = spawnSync(process.execPath, [prismaCli, ...databaseArgs.slice(1)], { stdio: "inherit", env: process.env });
if (prepared.status !== 0) process.exit(prepared.status || 1);

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", process.env.HOSTNAME || "0.0.0.0", "-p", process.env.PORT || "3000"], { stdio: "inherit", env: process.env });
server.on("exit", (code, signal) => signal ? process.kill(process.pid, signal) : process.exit(code || 0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.kill(signal));
