const fs = require("fs");
const path = require("path");

const backupPath = process.argv[2];

if (!backupPath) {
  throw new Error("Usage: npm run db:verify-backup -- <backup-file>");
}

const resolved = path.resolve(backupPath);
const stat = fs.statSync(resolved);
const header = Buffer.alloc(16);
const fd = fs.openSync(resolved, "r");
fs.readSync(fd, header, 0, 16, 0);
fs.closeSync(fd);

if (stat.size < 1024) {
  throw new Error(`Backup is too small: ${resolved}`);
}

if (header.toString("utf8") !== "SQLite format 3\u0000") {
  throw new Error(`Backup is not a SQLite database: ${resolved}`);
}

console.log(`Backup verified: ${resolved} (${stat.size} bytes)`);
