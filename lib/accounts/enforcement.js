const { Prisma } = require("@prisma/client");
const { context } = require("./context");
const { failure } = require("./service");
const models = Object.fromEntries(
  Prisma.dmmf.datamodel.models.map((m) => [m.name, m]),
);
function modelFilter(model, scope, depth = 0) {
  if (
    !scope ||
    scope.unrestricted ||
    ["User", "AuditLog", "SystemSetting", "OpsOperationalPosition"].includes(model)
  )
    return null;
  const fields = models[model]?.fields || [];
  const filters = [];
  if (model === "Employee") filters.push({ id: { in: scope.employeeIds } });
  else if (fields.some((f) => f.name === "employeeId"))
    filters.push({ employeeId: { in: scope.employeeIds } });
  if (
    model !== "Employee" &&
    fields.some((f) => f.name === "branch" && f.kind === "scalar")
  )
    filters.push({ branch: { in: scope.branches } });
  if (model === "OpsSchedule") filters.push({ id: { in: scope.scheduleIds } });
  if (model === "OpsScheduleValidationRun")
    filters.push({ scheduleId: { in: scope.scheduleIds } });
  if (!filters.length && depth < 2) {
    const child = fields.find(
      (f) =>
        f.kind === "object" &&
        models[f.type]?.fields.some((c) => c.name === "employeeId"),
    );
    if (child) {
      const filter = modelFilter(child.type, scope, depth + 1);
      if (filter)
        filters.push({
          [child.name]: child.isList ? { some: filter } : { is: filter },
        });
    }
  }
  return filters.length ? { AND: filters } : null;
}
function nestedSelections(args, model, scope) {
  for (const prop of ["include", "select"])
    if (args[prop]) {
      args[prop] = { ...args[prop] };
      for (const [key, value] of Object.entries(args[prop])) {
        const field = models[model]?.fields.find(
          (f) => f.name === key && f.kind === "object",
        );
        if (!field || !value) continue;
        const selection = value === true ? {} : { ...value };
        if (field.isList) {
          const filter = modelFilter(field.type, scope);
          if (filter)
            selection.where = { AND: [selection.where || {}, filter] };
        }
        nestedSelections(selection, field.type, scope);
        args[prop][key] = Object.keys(selection).length ? selection : true;
      }
    }
}
async function verifyData(db, model, data, scope) {
  if (!data || typeof data !== "object") return;
  for (const item of Array.isArray(data) ? data : [data]) {
    if (
      item.employeeId &&
      !scope.employeeIds.includes(
        typeof item.employeeId === "string"
          ? item.employeeId
          : item.employeeId.set,
      )
    )
      throw failure("Employee access denied", 403);
    if (
      Object.hasOwn(item, "branch") &&
      !scope.branches.includes(
        (typeof item.branch === "string" ? item.branch : item.branch?.set) ||
          scope.defaultBranch,
      )
    )
      throw failure("Branch access denied", 403);
    if (item.scheduleId && !scope.scheduleIds.includes(item.scheduleId))
      throw failure("Schedule access denied", 403);
    for (const field of models[model]?.fields.filter(
      (f) => f.kind === "object",
    ) || []) {
      const relation = item[field.name];
      if (!relation) continue;
      if (relation.connect) {
        const filter = modelFilter(field.type, scope);
        for (const where of Array.isArray(relation.connect)
          ? relation.connect
          : [relation.connect])
          if (
            filter &&
            !(await db[
              field.type[0].toLowerCase() + field.type.slice(1)
            ].findFirst({ where: { AND: [where, filter] } }))
          )
            throw failure("Related record access denied", 403);
      }
      for (const key of [
        "create",
        "createMany",
        "update",
        "upsert",
        "connectOrCreate",
      ])
        if (relation[key]) {
          for (const value of Array.isArray(relation[key])
            ? relation[key]
            : [relation[key]]) {
            const filter = modelFilter(field.type, scope);
            if (
              filter &&
              value.where &&
              ["update", "upsert", "connectOrCreate"].includes(key)
            ) {
              const delegate =
                db[field.type[0].toLowerCase() + field.type.slice(1)];
              const existing = await delegate.findFirst({ where: value.where });
              if (
                existing &&
                !(await delegate.findFirst({
                  where: { AND: [value.where, filter] },
                }))
              )
                throw failure("Related record access denied", 403);
            }
            await verifyData(
              db,
              field.type,
              key === "createMany"
                ? value.data
                : key === "update"
                  ? value.data || value
                  : ["upsert", "connectOrCreate"].includes(key)
                    ? value.create
                    : value,
              scope,
            );
            if (key === "upsert")
              await verifyData(db, field.type, value.update, scope);
          }
        }
      if (
        relation.delete ||
        relation.deleteMany ||
        relation.disconnect ||
        relation.set
      )
        throw failure(
          "Scoped relation replacement must use an authorized record action",
          403,
        );
    }
  }
}
function scopedClient(db) {
  return db.$extends({
    query: {
      $allModels: {
        $allOperations: async ({ model, operation, args, query }) => {
          const scope = context.getStore();
          if (!scope || scope.unrestricted) return query(args);
          args = { ...args };
          const filter = modelFilter(model, scope);
          if (filter && !["create", "createMany"].includes(operation))
            args.where = {
              ...(args.where || {}),
              AND: [
                ...(Array.isArray(args.where?.AND)
                  ? args.where.AND
                  : [args.where?.AND || {}]),
                filter,
              ],
            };
          nestedSelections(args, model, scope);
          if (/^(create|update|upsert)/.test(operation)) {
            await verifyData(db, model, args.data || args.create, scope);
            if (args.update) await verifyData(db, model, args.update, scope);
          }
          return pruneResult(await query(args), model, scope);
        },
      },
    },
  });
}
// Required single relations cannot carry a Prisma `where`; trim them after the
// scoped query as well, including optional EOM winners from another team.
function pruneResult(value, model, scope) {
  if (Array.isArray(value))
    return value
      .map((v) => pruneResult(v, model, scope))
      .filter((v) => v !== null);
  if (!value || typeof value !== "object") return value;
  if (model === "Employee" && value.id && !scope.employeeIds.includes(value.id))
    return null;
  if (value.employeeId && !scope.employeeIds.includes(value.employeeId))
    return null;
  const next = { ...value };
  if (
    next.winnerEmployeeId &&
    !scope.employeeIds.includes(next.winnerEmployeeId)
  ) {
    next.winnerEmployeeId = null;
    next.winner = null;
  }
  for (const field of models[model]?.fields.filter(
    (f) => f.kind === "object",
  ) || [])
    if (Object.hasOwn(next, field.name))
      next[field.name] = pruneResult(next[field.name], field.type, scope);
  return next;
}
async function resolveScope(db, user, permission) {
  const profile = user.profile;
  let scope = user.permissions[permission];
  if (scope === "ALL") scope = profile.dataScope || "ALL";
  if (!profile.allBranches && scope === "ALL") scope = "SELECTED";
  if (scope === "ALL" && profile.allBranches)
    return { unrestricted: true, user, permission };
  const fallback =
    (await require("./service").defaultBranch?.(db)) ||
    String(
      JSON.parse(
        (
          await db.systemSetting.findUnique({
            where: { key: "OPS_BRANCH_CONFIG" },
          })
        )?.value || "{}",
      ).branchCode || "MOT",
    ).toUpperCase();
  let branches = profile.allBranches
    ? [
        ...new Set([
          fallback,
          ...(
            await db.employee.findMany({
              where: { branch: { not: null } },
              select: { branch: true },
              distinct: ["branch"],
            })
          ).map((e) => e.branch),
        ]),
      ]
    : profile.branches;
  if (scope === "BRANCH") branches = branches.slice(0, 1);
  const where =
    scope === "OWN"
      ? { id: user.employeeId || "__no_employee__" }
      : scope === "TEAM"
        ? { id: { in: profile.teamIds || [] } }
        : {
            OR: [
              { branch: { in: branches } },
              ...(branches.includes(fallback) ? [{ branch: null }] : []),
            ],
          };
  const employees = await db.employee.findMany({
    where,
    select: { id: true, branch: true },
  });
  const employeeIds = employees
    .filter((e) => branches.includes(e.branch || fallback))
    .map((e) => e.id);
  const schedules = await db.opsSchedule.findMany({ select: { id: true } });
  const states = await db.systemSetting.findMany({
    where: { key: { startsWith: "OPS_SCHEDULE_STATE:" } },
  });
  const map = new Map(
    states.map((r) => [
      r.key.slice("OPS_SCHEDULE_STATE:".length),
      JSON.parse(r.value).branch,
    ]),
  );
  const scheduleIds = schedules
    .filter((s) => branches.includes(map.get(s.id) || fallback))
    .map((s) => s.id);
  return {
    unrestricted: false,
    branches,
    employeeIds,
    scheduleIds,
    user,
    permission,
    recordScope: scope,
    defaultBranch: fallback,
  };
}
module.exports = {
  models,
  modelFilter,
  nestedSelections,
  verifyData,
  scopedClient,
  resolveScope,
  pruneResult,
};
