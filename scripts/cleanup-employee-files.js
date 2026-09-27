const fs = require("node:fs/promises");
const path = require("node:path");
const { prisma } = require("../lib/db");
const { deleteEmployeeFile, employeeFileStorageInfo } = require("../lib/employee-file-storage");

const apply = process.argv.includes("--apply");
const retentionDays = Math.max(1, Number(process.env.EMPLOYEE_FILE_RETENTION_DAYS || 90));
const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

async function walk(root, current = root) {
  const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const target = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await walk(root, target));
    else if (entry.isFile()) files.push({ absolutePath: target, storageKey: path.relative(root, target).replaceAll("\\", "/") });
  }
  return files;
}

async function main() {
  const storage = employeeFileStorageInfo();
  const staleDocuments = await prisma.employeeDocument.findMany({
    where: { status: { in: ["REMOVED", "REPLACED"] }, uploadedAt: { lt: cutoff } },
    select: { id: true, status: true, storageKey: true, uploadedAt: true },
    orderBy: { uploadedAt: "asc" },
  });
  const activeKeys = new Set((await prisma.employeeDocument.findMany({ select: { storageKey: true } })).map((item) => item.storageKey));
  let orphanFiles = [];

  if (storage.provider === "local") {
    const localFiles = await walk(storage.root);
    orphanFiles = (await Promise.all(localFiles.map(async (file) => ({ ...file, stat: await fs.stat(file.absolutePath) }))))
      .filter((file) => !file.storageKey.startsWith("_verification/") && !activeKeys.has(file.storageKey) && file.stat.mtime < cutoff)
      .map(({ storageKey, stat }) => ({ storageKey, modifiedAt: stat.mtime }));
  }

  if (apply) {
    for (const document of staleDocuments) await deleteEmployeeFile(document.storageKey);
    for (const orphan of orphanFiles) await deleteEmployeeFile(orphan.storageKey);
  }

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    provider: storage.provider,
    retentionDays,
    cutoff: cutoff.toISOString(),
    staleDatabaseObjects: staleDocuments,
    orphanLocalObjects: orphanFiles,
    objectCount: staleDocuments.length + orphanFiles.length,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
