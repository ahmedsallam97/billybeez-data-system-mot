const test = require("node:test"),
  assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const {
  readConfig,
  loadAccount,
  saveUser,
} = require("../lib/accounts/service");
const {
  removeEmployee,
  archiveWhere,
} = require("../lib/operations/employee-removal");
test("employee removal rechecks password, permissions and scope; preserves history and supports restoration", async () => {
  const root = fs.mkdtempSync(path.resolve("tmp/employee-removal-")),
    database = path.join(root, "test.db");
  const source = new DatabaseSync(path.resolve("prisma/dev.db"), {
    readOnly: true,
  });
  source.prepare("VACUUM INTO ?").run(database);
  source.close();
  const db = new PrismaClient({
    datasources: { db: { url: `file:${database.replaceAll("\\", "/")}` } },
  });
  try {
    const { config } = await readConfig(db);
    const role = config.roles.find((role) => role.name === "Super Admin");
    const id = Object.entries(config.accounts).find(
      ([, p]) => p.roleId === role.id && !p.archivedAt,
    )[0];
    const password = "Removal-Test-Password-2026";
    const user = await db.user.update({
      where: { id },
      data: { password: await bcrypt.hash(password, 4), active: true },
    });
    const actor = await loadAccount(db, user);
    const empty = await db.employee.create({
      data: { name: "Removal empty fixture", branch: "MOT", active: false },
    });
    const auditCount = await db.auditLog.count();
    await assert.rejects(
      removeEmployee(db, actor, empty.id, { password: "wrong" }),
      { status: 403 },
    );
    assert.ok(await db.employee.findUnique({ where: { id: empty.id } }));
    assert.equal(await db.auditLog.count(), auditCount);
    await assert.rejects(
      removeEmployee(db, { ...actor, permissions: {} }, empty.id, { password }),
      { status: 403 },
    );
    assert.equal(
      (await removeEmployee(db, actor, empty.id, { password })).outcome,
      "deleted",
    );
    assert.equal(
      await db.employee.findUnique({ where: { id: empty.id } }),
      null,
    );
    const history = await db.employee.create({
      data: {
        name: "Removal history fixture",
        branch: "MOT",
        active: false,
        employmentStatus: "EXITED",
      },
    });
    const document = await db.employeeDocument.create({
      data: {
        employeeId: history.id,
        documentType: "OTHER",
        displayName: "Preserve document",
        storageKey: "removal-fixture-preserved.txt",
        mimeType: "text/plain",
        sizeBytes: 4,
      },
    });
    const originalDocument = await db.employeeDocument.findUnique({
      where: { id: document.id },
    });
    assert.equal(
      (await removeEmployee(db, actor, history.id, { password })).outcome,
      "archived",
    );
    assert.ok(
      await db.employeeEmploymentEvent.findFirst({
        where: { employeeId: history.id, ...archiveWhere },
      }),
    );
    assert.equal(
      await db.employee.count({
        where: { id: history.id, employmentEvents: { none: archiveWhere } },
      }),
      0,
    );
    assert.deepEqual(
      await db.employeeDocument.findUnique({ where: { id: document.id } }),
      originalDocument,
    );
    assert.equal(
      (await removeEmployee(db, actor, history.id, { password, restore: true }))
        .outcome,
      "restored",
    );
    const restored = await db.employee.findUnique({
      where: { id: history.id },
    });
    assert.equal(restored.active, false);
    assert.equal(restored.employmentStatus, "EXITED");
    assert.equal(
      await db.employee.count({
        where: { id: history.id, employmentEvents: { none: archiveWhere } },
      }),
      1,
    );
    const scoped = await saveUser(db, actor, {
      name: "Scoped removal fixture",
      username: "scoped-removal-fixture",
      roleId: config.roles.find((r) => r.name === "Operation Supervisor").id,
      branches: ["MOT"],
      dataScope: "BRANCH",
      overrides: {
        "employees.archive": "BRANCH",
        "employees.restore": "BRANCH",
      },
      temporaryPassword: password,
      forcePasswordChange: false,
    });
    const other = await db.employee.create({
      data: { name: "Other branch removal fixture", branch: "OTHER" },
    });
    await assert.rejects(removeEmployee(db, scoped, other.id, { password }), {
      status: 403,
    });
    assert.ok(await db.employee.findUnique({ where: { id: other.id } }));
    const stale = {
      ...actor,
      profile: {
        ...actor.profile,
        sessionVersion: actor.profile.sessionVersion - 1,
      },
    };
    await assert.rejects(removeEmployee(db, stale, other.id, { password }), {
      status: 401,
    });
    const overtimeOnly = await db.employee.create({ data: { name: 'Removal overtime fixture', branch: 'MOT', active: false } });
    await db.opsOvertimeAccount.create({ data: { employeeId: overtimeOnly.id } });
    assert.equal((await removeEmployee(db, actor, overtimeOnly.id, { password })).outcome, 'archived');
    assert.ok(await db.opsOvertimeAccount.findUnique({ where: { employeeId: overtimeOnly.id } }));
    const configured = await db.employee.create({ data: { name: 'Removal configuration fixture', branch: 'MOT', active: false } });
    await db.systemSetting.create({ data: { key: 'EMPLOYEE_REMOVAL_TEST_REFERENCE', value: JSON.stringify({ employeeId: configured.id }) } });
    assert.equal((await removeEmployee(db, actor, configured.id, { password })).outcome, 'archived');
    assert.ok(await db.employee.findUnique({ where: { id: configured.id } }));
    const logs = await db.auditLog.findMany({
      where: {
        action: { startsWith: "OPS_EMPLOYEE_" },
        metadata: { contains: "Removal" },
      },
    });
    assert.equal(logs.length, 5);
    assert.ok(
      logs.every(
        (log) =>
          !log.metadata.includes(password) &&
          !log.metadata.includes("password"),
      ),
    );
    assert.ok(
      logs.every(
        (log) =>
          JSON.parse(log.metadata).before && JSON.parse(log.metadata).after,
      ),
    );
  } finally {
    await db.$disconnect();
  }
});
