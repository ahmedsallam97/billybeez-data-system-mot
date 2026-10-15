const { Prisma } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const {
  loadAccount,
  assertCan,
  failure,
  readConfig,
} = require("../accounts/service");
const { resolveScope } = require("../accounts/enforcement");
const { consumeLoginAttempt } = require("../login-rate-limit");
const ARCHIVE_EVENT = "PROFILE_ARCHIVED";
const archiveWhere = { eventType: ARCHIVE_EVENT, newValue: "ARCHIVED" };
const employeeRelations = Prisma.dmmf.datamodel.models
  .find((m) => m.name === "Employee")
  .fields.filter((f) => f.kind === "object" && f.isList)
  .map((f) => f.name);

async function removeEmployee(
  db,
  actor,
  employeeId,
  { password, restore = false } = {},
) {
  const permission = restore ? "employees.restore" : "employees.archive";
  assertCan(actor, permission);
  if (typeof password !== "string" || !password || password.length > 200)
    throw failure("Current password is required", 400);
  const attempt = consumeLoginAttempt(`employee-removal:${actor.id}`);
  if (!attempt.allowed)
    throw failure("Too many password attempts. Try again later.", 429);
  return db.$transaction(
    async (tx) => {
      const user = await tx.user.findUnique({ where: { id: actor.id } });
      if (!user?.active) throw failure("Login required", 401);
      const fresh = await loadAccount(tx, user);
      if (fresh.profile.sessionVersion !== actor.profile.sessionVersion)
        throw failure("Login required", 401);
      assertCan(fresh, permission);
      if (!(await bcrypt.compare(password, user.password)))
        throw failure("Current password is incorrect", 403);
      const scope = await resolveScope(tx, fresh, permission);
      if (!scope.unrestricted && !scope.employeeIds.includes(employeeId))
        throw failure("Employee access denied", 403);
      const employee = await tx.employee.findUnique({
        where: { id: employeeId },
        include: {
          overtimeAccount: { select: { id: true } },
          _count: {
            select: Object.fromEntries(
              employeeRelations.map((key) => [key, true]),
            ),
          },
        },
      });
      if (!employee) throw failure("Employee not found", 404);
      const marker = await tx.employeeEmploymentEvent.findFirst({
        where: { employeeId, ...archiveWhere },
      });
      let outcome;
      if (restore) {
        if (!marker) throw failure("Employee is not archived", 409);
        const previous = JSON.parse(marker.previousValue || "{}");
        await tx.employeeEmploymentEvent.update({
          where: { id: marker.id },
          data: { newValue: "RESTORED" },
        });
        await tx.employee.update({
          where: { id: employeeId },
          data: {
            active: previous.active === true,
            employmentStatus: ["ACTIVE", "INACTIVE", "EXITED"].includes(
              previous.employmentStatus,
            )
              ? previous.employmentStatus
              : "INACTIVE",
          },
        });
        outcome = "restored";
      } else {
        if (marker) throw failure("Employee is already archived", 409);
        // No cascades: every related row keeps its original employee ID and files.
        const config = (await readConfig(tx)).config;
        const hasHistory =
          Object.values(employee._count).some(Boolean) ||
          Boolean(employee.overtimeAccount) ||
          Boolean(
            await tx.systemSetting.count({
              where: { value: { contains: employeeId } },
            }),
          ) ||
          Boolean(
            await tx.employee.count({ where: { supervisorId: employeeId } }),
          ) ||
          Object.values(config.accounts).some((profile) =>
            profile.teamIds?.includes(employeeId),
          );
        if (hasHistory) {
          await tx.employee.update({
            where: { id: employeeId },
            data: { active: false, employmentStatus: "INACTIVE" },
          });
          await tx.employeeEmploymentEvent.create({
            data: {
              employeeId,
              eventType: ARCHIVE_EVENT,
              effectiveDate: new Date(),
              previousValue: JSON.stringify({
                active: employee.active,
                employmentStatus: employee.employmentStatus,
              }),
              newValue: "ARCHIVED",
              reason:
                "Removed from employee directory; historical records and files preserved",
              createdBy: actor.id,
            },
          });
          outcome = "archived";
        } else {
          await tx.employee.delete({ where: { id: employeeId } });
          outcome = "deleted";
        }
      }
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          action: `OPS_EMPLOYEE_${outcome.toUpperCase()}`,
          summary: `${outcome}: ${employee.name}`,
          metadata: JSON.stringify({
            employeeId,
            name: employee.name,
            before: {
              active: employee.active,
              employmentStatus: employee.employmentStatus,
              archived: Boolean(marker),
            },
            after: { outcome },
            historicalRecordsPreserved: outcome !== "deleted",
          }),
        },
      });
      return { success: true, outcome, employeeId, name: employee.name };
    },
    { timeout: 15000 },
  );
}
module.exports = { removeEmployee, archiveWhere };
