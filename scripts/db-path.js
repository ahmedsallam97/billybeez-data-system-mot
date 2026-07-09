const path = require("path");

function databasePath() {
  const raw = process.env.DATABASE_URL || "file:./dev.db";
  const filePath = raw.startsWith("file:") ? raw.slice(5) : raw;
  return path.resolve(__dirname, "..", "prisma", filePath.replace(/^\.\//, ""));
}

module.exports = { databasePath };
