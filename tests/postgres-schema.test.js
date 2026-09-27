const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { postgresSchemaFromSqlite } = require("../scripts/sync-postgres-schema");

test("PostgreSQL schema is generated in parity with the authoritative SQLite schema", () => {
  const sqlite = fs.readFileSync("prisma/schema.prisma", "utf8");
  const postgres = fs.readFileSync("prisma/postgres/schema.prisma", "utf8");
  assert.equal(postgres, postgresSchemaFromSqlite(sqlite));
  assert.match(postgres, /model EmployeeIncident/);
  assert.match(postgres, /output\s+= "\.\.\/\.\.\/generated\/postgres-client"/);
  assert.match(fs.readFileSync("prisma/postgres/migrations/0001_baseline/migration.sql", "utf8"), /CREATE TABLE/);
  assert.match(fs.readFileSync("prisma/postgres/migrations/migration_lock.toml", "utf8"), /provider = "postgresql"/);
});
