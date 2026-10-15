const { spawn, spawnSync } = require("node:child_process");
const { assertIsolatedEnvironment } = require("./isolation");
assertIsolatedEnvironment();
const next = require.resolve("next/dist/bin/next");
const production = process.env.OPS_E2E_PRODUCTION === "1";
if (production) {
  const build = spawnSync(process.execPath, [next, "build", "--webpack"], { stdio: "inherit", env: process.env, windowsHide: true });
  if (build.status !== 0) process.exit(build.status || 1);
}
const server = spawn(process.execPath, [next, production ? "start" : "dev", ...(!production ? ["--webpack"] : []), "-H", "127.0.0.1", "-p", "3018"], { stdio: "inherit", env: { ...process.env, COOKIE_SECURE: "false" }, windowsHide: true });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => server.kill(signal));
server.on("exit", (code) => process.exit(code || 0));
