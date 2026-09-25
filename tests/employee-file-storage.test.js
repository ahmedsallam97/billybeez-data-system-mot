const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.join(process.cwd(), "tmp", `employee-storage-test-${process.pid}`);
process.env.EMPLOYEE_FILE_STORAGE_PROVIDER = "local";
process.env.EMPLOYEE_FILE_STORAGE_ROOT = root;
const { deleteEmployeeFile, readEmployeeFile, writeEmployeeFile } = require("../lib/employee-file-storage");

test("local employee file adapter round-trips protected files and rejects traversal", async () => {
  try {
    await writeEmployeeFile("employee-1/document.txt", Buffer.from("protected"), "text/plain");
    assert.equal((await readEmployeeFile("employee-1/document.txt")).toString(), "protected");
    await assert.rejects(() => readEmployeeFile("../outside.txt"), /Invalid employee file storage key/);
    await deleteEmployeeFile("employee-1/document.txt");
    await assert.rejects(() => readEmployeeFile("employee-1/document.txt"));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
