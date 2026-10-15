const { randomUUID } = require("node:crypto");
const bcrypt = require("bcryptjs");
const { ROLE_MATRIX, normalizeRoleMatrix } = require("../role-matrix");
const {
  PERMISSIONS,
  ROLE_NAMES,
  SCOPES,
  validateGrants,
  effectivePermissions,
  hasPermission,
  isOperationsRole,
  operationsGrants,
} = require("./registry");
const KEY = "ACCOUNT_ACCESS_CONFIG";
const failure = (message, status = 400) =>
  Object.assign(new Error(message), { status });
const clone = (value) => JSON.parse(JSON.stringify(value));
async function readConfig(db) {
  const row = await db.systemSetting.findUnique({ where: { key: KEY } });
  if (!row) throw failure("Account access migration is required", 503);
  let config;
  try {
    config = JSON.parse(row.value);
  } catch {
    throw failure("Account access configuration is invalid", 503);
  }
  if (config.version !== 1)
    throw failure("Unsupported account configuration", 503);
  // In-memory compatibility only: no live database migration on read. Explicit new overrides win.
  const additions={'development.view':'succession.view','development.create':'succession.create','development.edit':'succession.edit','performance_reports.view':'reports.view'};
  const legacyRoles=new Map(config.roles.map(role=>[role.id,new Set(Object.keys(role.permissions||{}))]));
  for(const role of config.roles.filter(isOperationsRole))for(const property of ['permissions','defaults'])for(const [key,source]of Object.entries(additions))if(!Object.hasOwn(role[property]||{},key)&&role[property]?.[source])role[property][key]=role[property][source];
  for(const profile of Object.values(config.accounts))for(const [key,source]of Object.entries(additions))if(!legacyRoles.get(profile.roleId)?.has(key)&&!Object.hasOwn(profile.overrides||{},key)&&Object.hasOwn(profile.overrides||{},source))profile.overrides[key]=profile.overrides[source];
  return { row, config };
}
async function defaultBranch(db) {
  const row = await db.systemSetting.findUnique({
    where: { key: "OPS_BRANCH_CONFIG" },
  });
  return String(
    JSON.parse(row?.value || "{}").branchCode || "MOT",
  ).toUpperCase();
}
function initialRoles(matrix) {
  const grants = (legacy) =>
    Object.fromEntries(
      PERMISSIONS.filter((p) => (matrix[p.source] || []).includes(legacy)).map(
        (p) => [p.key, "ALL"],
      ),
    );
  return ROLE_NAMES.map((name, index) => ({
    id: `role-${index + 1}`,
    name,
    legacyRole: index === 0 ? "ADMIN" : "MANAGER",
    active: true,
    protected: index === 0,
    permissions:
      index === 0
        ? Object.fromEntries(PERMISSIONS.map((p) => [p.key, "ALL"]))
        : index === 1
          ? grants("MANAGER")
          : index === 2
            ? grants("MANAGER")
            : index === 3
              ? Object.fromEntries(
                  Object.entries(grants("MANAGER")).filter(
                    ([key]) =>
                      !["users.", "roles.", "backups."].some((prefix) =>
                        key.startsWith(prefix),
                      ) && !["USER_MANAGE", "BACKUP_MANAGE"].includes(key),
                  ),
                )
              : Object.fromEntries(
                  Object.entries(grants("MANAGER")).filter(
                    ([key]) =>
                      key.endsWith(".view") ||
                      [
                        "attendance.edit",
                        "evaluations.edit",
                        "rotations.assign",
                        "breaks.create",
                        "breaks.edit",
                        "OPS_ATTENDANCE_READ",
                        "OPS_ATTENDANCE_MANAGE",
                        "OPS_EVALUATION_READ",
                        "OPS_EVALUATION_MANAGE",
                        "OPS_SCHEDULE_READ",
                      ].includes(key),
                  ),
                ),
  })).map((role) => ({ ...role, defaults: clone(role.permissions) }));
}
async function migrateAccounts(db) {
  return db.$transaction(
    async (tx) => {
      const prior = await tx.systemSetting.findUnique({ where: { key: KEY } });
      if (prior) {
        const config = JSON.parse(prior.value);
        if (config.version !== 1)
          throw failure("Unsupported account configuration", 503);
        if (config.permissionVersion === 2)
          return { migrated: false, upgraded: false, ...config };
        const additions = {
          "schedules.archive": "schedules.edit",
          "reports.lock": "reports.edit",
          "reports.unlock": "reports.edit",
          "notifications.archive": "notifications.edit",
          "notifications.restore": "notifications.edit",
        };
        const before = {
          roles: clone(config.roles.filter(isOperationsRole)),
          accounts: {},
        };
        for (const role of config.roles.filter(isOperationsRole))
          for (const [key, source] of Object.entries(additions))
            for (const property of ["permissions", "defaults"])
              if (
                !Object.hasOwn(role[property] || {}, key) &&
                role[property]?.[source]
              )
                role[property][key] = role[property][source];
        for (const [id, profile] of Object.entries(config.accounts)) {
          if (
            !isOperationsRole(config.roles.find((r) => r.id === profile.roleId))
          )
            continue;
          before.accounts[id] = { overrides: clone(profile.overrides || {}) };
          for (const [key, source] of Object.entries(additions))
            if (
              !Object.hasOwn(profile.overrides || {}, key) &&
              Object.hasOwn(profile.overrides || {}, source)
            )
              profile.overrides[key] = profile.overrides[source];
        }
        config.permissionVersion = 2;
        config.revision++;
        const updated = await tx.systemSetting.updateMany({
          where: { key: KEY, value: prior.value },
          data: { value: JSON.stringify(config) },
        });
        if (updated.count !== 1)
          throw failure("Access settings changed. Reload and retry.", 409);
        await tx.auditLog.create({
          data: {
            action: "ACCOUNT_PERMISSION_REGISTRY_UPGRADED",
            summary:
              "Separated schedule deletion, report lock/unlock and notice archive/restore permissions",
            metadata: JSON.stringify({
              target: "permission-registry",
              version: 2,
              additions,
              before,
              after: {
                roles: config.roles.filter(isOperationsRole),
                accounts: Object.fromEntries(
                  Object.keys(before.accounts).map((id) => [
                    id,
                    { overrides: config.accounts[id].overrides },
                  ]),
                ),
              },
            }),
          },
        });
        return { migrated: false, upgraded: true, ...config };
      }
      const users = await tx.user.findMany({
        include: { employee: true },
        orderBy: { createdAt: "asc" },
      });
      const admin = users.find((u) => u.active && u.role === "ADMIN");
      if (!admin)
        throw failure("An active primary administrator is required", 409);
      const matrixRow = await tx.systemSetting.findUnique({
        where: { key: "ROLE_PERMISSION_CONFIG" },
      });
      const matrix = normalizeRoleMatrix(matrixRow?.value || ROLE_MATRIX);
      const roles = initialRoles(matrix);
      const branch = await defaultBranch(tx);
      for (const legacy of ["CASHIER", "KITCHEN", "DATA"])
        if (users.some((u) => u.role === legacy)) {
          const permissions = Object.fromEntries(
            PERMISSIONS.filter((p) =>
              (matrix[p.source] || []).includes(legacy),
            ).map((p) => [p.key, "ALL"]),
          );
          roles.push({
            id: "legacy-" + legacy,
            name: legacy,
            legacyRole: legacy,
            active: true,
            protected: false,
            permissions,
            defaults: clone(permissions),
          });
        }
      const config = {
        version: 1,
        permissionVersion: 2,
        revision: 1,
        migratedAt: new Date().toISOString(),
        roles,
        accounts: {},
      };
      for (const user of users) {
        config.accounts[user.id] = {
          displayName: user.id === admin.id ? "Sallam" : user.name,
          email: null,
          phone: "",
          jobTitle: user.employee?.jobTitle || "",
          preferredLanguage: null,
          branches:
            user.role === "ADMIN"
              ? []
              : [String(user.employee?.branch || branch).toUpperCase()],
          allBranches: user.role === "ADMIN",
          roleId:
            user.role === "ADMIN"
              ? "role-1"
              : user.role === "MANAGER"
                ? "role-2"
                : "legacy-" + user.role,
          overrides: {},
          teamIds: [],
          dataScope: user.role === "ADMIN" ? "ALL" : "BRANCH",
          sessionVersion: 0,
          forcePasswordChange: false,
          archivedAt: null,
          lastLogin: null,
          avatar: null,
        };
      }
      await tx.systemSetting.create({
        data: { key: KEY, value: JSON.stringify(config), updatedBy: admin.id },
      });
      await tx.auditLog.create({
        data: {
          action: "ACCOUNT_ACCESS_MIGRATED",
          userId: admin.id,
          summary:
            "Migrated existing accounts without replacing users or password hashes",
          metadata: JSON.stringify({
            accounts: users.length,
            roles: roles.map((r) => r.name),
            primaryAccountId: admin.id,
          }),
        },
      });
      return { migrated: true, ...config };
    },
    { timeout: 30000 },
  );
}
function publicAccount(user, config) {
  const profile = config.accounts[user.id];
  const role = config.roles.find((r) => r.id === profile?.roleId);
  return {
    ...Object.fromEntries(
      [
        "id",
        "name",
        "username",
        "role",
        "active",
        "employeeId",
        "createdAt",
        "updatedAt",
      ].map((k) => [k, user[k]]),
    ),
    employee: user.employee
      ? {
          id: user.employee.id,
          name: user.employee.name,
          branch: user.employee.branch,
          department: user.employee.department,
        }
      : null,
    profile: profile
      ? {
          ...profile,
          avatar: profile.avatar
            ? {
                url: `/api/account/avatar/${user.id}?v=${profile.avatar.version}`,
              }
            : null,
        }
      : null,
    roleName: role?.name || "",
    roleActive: role?.active === true,
    permissions: effectivePermissions(role, profile),
  };
}
async function loadAccount(db, user) {
  const { config } = await readConfig(db);
  if (!config.accounts[user.id])
    throw failure("Account has not been migrated", 403);
  return publicAccount(user, config);
}
function can(user, key) {
  return hasPermission(user, key);
}
function assertCan(user, key) {
  if (!can(user, key)) throw failure("Permission denied: " + key, 403);
  if (user.profile?.forcePasswordChange)
    throw failure("Change your password before continuing", 428);
}
function assertCeiling(actor, grants) {
  for (const [key, scope] of Object.entries(grants)) {
    if (scope === null) continue;
    if (!actor.permissions[key]) throw failure(`You cannot grant ${key}`, 403);
    const own = actor.permissions[key];
    if (
      own !== "ALL" &&
      (scope === "ALL" ||
        (own === "BRANCH" && scope === "SELECTED") ||
        (own === "OWN" && scope !== "OWN") ||
        (own === "TEAM" && !["OWN", "TEAM"].includes(scope)))
    )
      throw failure(`Scope exceeds your access: ${key}`, 403);
  }
}
// Management deliberately excludes preserved legacy accounts and role templates.
function assertOperationsAccount(config, id) {
  const profile = config.accounts[id];
  if (!profile) throw failure("Account not found", 404);
  if (!isOperationsRole(config.roles.find((r) => r.id === profile.roleId)))
    throw failure(
      "Hidden legacy accounts are outside Operations management",
      403,
    );
  return profile;
}
function accountInScope(actor, target, permission) {
  if (!target?.profile) return false;
  const scope = actor.permissions[permission];
  if (!scope) return false;
  if (scope === "OWN" || actor.profile.dataScope === "OWN")
    return target.id === actor.id;
  if (scope === "TEAM" || actor.profile.dataScope === "TEAM") {
    if (
      target.id !== actor.id &&
      (!target.employeeId || !actor.profile.teamIds.includes(target.employeeId))
    )
      return false;
  }
  const branches =
    scope === "BRANCH" || actor.profile.dataScope === "BRANCH"
      ? actor.profile.branches.slice(0, 1)
      : actor.profile.branches;
  if (
    actor.profile.allBranches &&
    scope === "ALL" &&
    actor.profile.dataScope === "ALL"
  )
    return true;
  return (
    !target.profile.allBranches &&
    target.profile.branches.length > 0 &&
    target.profile.branches.every((b) => branches.includes(b))
  );
}
function assertAccountScope(actor, target, permission) {
  if (!accountInScope(actor, target, permission))
    throw failure("Account is outside your access scope", 403);
}
function managementAccount(user) {
  return {
    ...user,
    profile: {
      ...user.profile,
      overrides: operationsGrants(user.profile.overrides),
    },
    permissions: operationsGrants(user.permissions),
  };
}
function assertBranches(actor, profile) {
  if (profile.allBranches && !actor.profile.allBranches)
    throw failure("All-branch access exceeds your scope", 403);
  if (
    !actor.profile.allBranches &&
    profile.branches.some((b) => !actor.profile.branches.includes(b))
  )
    throw failure("Branch access exceeds your scope", 403);
  if (profile.dataScope === "ALL" && !profile.allBranches)
    throw failure("All-record scope requires all-branch access");
}
function protect(config, users, actorId, before = config) {
  const self = users.find((u) => u.id === actorId),
    selfProfile = config.accounts[actorId],
    selfRole = config.roles.find((r) => r.id === selfProfile?.roleId);
  const previous = effectivePermissions(
    before.roles.find((r) => r.id === before.accounts[actorId]?.roleId),
    before.accounts[actorId],
  );
  if (
    !self?.active ||
    selfProfile?.archivedAt ||
    ["users.edit", "roles.edit"].some(
      (k) => previous[k] && !effectivePermissions(selfRole, selfProfile)[k],
    )
  )
    throw failure(
      "You cannot deactivate yourself or remove your account-management access",
      409,
    );
  const full = users.filter(
    (u) =>
      u.active &&
      !config.accounts[u.id]?.archivedAt &&
      config.roles.find((r) => r.id === config.accounts[u.id]?.roleId)?.name ===
        "Super Admin" &&
      ["users.edit", "roles.edit", "users.assign"].every(
        (k) =>
          effectivePermissions(
            config.roles.find((r) => r.id === config.accounts[u.id]?.roleId),
            config.accounts[u.id],
          )[k] === "ALL",
      ) &&
      config.accounts[u.id]?.allBranches,
  );
  if (!full.length)
    throw failure(
      "At least one active Super Admin with critical full access must remain",
      409,
    );
}
async function changeConfig(db, actor, action, target, mutate) {
  return db.$transaction(
    async (tx) => {
      const { row, config } = await readConfig(tx);
      const actorRow = await tx.user.findUnique({
        where: { id: actor.id },
        include: { employee: true },
      });
      if (!actorRow?.active) throw failure("Login required", 401);
      const fresh = publicAccount(actorRow, config);
      if (actor.profile.sessionVersion !== fresh.profile.sessionVersion)
        throw failure("Your session was revoked. Sign in again.", 401);
      const before = clone(config);
      const accountFields = (u) =>
        Object.fromEntries(
          ["id", "name", "username", "role", "active", "employeeId"].map(
            (k) => [k, u[k]],
          ),
        );
      const previousUsers = (await tx.user.findMany()).map(accountFields);
      const result = await mutate(tx, config, fresh);
      const users = await tx.user.findMany();
      protect(config, users, actor.id, before);
      config.revision++;
      const updated = await tx.systemSetting.updateMany({
        where: { key: KEY, value: row.value },
        data: { value: JSON.stringify(config), updatedBy: actor.id },
      });
      if (updated.count !== 1)
        throw failure("Access settings changed. Reload and retry.", 409);
      const roleIds = new Set(
        [...before.roles, ...config.roles].map((r) => r.id),
      );
      const changedRoles = [...roleIds].filter(
        (id) =>
          JSON.stringify(before.roles.find((r) => r.id === id)) !==
          JSON.stringify(config.roles.find((r) => r.id === id)),
      );
      const accountIds = new Set([
        ...Object.keys(before.accounts),
        ...Object.keys(config.accounts),
      ]);
      const changedAccounts = [...accountIds].filter(
        (id) =>
          JSON.stringify(before.accounts[id]) !==
          JSON.stringify(config.accounts[id]),
      );
      const nextUsers = users.map(accountFields);
      const changedUsers = nextUsers
        .filter(
          (u) =>
            JSON.stringify(u) !==
            JSON.stringify(previousUsers.find((p) => p.id === u.id)),
        )
        .map((u) => u.id);
      const redact = (value) => ({
        roles: value.roles.filter((r) => changedRoles.includes(r.id)),
        accounts: Object.fromEntries(
          changedAccounts.map((id) => [id, value.accounts[id] || null]),
        ),
        users: (value === before ? previousUsers : nextUsers).filter((u) =>
          changedUsers.includes(u.id),
        ),
      });
      await tx.auditLog.create({
        data: {
          action,
          userId: actor.id,
          summary: action + " " + (target === "new" ? result?.id : target),
          metadata: JSON.stringify({
            target: target === "new" ? result?.id : target,
            before: redact(before),
            after: redact(config),
          }),
        },
      });
      return result;
    },
    { timeout: 30000 },
  );
}
function profileInput(body, current = {}) {
  const p = { ...current };
  for (const key of [
    "displayName",
    "email",
    "phone",
    "jobTitle",
    "preferredLanguage",
  ])
    if (Object.hasOwn(body, key)) {
      const value = String(body[key] || "").trim();
      if (
        value.length >
        (key === "jobTitle" ? 120 : key === "displayName" ? 160 : 200)
      )
        throw failure(`${key} is too long`);
      p[key] = value || null;
    }
  if (p.email) {
    p.email = p.email.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))
      throw failure("Invalid email");
  }
  if (p.preferredLanguage && !["ar", "en"].includes(p.preferredLanguage))
    throw failure("Invalid language");
  return p;
}
function uniqueEmail(config, email, id) {
  if (
    email &&
    Object.entries(config.accounts).some(
      ([key, p]) => key !== id && p.email?.toLowerCase() === email,
    )
  )
    throw failure("Email is already in use", 409);
}
function passwordPolicy(value) {
  if (
    typeof value !== "string" ||
    value.length < 12 ||
    Buffer.byteLength(value) > 72
  )
    throw failure(
      "Password must be at least 12 characters and at most 72 UTF-8 bytes",
    );
}
async function editPersonalProfile(db, actor, body) {
  if (
    [
      "username",
      "role",
      "roleId",
      "permissions",
      "overrides",
      "branches",
      "allBranches",
      "dataScope",
      "teamIds",
      "active",
      "employeeId",
      "sessionVersion",
      "forcePasswordChange",
    ].some((key) => Object.hasOwn(body, key))
  )
    throw failure("Access fields are read-only on My Profile", 403);
  return changeConfig(
    db,
    actor,
    "ACCOUNT_PROFILE_UPDATED",
    actor.id,
    async (tx, config) => {
      const profile = profileInput(body, config.accounts[actor.id]);
      uniqueEmail(config, profile.email, actor.id);
      const name =
        body.name === undefined ? actor.name : String(body.name).trim();
      if (!name || name.length > 160) throw failure("Full name is required");
      config.accounts[actor.id] = profile;
      const user = await tx.user.update({
        where: { id: actor.id },
        data: { name },
        include: { employee: true },
      });
      return publicAccount(user, config);
    },
  );
}
async function saveUser(db, actor, body, id) {
  return changeConfig(
    db,
    actor,
    body.resetToDefaults
      ? "ACCOUNT_PERMISSION_RESET"
      : id && body.temporaryPassword
        ? "ACCOUNT_PASSWORD_RESET"
        : body.archive
          ? "ACCOUNT_ARCHIVED"
          : body.restore
            ? "ACCOUNT_RESTORED"
            : id && body.active !== undefined
              ? "ACCOUNT_STATUS_UPDATED"
              : id
                ? "ACCOUNT_UPDATED"
                : "ACCOUNT_CREATED",
    id || "new",
    async (tx, config, fresh) => {
      assertCan(fresh, id ? "users.edit" : "users.create");
      const old = id
        ? await tx.user.findUnique({
            where: { id },
            include: { employee: true },
          })
        : null;
      if (id && !old) throw failure("Account not found", 404);
      if (id) {
        assertOperationsAccount(config, id);
        assertAccountScope(fresh, publicAccount(old, config), "users.edit");
      }
      const original = id
        ? config.accounts[id]
        : {
            overrides: {},
            branches: [],
            teamIds: [],
            allBranches: false,
            dataScope: "BRANCH",
            sessionVersion: 0,
            forcePasswordChange: true,
            archivedAt: null,
            lastLogin: null,
            avatar: null,
          };
      if (!original) throw failure("Account migration required", 409);
      const role = config.roles.find(
        (r) => r.id === (body.roleId || original.roleId),
      );
      if (!role?.active) throw failure("Select an active role");
      if (!isOperationsRole(role))
        throw failure("Select a visible Operations role", 403);
      const name = String(body.name ?? old?.name ?? "").trim(),
        username = String(body.username ?? old?.username ?? "").trim();
      if (
        !name ||
        name.length > 160 ||
        !username ||
        !/^[\p{L}\p{N}_.@-]{2,80}$/u.test(username)
      )
        throw failure("Valid full name and username are required");
      const duplicate = (
        await tx.user.findMany({ select: { id: true, username: true } })
      ).find(
        (u) =>
          u.id !== id && u.username.toLowerCase() === username.toLowerCase(),
      );
      if (duplicate) throw failure("Username is already in use", 409);
      const p = profileInput(body, original);
      p.roleId = role.id;
      p.overrides =
        body.overrides === undefined
          ? original.overrides
          : {
              ...Object.fromEntries(
                Object.entries(original.overrides).filter(
                  ([key]) => !key.includes("."),
                ),
              ),
              ...validateGrants(body.overrides, { operationsOnly: true }),
            };
      if (body.branches !== undefined && !Array.isArray(body.branches))
        throw failure("Branches must be a list");
      if (body.teamIds !== undefined && !Array.isArray(body.teamIds))
        throw failure("Team employees must be a list");
      p.branches =
        body.branches === undefined
          ? original.branches
          : [
              ...new Set(
                body.branches.map((v) => String(v).trim().toUpperCase()),
              ),
            ];
      if (p.branches.some((b) => !/^[A-Z0-9_-]{1,80}$/.test(b)))
        throw failure("Invalid branch");
      p.allBranches =
        body.allBranches === undefined
          ? original.allBranches
          : body.allBranches === true;
      p.dataScope = body.dataScope || original.dataScope;
      p.teamIds =
        body.teamIds === undefined
          ? original.teamIds
          : [...new Set(body.teamIds.map(String))];
      if (!SCOPES.includes(p.dataScope)) throw failure("Invalid record scope");
      const employeeId =
        body.employeeId === undefined
          ? old?.employeeId || null
          : String(body.employeeId || "") || null;
      if (p.dataScope === "OWN" && !employeeId)
        throw failure("Own records requires a linked employee");
      if (!p.allBranches && !p.branches.length)
        throw failure("At least one branch is required");
      uniqueEmail(config, p.email, id);
      const accessChanged =
        !id ||
        employeeId !== old.employeeId ||
        [
          "roleId",
          "overrides",
          "branches",
          "allBranches",
          "dataScope",
          "teamIds",
        ].some((k) => JSON.stringify(p[k]) !== JSON.stringify(original[k]));
      if (accessChanged) {
        assertCan(fresh, "users.assign");
        if (id && body.confirmDestructive !== true) {
          const previous = effectivePermissions(
              config.roles.find((r) => r.id === original.roleId),
              original,
            ),
            next = effectivePermissions(role, p);
          if (
            Object.keys(operationsGrants(previous)).some(
              (key) => !next[key] || next[key] !== previous[key],
            )
          )
            throw failure(
              "Confirm destructive account permission changes",
              409,
            );
        }
        assertCeiling(fresh, operationsGrants(effectivePermissions(role, p)));
        assertBranches(fresh, p);
        if (
          !fresh.profile.allBranches &&
          fresh.profile.dataScope === "BRANCH" &&
          p.branches.some((b) => b !== fresh.profile.branches[0])
        )
          throw failure("Branch access exceeds your scope", 403);
        if (
          fresh.profile.dataScope === "OWN" &&
          (id !== fresh.id ||
            p.dataScope !== "OWN" ||
            employeeId !== fresh.employeeId)
        )
          throw failure("Account assignment exceeds own-record scope", 403);
        if (
          fresh.profile.dataScope === "TEAM" &&
          ((p.dataScope !== "OWN" && p.dataScope !== "TEAM") ||
            p.teamIds.some((e) => !fresh.profile.teamIds.includes(e)) ||
            (employeeId && !fresh.profile.teamIds.includes(employeeId)))
        )
          throw failure("Account assignment exceeds team scope", 403);
      }
      if (
        id &&
        !fresh.profile.allBranches &&
        (original.allBranches ||
          original.branches.some((b) => !fresh.profile.branches.includes(b)))
      )
        throw failure("Account is outside your branch scope", 403);
      if (employeeId) {
        const e = await tx.employee.findUnique({ where: { id: employeeId } });
        if (!e) throw failure("Employee not found");
        if (
          !p.allBranches &&
          !p.branches.includes(
            String(e.branch || (await defaultBranch(tx))).toUpperCase(),
          )
        )
          throw failure("Linked employee is outside account branches");
        if (
          await tx.user.findFirst({
            where: { employeeId, ...(id ? { id: { not: id } } : {}) },
          })
        )
          throw failure("Employee already has an account", 409);
      }
      if (p.teamIds.length) {
        const teamDefaultBranch = await defaultBranch(tx);
        const team = await tx.employee.findMany({
          where: { id: { in: p.teamIds } },
        });
        if (
          team.length !== p.teamIds.length ||
          (!p.allBranches &&
            team.some(
              (e) =>
                !p.branches.includes(
                  String(e.branch || teamDefaultBranch).toUpperCase(),
                ),
            ))
        )
          throw failure("Assigned team is outside account branches");
      }
      let active =
        body.active === undefined
          ? (old?.active ?? true)
          : body.active === true;
      if (body.archive === true) {
        assertCan(fresh, "users.archive");
        p.archivedAt = new Date().toISOString();
        active = false;
        p.sessionVersion++;
      }
      if (body.restore === true) {
        assertCan(fresh, "users.restore");
        p.archivedAt = null;
      }
      if (p.archivedAt) active = false;
      if (old && active !== old.active) {
        assertCan(fresh, active ? "users.restore" : "users.archive");
        p.sessionVersion++;
      }
      const data = {
        name,
        username,
        role: role.legacyRole,
        active,
        employeeId,
      };
      if (!id || body.temporaryPassword) {
        assertCan(fresh, id ? "users.resetPassword" : "users.create");
        passwordPolicy(body.temporaryPassword);
        data.password = await bcrypt.hash(body.temporaryPassword, 12);
        p.forcePasswordChange = body.forcePasswordChange !== false;
        p.sessionVersion++;
      } else if (
        body.forcePasswordChange !== undefined &&
        (body.forcePasswordChange === true) !== original.forcePasswordChange
      ) {
        assertCan(fresh, "users.resetPassword");
        p.forcePasswordChange = body.forcePasswordChange === true;
      }
      const user = id
        ? await tx.user.update({
            where: { id },
            data,
            include: { employee: true },
          })
        : await tx.user.create({ data, include: { employee: true } });
      config.accounts[user.id] = p;
      return publicAccount(user, config);
    },
  );
}
async function saveRole(db, actor, body) {
  return changeConfig(
    db,
    actor,
    body.resetToDefaults ? "ACCOUNT_PERMISSION_RESET" : "ACCOUNT_ROLE_UPDATED",
    body.id || "new",
    async (tx, config, fresh) => {
      assertCan(fresh, body.id ? "roles.edit" : "roles.create");
      const prior = config.roles.find((r) => r.id === body.id);
      if (body.id && !prior) throw failure("Role not found", 404);
      if (prior && !isOperationsRole(prior))
        throw failure(
          "Hidden legacy roles are outside Operations management",
          403,
        );
      if (prior && body.active !== undefined && body.active !== prior.active)
        assertCan(fresh, "roles.archive");
      if (
        prior &&
        !fresh.profile.allBranches &&
        Object.values(config.accounts).some(
          (p) =>
            p.roleId === prior.id &&
            (p.allBranches ||
              p.branches.some((b) => !fresh.profile.branches.includes(b))),
        )
      )
        throw failure(
          "This shared role is assigned outside your branch scope",
          403,
        );
      const name = String(body.name || prior?.name || "").trim();
      if (
        !name ||
        name.length > 80 ||
        config.roles.some(
          (r) =>
            r.id !== prior?.id && r.name.toLowerCase() === name.toLowerCase(),
        )
      )
        throw failure("Unique role name is required", 409);
      if (prior?.protected && name !== prior.name)
        throw failure("Super Admin role cannot be renamed", 409);
      const permissions = validateGrants(
        body.permissions || operationsGrants(prior?.permissions) || {},
        { operationsOnly: true },
      );
      if (Object.values(permissions).includes(null))
        throw failure("Role grants cannot contain account denials");
      assertCeiling(fresh, permissions);
      if (
        prior &&
        Object.keys(operationsGrants(prior.permissions)).some(
          (k) => !permissions[k] || permissions[k] !== prior.permissions[k],
        ) &&
        body.confirmDestructive !== true
      )
        throw failure("Confirm destructive permission changes", 409);
      if (prior?.protected && body.active === false)
        throw failure("Super Admin role cannot be deactivated", 409);
      const role = {
        id: prior?.id || "role-" + randomUUID(),
        name,
        legacyRole: prior?.legacyRole || "MANAGER",
        active: body.active !== false,
        protected: prior?.protected || false,
        permissions: {
          ...Object.fromEntries(
            Object.entries(prior?.permissions || {}).filter(
              ([key]) => !key.includes("."),
            ),
          ),
          ...permissions,
        },
        defaults: prior?.defaults || clone(permissions),
      };
      if (prior) config.roles[config.roles.indexOf(prior)] = role;
      else config.roles.push(role);
      return role;
    },
  );
}
async function revokeSessions(db, actor, id) {
  return changeConfig(
    db,
    actor,
    "ACCOUNT_SESSIONS_REVOKED",
    id,
    async (tx, config, fresh) => {
      assertCan(fresh, "users.revokeSessions");
      const p = assertOperationsAccount(config, id);
      assertAccountScope(
        fresh,
        publicAccount(await tx.user.findUnique({ where: { id } }), config),
        "users.revokeSessions",
      );
      if (
        !fresh.profile.allBranches &&
        (p.allBranches ||
          p.branches.some((b) => !fresh.profile.branches.includes(b)))
      )
        throw failure("Account outside your scope", 403);
      p.sessionVersion++;
      return { success: true };
    },
  );
}
async function changePassword(db, actor, body) {
  passwordPolicy(body.newPassword);
  return changeConfig(
    db,
    actor,
    "ACCOUNT_PASSWORD_CHANGED",
    actor.id,
    async (tx, config) => {
      const user = await tx.user.findUnique({ where: { id: actor.id } });
      if (
        !(await bcrypt.compare(
          String(body.currentPassword || ""),
          user.password,
        ))
      )
        throw failure("Current password is incorrect", 403);
      if (await bcrypt.compare(body.newPassword, user.password))
        throw failure("Choose a different password");
      await tx.user.update({
        where: { id: actor.id },
        data: { password: await bcrypt.hash(body.newPassword, 12) },
      });
      config.accounts[actor.id].forcePasswordChange = false;
      config.accounts[actor.id].sessionVersion++;
      return publicAccount(
        await tx.user.findUnique({
          where: { id: actor.id },
          include: { employee: true },
        }),
        config,
      );
    },
  );
}
module.exports = {
  KEY,
  failure,
  readConfig,
  migrateAccounts,
  publicAccount,
  loadAccount,
  can,
  assertCan,
  assertCeiling,
  assertBranches,
  protect,
  changeConfig,
  profileInput,
  uniqueEmail,
  passwordPolicy,
  editPersonalProfile,
  saveUser,
  saveRole,
  revokeSessions,
  changePassword,
  defaultBranch,
  assertOperationsAccount,
  accountInScope,
  assertAccountScope,
  managementAccount,
};
