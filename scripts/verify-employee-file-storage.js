const crypto = require("node:crypto");
const {
  deleteEmployeeFile,
  employeeFileStorageInfo,
  readEmployeeFile,
  writeEmployeeFile,
} = require("../lib/employee-file-storage");

async function main() {
  const storage = employeeFileStorageInfo();
  const key = `_verification/${crypto.randomUUID()}.txt`;
  const payload = Buffer.from(`Billy Beez storage verification ${crypto.randomUUID()}`, "utf8");

  try {
    await writeEmployeeFile(key, payload, "text/plain");
    const restored = await readEmployeeFile(key);
    if (!crypto.timingSafeEqual(crypto.createHash("sha256").update(payload).digest(), crypto.createHash("sha256").update(restored).digest())) {
      throw new Error("Employee storage returned different content from the uploaded verification object");
    }
  } finally {
    await deleteEmployeeFile(key).catch(() => {});
  }

  console.log(JSON.stringify({ verified: true, provider: storage.provider, target: storage.provider === "local" ? storage.root : `${storage.bucket}/${storage.prefix}` }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
