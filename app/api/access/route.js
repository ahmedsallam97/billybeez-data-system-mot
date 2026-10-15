import { NextResponse } from "next/server";
import { basePrisma as db } from "@/lib/db";
import { accountRequest, accountResponse } from "@/lib/accounts/http";
import {
  readConfig,
  publicAccount,
  saveRole,
  saveUser,
  revokeSessions,
  failure,
  accountInScope,
  managementAccount,
  defaultBranch,
} from "@/lib/accounts/service";
import {
  OPERATIONS_PERMISSIONS,
  isOperationsRole,
  managementRole,
  SCOPES,
  dependencies,
} from "@/lib/accounts/registry";
export const GET = accountResponse(async (request) => {
  const actor = await accountRequest(request);
  const viewKey = ["users.view", "users.activity", "roles.view"].find(key => actor.permissions[key]);
  if (!viewKey) throw failure("You do not have access to account management", 403);
  const { config } = await readConfig(db);
  const users = (
    await db.user.findMany({
      include: { employee: true },
      orderBy: { name: "asc" },
    })
  )
    .map((u) => publicAccount(u, config))
    .filter(
      (u) =>
        isOperationsRole(
          config.roles.find((r) => r.id === u.profile?.roleId),
        ) && accountInScope(actor, u, viewKey),
    )
    .map(managementAccount);
  const fallback = await defaultBranch(db);
  const assigned =
    actor.profile.dataScope === "BRANCH"
      ? actor.profile.branches.slice(0, 1)
      : actor.profile.branches;
  const employeeScope =
    await require("@/lib/accounts/enforcement").resolveScope(
      db,
      actor,
      viewKey,
    );
  const employees = await db.employee.findMany({
    where: employeeScope.unrestricted
      ? {}
      : { id: { in: employeeScope.employeeIds } },
    select: { id: true, name: true, branch: true },
    orderBy: { name: "asc" },
  });
  let logs = [];
  if (actor.permissions["users.activity"]) {
    logs = await db.auditLog.findMany({
      where: { action: { startsWith: "ACCOUNT_" } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { name: true } } },
    });
    const visible = new Set(users.map((u) => u.id));
    logs = logs
      .map((l) => ({ ...l, metadata: JSON.parse(l.metadata || "{}") }))
      .filter(
        (l) =>
          visible.has(l.metadata.target) ||
          (l.metadata.target === "permission-registry" && actor.profile.allBranches && actor.permissions["roles.view"]) ||
          (actor.profile.allBranches &&
            config.roles.some(
              (r) => isOperationsRole(r) && r.id === l.metadata.target,
            )),
      )
      .map((l) => {
        const metadata = structuredClone(l.metadata);
        for (const side of ["before", "after"])
          if (metadata[side]) {
            metadata[side].roles = metadata[side].roles
              .filter(isOperationsRole)
              .map(managementRole);
            for (const p of Object.values(metadata[side].accounts))
              if (p)
                p.overrides = Object.fromEntries(
                  Object.entries(p.overrides || {}).filter(([key]) =>
                    key.includes("."),
                  ),
                );
          }
        return { ...l, metadata };
      });
  }
  const branches = [
    ...new Set([
      ...actor.profile.branches,
      ...employees.map((e) => e.branch || fallback),
    ]),
  ].sort();
  return NextResponse.json({
    success: true,
    users: actor.permissions["users.view"] ? users : [],
    roles:
      actor.permissions["roles.view"] || actor.permissions["users.assign"]
        ? config.roles.filter(isOperationsRole).map(managementRole)
        : [],
    permissions: OPERATIONS_PERMISSIONS,
    scopes: SCOPES,
    branches,
    employees: actor.permissions["users.view"] ? employees : [],
    logs,
    revision: config.revision,
  });
});
export const POST = accountResponse(async (request) => {
  const actor = await accountRequest(request);
  const body = await request.json();
  if (body.kind === "role") {
    const role = await saveRole(db, actor, body);
    return NextResponse.json({
      success: true,
      role: managementRole(role),
      dependencies: dependencies(role.permissions),
    });
  }
  if (body.kind === "user") {
    const user = await saveUser(db, actor, body, body.id);
    return NextResponse.json({ success: true, user: managementAccount(user) });
  }
  if (body.kind === "revoke")
    return NextResponse.json(await revokeSessions(db, actor, body.id));
  throw failure("Unknown account action");
});
