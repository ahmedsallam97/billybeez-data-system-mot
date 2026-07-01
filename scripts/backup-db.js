const fs = require("fs");
const path = require("path");
const { databasePath } = require("./db-path");

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
