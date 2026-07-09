const { createBackup } = require("../lib/db-backups");

const backup = createBackup("manual");

console.log(`Database backup created: ${backup.path}`);
