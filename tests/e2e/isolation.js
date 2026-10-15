const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { randomBytes } = require("node:crypto");
function sourceDatabasePath() { return path.resolve(process.env.OPS_E2E_SOURCE_DATABASE || "prisma/dev.db"); }
function outputRoot() { return path.resolve(process.env.OPS_E2E_OUTPUT_ROOT || "tmp/operations-e2e"); }
function within(parent, child) { const relative = path.relative(parent, child); return relative !== "" && !relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative); }
function prepareIsolatedEnvironment() {
  if (process.env.OPS_E2E_RUN_DIR) { assertIsolatedEnvironment(); return; }
  if (process.env.E2E_BASE_URL) throw new Error("External E2E servers are refused: Operations tests require a disposable local database.");
  const sourcePath = sourceDatabasePath(), root = path.join(outputRoot(), new Date().toISOString().replace(/[:.]/g, "-") + "-" + process.pid);
  if (within(outputRoot(), sourcePath)) throw new Error("The read-only E2E source cannot be inside the disposable output root.");
  fs.mkdirSync(root, { recursive: true });
  const dbPath = path.join(root, "test.db");
  const source = new DatabaseSync(sourcePath, { readOnly: true });
  try { source.exec("VACUUM INTO '" + dbPath.replaceAll("'", "''") + "'"); } finally { source.close(); }
  require("../../scripts/migrate-operations-sqlite").migrate(dbPath);
  const storage = path.join(root, "employee-files");
  const sourceStorage = path.resolve(process.env.OPS_E2E_SOURCE_STORAGE || "storage/employee-files");
  if (fs.existsSync(sourceStorage)) fs.cpSync(sourceStorage, storage, { recursive: true });
  Object.assign(process.env, { OPS_E2E_RUN_DIR: root, DATABASE_URL: "file:" + dbPath.replaceAll("\\", "/"), DATABASE_PROVIDER: "sqlite", EMPLOYEE_FILE_STORAGE_ROOT: storage, EMPLOYEE_FILE_STORAGE_PROVIDER: "local", SESSION_SECRET: randomBytes(48).toString("hex"), AUTH_COOKIE_NAME: "billybeez_e2e", E2E_MUTATIONS: "1", OPS_NEXT_DIST_DIR: process.env.OPS_NEXT_DIST_DIR || ".next-e2e" });
}
function assertIsolatedEnvironment() {
  const run = process.env.OPS_E2E_RUN_DIR && path.resolve(process.env.OPS_E2E_RUN_DIR);
  const value = process.env.DATABASE_URL || "", dbPath = path.resolve(value.replace(/^file:/, ""));
  if (!run || !within(outputRoot(), run) || path.dirname(dbPath) !== run || path.basename(dbPath) !== "test.db" || dbPath.toLowerCase() === sourceDatabasePath().toLowerCase()) throw new Error("Refusing E2E writes outside the disposable Operations database");
}
module.exports = { prepareIsolatedEnvironment, assertIsolatedEnvironment, sourceDatabasePath, outputRoot };
