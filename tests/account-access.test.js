const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const {
  createBundle,
  restoreBundle,
  inspectDatabase,
} = require("../scripts/pilot-backup");
const {
  KEY,
  migrateAccounts,
  readConfig,
  loadAccount,
  saveUser: serviceSaveUser,
  saveRole,
  editPersonalProfile,
  revokeSessions,
  changePassword,
  accountInScope,
  assertCeiling,
} = require("../lib/accounts/service");
const {
  effectivePermissions,
  ROLE_NAMES,
  PERMISSIONS,
  OPERATIONS_PERMISSIONS,
  isOperationsRole,
  managementRole,
} = require("../lib/accounts/registry");
const saveUser = (db, actor, body, id) =>
  serviceSaveUser(db, actor, { ...body, confirmDestructive: true }, id);
const { context } = require("../lib/accounts/context");
const { scopedClient, resolveScope } = require("../lib/accounts/enforcement");
const { imageBytes, setAvatar } = require("../lib/accounts/avatar");
const sharp = require("sharp");
test("unified account migration, security, permissions, scopes, photos and verified restoration", async (t) => {
  const outputRoot = path.resolve(process.env.OPS_E2E_OUTPUT_ROOT || "tmp");
  fs.mkdirSync(outputRoot, { recursive: true });
  const root = fs.mkdtempSync(path.join(outputRoot, "account-unit-")),
    database = path.join(root, "test.db"),
    storage = path.join(root, "files");
  fs.cpSync(path.resolve(process.env.OPS_E2E_SOURCE_STORAGE || "storage/employee-files"), storage, {
    recursive: true,
  });
  const originalFileCount = require("../scripts/pilot-backup").filesUnder(
    storage,
  ).length;
  const source = new DatabaseSync(path.resolve(process.env.OPS_E2E_SOURCE_DATABASE || "prisma/dev.db"), {
    readOnly: true,
  });
  source.prepare("VACUUM INTO ?").run(database);
  source.close();
  const db = new PrismaClient({
    datasources: { db: { url: "file:" + database.replaceAll("\\", "/") } },
  });
  const previousStorage = process.env.EMPLOYEE_FILE_STORAGE_ROOT,
    previousProvider = process.env.EMPLOYEE_FILE_STORAGE_PROVIDER;
  process.env.EMPLOYEE_FILE_STORAGE_ROOT = storage;
  process.env.EMPLOYEE_FILE_STORAGE_PROVIDER = "local";
  let actor, created;
  try {
    await t.test(
      "migration is idempotent, retains every user/hash/reference and seeds exact roles and Sallam",
      async () => {
        await db.systemSetting.deleteMany({ where: { key: KEY } });
        const before = inspectDatabase(database).tables.User;
        const config = await migrateAccounts(db);
        assert.equal(config.migrated, true);
        assert.deepEqual(
          config.roles.slice(0, 5).map((r) => r.name),
          ROLE_NAMES,
        );
        assert.equal(
          inspectDatabase(database).tables.User.sha256,
          before.sha256,
        );
        assert.equal((await migrateAccounts(db)).migrated, false);
        const oldConfig = JSON.parse(
          (await db.systemSetting.findUnique({ where: { key: KEY } })).value,
        );
        const hiddenBefore = structuredClone(
          oldConfig.roles.filter((r) => !isOperationsRole(r)),
        );
        delete oldConfig.permissionVersion;
        const additions = [
          "schedules.archive",
          "reports.lock",
          "reports.unlock",
          "notifications.archive",
          "notifications.restore",
        ];
        for (const role of oldConfig.roles.filter(isOperationsRole))
          for (const key of additions) {
            delete role.permissions[key];
            delete role.defaults[key];
          }
        const migrationAdmin = Object.keys(oldConfig.accounts).find(
          (id) => oldConfig.accounts[id].roleId === "role-1",
        );
        oldConfig.accounts[migrationAdmin].overrides["reports.edit"] = null;
        await db.systemSetting.update({
          where: { key: KEY },
          data: { value: JSON.stringify(oldConfig) },
        });
        const upgraded = await migrateAccounts(db);
        assert.equal(upgraded.upgraded, true);
        assert.equal(upgraded.permissionVersion, 2);
        assert.equal(
          upgraded.accounts[migrationAdmin].overrides["reports.lock"],
          null,
        );
        assert.equal(
          upgraded.accounts[migrationAdmin].overrides["reports.unlock"],
          null,
        );
        assert.deepEqual(
          upgraded.roles.filter((r) => !isOperationsRole(r)),
          hiddenBefore,
        );
        assert.equal((await migrateAccounts(db)).upgraded, false);
        delete upgraded.accounts[migrationAdmin].overrides["reports.edit"];
        delete upgraded.accounts[migrationAdmin].overrides["reports.lock"];
        delete upgraded.accounts[migrationAdmin].overrides["reports.unlock"];
        delete upgraded.migrated;
        delete upgraded.upgraded;
        await db.systemSetting.update({
          where: { key: KEY },
          data: { value: JSON.stringify(upgraded) },
        });
        const admin = await db.user.findFirst({
          where: { active: true, role: "ADMIN" },
          orderBy: { createdAt: "asc" },
          include: { employee: true },
        });
        actor = await loadAccount(db, admin);
        assert.equal(actor.profile.displayName, "Sallam");
        assert.equal(actor.roleName, "Super Admin");
        assert.equal(Object.keys(actor.permissions).length, PERMISSIONS.length);
      },
    );
    await t.test(
      "hidden legacy roles, accounts and grants stay preserved and outside management",
      async () => {
        const { config } = await readConfig(db);
        const hidden = config.roles.filter((r) => !isOperationsRole(r));
        assert.ok(hidden.length);
        assert.ok(
          OPERATIONS_PERMISSIONS.every(
            (p) => !p.legacy && p.module !== "legacy",
          ),
        );
        for (const role of hidden) {
          await assert.rejects(
            saveRole(db, actor, {
              id: role.id,
              name: role.name,
              permissions: {},
            }),
            /Hidden legacy/,
          );
          const id = Object.keys(config.accounts).find(
            (id) => config.accounts[id].roleId === role.id,
          );
          if (id) {
            await assert.rejects(
              saveUser(db, actor, { name: "Forbidden" }, id),
              /Hidden legacy/,
            );
            await assert.rejects(
              revokeSessions(db, actor, id),
              /Hidden legacy/,
            );
          }
        }
        await assert.rejects(
          saveRole(db, actor, {
            name: "POS injection",
            permissions: { ORDER_MANAGE: "ALL" },
          }),
          /Unknown Operations/,
        );
        const role = config.roles[1];
        const saved = await saveRole(db, actor, managementRole(role));
        assert.deepEqual(saved.permissions, role.permissions);
        assert.deepEqual(
          (await readConfig(db)).config.roles.filter(
            (r) => !isOperationsRole(r),
          ),
          hidden,
        );
        assert.throws(
          () =>
            assertCeiling(
              { ...actor, permissions: { "employees.view": "BRANCH" } },
              { "employees.view": "SELECTED" },
            ),
          /Scope exceeds/,
        );
        assert.equal(
          accountInScope(
            {
              ...actor,
              permissions: { "users.view": "OWN" },
              profile: { ...actor.profile, dataScope: "OWN" },
            },
            { id: "other", profile: { branches: ["MOT"] } },
            "users.view",
          ),
          false,
        );
      },
    );
    await t.test(
      "creation, duplicate username/email and existing employee links",
      async () => {
        created = await saveUser(db, actor, {
          name: "Account test",
          displayName: "Test",
          username: "account-unit-test",
          email: "account-test@example.test",
          roleId: "role-5",
          branches: ["MOT"],
          dataScope: "BRANCH",
          temporaryPassword: "Temporary-Test-2045",
          forcePasswordChange: false,
        });
        assert.equal(created.roleName, "Operation Supervisor");
        assert.equal(created.profile.sessionVersion, 1);
        assert.ok(
          await bcrypt.compare(
            "Temporary-Test-2045",
            (await db.user.findUnique({ where: { id: created.id } })).password,
          ),
        );
        await assert.rejects(
          saveUser(db, actor, {
            name: "Duplicate",
            username: "ACCOUNT-UNIT-TEST",
            roleId: "role-5",
            branches: ["MOT"],
            temporaryPassword: "Temporary-Test-2045",
          }),
          /Username is already/,
        );
        await assert.rejects(
          saveUser(db, actor, {
            name: "Duplicate",
            username: "other-unit-test",
            email: "ACCOUNT-TEST@example.test",
            roleId: "role-5",
            branches: ["MOT"],
            temporaryPassword: "Temporary-Test-2045",
          }),
          /Email is already/,
        );
        await assert.rejects(
          saveUser(
            db,
            actor,
            { id: created.id, employeeId: "missing" },
            created.id,
          ),
          /Employee not found/,
        );
      },
    );
    await t.test(
      "database-backed custom roles, individual denials and dependency-ready permissions",
      async () => {
        const role = await saveRole(db, actor, {
          name: "Scoped Test Role",
          permissions: {
            "employees.view": "BRANCH",
            "employees.sensitive": "BRANCH",
            "files.upload": "BRANCH",
          },
        });
        created = await saveUser(
          db,
          actor,
          { roleId: role.id, overrides: { "files.upload": null } },
          created.id,
        );
        assert.equal(created.permissions["files.upload"], undefined);
        assert.equal(created.permissions["employees.view"], "BRANCH");
        assert.equal(
          effectivePermissions({ ...role, active: false }, created.profile)[
            "employees.view"
          ],
          undefined,
        );
        assert.equal(created.permissions["no-such-permission"], undefined);
        await assert.rejects(
          serviceSaveUser(
            db,
            actor,
            { overrides: { "employees.view": null } },
            created.id,
          ),
          /Confirm destructive account/,
        );
        await assert.rejects(
          saveRole(db, actor, {
            id: role.id,
            name: role.name,
            permissions: {},
          }),
          /Confirm destructive/,
        );
      },
    );
    await t.test(
      "profile fields are editable, access fields immutable and name never authorizes",
      async () => {
        created = await editPersonalProfile(db, created, {
          displayName: "Sallam",
          name: "Personal Test",
          phone: "0123",
          preferredLanguage: "en",
        });
        assert.equal(created.profile.displayName, "Sallam");
        assert.equal(created.permissions["users.edit"], undefined);
        await assert.rejects(
          editPersonalProfile(db, created, { roleId: "role-1" }),
          /read-only/,
        );
        await assert.rejects(
          saveRole(db, created, {
            name: "Escalation",
            permissions: { "users.edit": "ALL" },
          }),
          /Permission denied/,
        );
      },
    );
    await t.test(
      "self-lockout, critical Super Admin grants and final full administrator are protected transactionally",
      async () => {
        await assert.rejects(
          saveUser(db, actor, { active: false }, actor.id),
          /cannot deactivate yourself/,
        );
        await assert.rejects(
          saveUser(db, actor, { overrides: { "users.edit": null } }, actor.id),
          /account-management access/,
        );
        const { config } = await readConfig(db);
        await assert.rejects(
          saveRole(db, actor, {
            ...config.roles[0],
            permissions: {},
            confirmDestructive: true,
          }),
          /account-management|Super Admin/,
        );
        await assert.rejects(
          saveRole(db, actor, {
            ...managementRole(config.roles[0]),
            active: false,
          }),
          /cannot be deactivated/,
        );
      },
    );
    await t.test(
      "own, team and branch query scopes cover list, direct ID, relation includes and writes",
      async () => {
        const outside = await db.employee.create({
          data: {
            name: "Account outside employee",
            department: "OPERATION",
            branch: "OUTSIDE",
          },
        });
        const inside = await db.employee.findFirst({
          where: { active: true, OR: [{ branch: "MOT" }, { branch: null }] },
        });
        const scoped = scopedClient(db);
        const scope = await resolveScope(db, created, "employees.view");
        await context.run(scope, async () => {
          const employees = await scoped.employee.findMany();
          assert.ok(!employees.some((e) => e.id === outside.id));
          assert.equal(
            await scoped.employee.findUnique({ where: { id: outside.id } }),
            null,
          );
          await assert.rejects(
            scoped.employee.update({
              where: { id: outside.id },
              data: { name: "Forbidden" },
            }),
          );
          await assert.rejects(
            scoped.employeeQualification.create({
              data: {
                employeeId: outside.id,
                positionCode: "CASHIER",
                status: "QUALIFIED",
              },
            }),
            /access denied/,
          );
        });
        const own = {
          ...created,
          employeeId: inside.id,
          profile: { ...created.profile, dataScope: "OWN" },
          permissions: { ...created.permissions, "employees.view": "ALL" },
        };
        await context.run(
          await resolveScope(db, own, "employees.view"),
          async () =>
            assert.deepEqual(
              (await scoped.employee.findMany()).map((e) => e.id),
              [inside.id],
            ),
        );
        const team = {
          ...own,
          profile: { ...own.profile, dataScope: "TEAM", teamIds: [inside.id] },
        };
        await context.run(
          await resolveScope(db, team, "employees.view"),
          async () =>
            assert.deepEqual(
              (await scoped.employee.findMany()).map((e) => e.id),
              [inside.id],
            ),
        );
      },
    );
    await t.test(
      "image validation, optimization, replacement/removal and initials-compatible null fallback",
      async () => {
        const buffer = await sharp({
          create: {
            width: 100,
            height: 100,
            channels: 3,
            background: "#00ccff",
          },
        })
          .png()
          .toBuffer();
        const file = {
          type: "image/png",
          size: buffer.length,
          arrayBuffer: async () => buffer,
        };
        const optimized = await imageBytes(file);
        assert.equal((await sharp(optimized).metadata()).format, "webp");
        await assert.rejects(
          imageBytes({
            type: "image/png",
            size: 12,
            arrayBuffer: async () => Buffer.from("not-an-image"),
          }),
        );
        await assert.rejects(
          imageBytes({
            type: "image/svg+xml",
            size: 1,
            arrayBuffer: async () => Buffer.from("<svg/>"),
          }),
          /Use a JPG/,
        );
        await assert.rejects(
          imageBytes({ ...file, size: 6 * 1024 * 1024 }),
          /up to 5 MB/,
        );
        created = await setAvatar(db, created, created.id, file);
        assert.ok(created.profile.avatar.url);
        assert.equal(
          fs.readdirSync(path.join(storage, "accounts", created.id)).length,
          1,
        );
        created = await setAvatar(db, created, created.id, file);
        assert.equal(
          fs.readdirSync(path.join(storage, "accounts", created.id)).length,
          1,
        );
      },
    );
    await t.test(
      "verified backup restores database-backed profile, permissions and avatar bytes",
      async () => {
        const bundle = path.join(root, "bundle");
        createBundle({ database, storage, target: bundle });
        const restored = path.join(root, "restored");
        const verified = restoreBundle(bundle, restored);
        assert.equal(verified.integrity, "ok");
        assert.equal(verified.files.length, originalFileCount + 1);
        assert.equal(
          inspectDatabase(path.join(restored, "database", "operations.db"))
            .tables.SystemSetting.sha256,
          inspectDatabase(database).tables.SystemSetting.sha256,
        );
        created = await setAvatar(db, created, created.id, null);
        assert.equal(created.profile.avatar, null);
        assert.equal(
          fs.readdirSync(path.join(storage, "accounts", created.id)).length,
          0,
        );
      },
    );
    await t.test(
      "password reset forces change, password change and session revocation increment the epoch",
      async () => {
        const start = created.profile.sessionVersion;
        created = await saveUser(
          db,
          actor,
          {
            temporaryPassword: "Temporary-New-2045",
            forcePasswordChange: true,
          },
          created.id,
        );
        assert.equal(created.profile.forcePasswordChange, true);
        assert.ok(created.profile.sessionVersion > start);
        await assert.rejects(
          changePassword(db, created, {
            currentPassword: "wrong",
            newPassword: "User-Changed-2045",
          }),
          /incorrect/,
        );
        created = await changePassword(db, created, {
          currentPassword: "Temporary-New-2045",
          newPassword: "User-Changed-2045",
        });
        assert.equal(created.profile.forcePasswordChange, false);
        const oldVersion = created.profile.sessionVersion;
        await revokeSessions(db, actor, created.id);
        created = await loadAccount(
          db,
          await db.user.findUnique({
            where: { id: created.id },
            include: { employee: true },
          }),
        );
        assert.equal(created.profile.sessionVersion, oldVersion + 1);
      },
    );
    await t.test(
      "archive/restore keeps historical User identity and audits every account mutation",
      async () => {
        const id = created.id;
        created = await saveUser(db, actor, { archive: true }, id);
        assert.equal(created.active, false);
        assert.ok(created.profile.archivedAt);
        created = await saveUser(
          db,
          actor,
          { restore: true, active: true },
          id,
        );
        assert.equal(created.id, id);
        assert.equal(created.profile.archivedAt, null);
        const logs = await db.auditLog.findMany({
          where: { action: { startsWith: "ACCOUNT_" } },
        });
        for (const action of [
          "ACCOUNT_CREATED",
          "ACCOUNT_PROFILE_UPDATED",
          "ACCOUNT_ROLE_UPDATED",
          "ACCOUNT_SESSIONS_REVOKED",
          "ACCOUNT_PASSWORD_CHANGED",
          "ACCOUNT_AVATAR_UPDATED",
          "ACCOUNT_AVATAR_REMOVED",
        ])
          assert.ok(
            logs.some((l) => l.action === action),
            action,
          );
        assert.ok(
          !logs.some((l) => (l.metadata || "").includes("Temporary-New-2045")),
        );
      },
    );
  } finally {
    await db.$disconnect();
    if (previousStorage === undefined)
      delete process.env.EMPLOYEE_FILE_STORAGE_ROOT;
    else process.env.EMPLOYEE_FILE_STORAGE_ROOT = previousStorage;
    if (previousProvider === undefined)
      delete process.env.EMPLOYEE_FILE_STORAGE_PROVIDER;
    else process.env.EMPLOYEE_FILE_STORAGE_PROVIDER = previousProvider;
  }
});
