const fs = require("fs");
const path = require("path");

function databasePath() {
  const raw = process.env.DATABASE_URL || "file:./dev.db";
  const filePath = raw.startsWith("file:") ? raw.slice(5) : raw;
  return path.resolve(__dirname, "..", "prisma", filePath.replace(/^\.\//, ""));
}

const source = databasePath();
const backupDir = path.resolve(__dirname, "..", "backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(backupDir, `dev-${stamp}.db`);

if (!fs.existsSync(source)) {
  throw new Error(`Database file not found: ${source}`);
}

fs.mkdirSync(backupDir, { recursive: true });
fs.copyFileSync(source, target);

console.log(`Database backup created: ${target}`);
