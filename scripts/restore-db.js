const path = require("path");
const { restoreBackup } = require("../lib/db-backups");

const backupPath = process.argv[2];

if (!backupPath) {
  throw new Error("Usage: npm run db:restore -- <backup-file>");
}

const result = restoreBackup(path.basename(path.resolve(backupPath)));

console.log(`Database restored from: ${result.restoredFrom}`);
if (result.safetyBackup) console.log(`Previous database safety backup: ${result.safetyBackup}`);
