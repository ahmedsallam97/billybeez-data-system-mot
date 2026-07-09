const fs = require("fs");
const path = require("path");
const { databasePath } = require("../scripts/db-path");

const BACKUP_DIR = path.resolve(process.cwd(), "backups");

function backupDir() {
  return BACKUP_DIR;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function isSafeBackupName(name) {
  return /^[a-zA-Z0-9_.-]+\.db$/.test(String(name || ""));
}

function backupPathFromName(name) {
  if (!isSafeBackupName(name)) {
    throw new Error("Invalid backup file name");
  }

  return path.join(BACKUP_DIR, name);
}

function verifyBackupFile(filePath) {
  const stat = fs.statSync(filePath);
  const header = Buffer.alloc(16);
  const fd = fs.openSync(filePath, "r");
  fs.readSync(fd, header, 0, 16, 0);
  fs.closeSync(fd);

  if (stat.size < 1024) {
    throw new Error("Backup is too small");
  }

  if (header.toString("utf8") !== "SQLite format 3\u0000") {
    throw new Error("Backup is not a SQLite database");
  }

  return stat;
}

function listBackups() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  return fs.readdirSync(BACKUP_DIR)
    .filter(isSafeBackupName)
    .map((name) => {
      const filePath = backupPathFromName(name);
      const stat = fs.statSync(filePath);
      return {
        name,
        size: stat.size,
        createdAt: stat.birthtime,
        modifiedAt: stat.mtime,
      };
    })
    .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
}

function createBackup(prefix = "manual") {
  const source = databasePath();
  if (!fs.existsSync(source)) {
    throw new Error(`Database file not found: ${source}`);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = `${prefix}-${timestamp()}.db`;
  const target = backupPathFromName(name);
  fs.copyFileSync(source, target);
  verifyBackupFile(target);

  return {
    name,
    path: target,
    ...listBackups().find((backup) => backup.name === name),
  };
}

function restoreBackup(name) {
  const source = backupPathFromName(name);
  if (!fs.existsSync(source)) {
    throw new Error("Backup file not found");
  }

  verifyBackupFile(source);
  const target = databasePath();
  fs.mkdirSync(BACKUP_DIR, { recursive: true });

  let safetyBackup = null;
  if (fs.existsSync(target)) {
    safetyBackup = createBackup("pre-restore");
  }

  fs.copyFileSync(source, target);

  return {
    restoredFrom: name,
    safetyBackup: safetyBackup?.name || "",
    restartRecommended: true,
  };
}

module.exports = {
  backupDir,
  backupPathFromName,
  createBackup,
  isSafeBackupName,
  listBackups,
  restoreBackup,
  verifyBackupFile,
};
