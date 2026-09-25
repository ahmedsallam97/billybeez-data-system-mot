const fs = require("node:fs");
const path = require("node:path");

const sqlitePath = path.join(process.cwd(), "prisma", "schema.prisma");
const postgresPath = path.join(process.cwd(), "prisma", "schema.postgres.prisma");

function postgresSchemaFromSqlite(source) {
  let result = String(source);
  result = result.replace(/generator client \{\s*provider = "prisma-client-js"\s*\}/, 'generator client {\n  provider = "prisma-client-js"\n  output   = "../generated/postgres-client"\n}');
  result = result.replace(/datasource db \{\s*provider = "sqlite"\s*url\s*= env\("DATABASE_URL"\)\s*\}/, 'datasource db {\n  provider = "postgresql"\n  url      = env("POSTGRES_DATABASE_URL")\n}');
  if (!result.includes('provider = "postgresql"') || !result.includes('env("POSTGRES_DATABASE_URL")')) throw new Error("Could not convert the SQLite datasource to PostgreSQL");
  return `// Generated from prisma/schema.prisma by scripts/sync-postgres-schema.js.\n// Edit the authoritative SQLite schema, then run npm run db:pg:sync-schema.\n\n${result}`;
}

if (require.main === module) {
  fs.writeFileSync(postgresPath, postgresSchemaFromSqlite(fs.readFileSync(sqlitePath, "utf8")));
  console.log(`PostgreSQL schema synchronized: ${postgresPath}`);
}

module.exports = { postgresSchemaFromSqlite };
