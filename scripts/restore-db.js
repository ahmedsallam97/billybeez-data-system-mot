const fs = require("fs");
const path = require("path");
const { databasePath } = require("./db-path");

const backupPath = process.argv[2];

if (!backupPath) {
  throw new Error("Usage: npm run db:restore -- <backup-file>");
}

const source = path.resolve(backupPath);
const target = databasePath();
const backupDir = path.resolve(__dirname, "..", "backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const safetyBackup = path.join(backupDir, `pre-restore-${stamp}.db`);

if (!fs.existsSync(source)) {
  throw new Error(`Backup file not found: ${source}`);
}

fs.mkdirSync(backupDir, { recursive: true });
if (fs.existsSync(target)) {
  fs.copyFileSync(target, safetyBackup);
}
fs.copyFileSync(source, target);

console.log(`Database restored from: ${source}`);
if (fs.existsSync(safetyBackup)) console.log(`Previous database safety backup: ${safetyBackup}`);
