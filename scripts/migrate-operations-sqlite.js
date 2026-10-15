const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { createHash } = require("node:crypto");

function migrate(dbPath) {
  if (!fs.existsSync(dbPath)) throw new Error("Existing SQLite database required; this command never creates or seeds a database");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;");
    db.exec("CREATE TABLE IF NOT EXISTS _OperationsMigration (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, appliedAt TEXT NOT NULL)");
    for (const name of fs.readdirSync(path.resolve(__dirname, "../prisma/sqlite-migrations")).filter((name) => name.endsWith(".sql")).sort()) {
      const sql = fs.readFileSync(path.resolve(__dirname, "../prisma/sqlite-migrations", name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = db.prepare("SELECT checksum FROM _OperationsMigration WHERE name=?").get(name);
      if (previous) { if (previous.checksum !== checksum) throw new Error(`Applied migration changed: ${name}`); continue; }
      db.exec("BEGIN IMMEDIATE");
      try {
        db.exec(sql);
        db.prepare("INSERT INTO _OperationsMigration VALUES (?, ?, ?)").run(name, checksum, new Date().toISOString());
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    }
    return db.prepare("SELECT name, appliedAt FROM _OperationsMigration ORDER BY name").all();
  } finally { db.close(); }
}
if (require.main === module) {
  const dbPath = process.argv[2];
  if (!dbPath) throw new Error("Usage: node scripts/migrate-operations-sqlite.js <explicit-existing-db-path>. Back up the operating database first.");
  console.log(JSON.stringify(migrate(path.resolve(dbPath)), null, 2));
}
module.exports = { migrate };
