const { prisma } = require("../lib/db");
const { hasPositionConflict } = require("../lib/operations/live-daily");

function preferredAssignments(assignments) {
  return [...assignments].sort((left, right) =>
    Number(Boolean(right.manualLock)) - Number(Boolean(left.manualLock)) ||
    Number(right.source === "MANUAL") - Number(left.source === "MANUAL") ||
    new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime() ||
    left.id.localeCompare(right.id));
}

function conflictingAssignmentIds(assignments) {
  const retained = [];
  const removed = [];
  for (const assignment of preferredAssignments(assignments)) {
    if (hasPositionConflict(retained, {
      operationalPositionId: assignment.operationalPositionId,
      startTime: assignment.startTime,
      endTime: assignment.endTime,
    })) removed.push(assignment.id);
    else retained.push(assignment);
  }
  return removed;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const plans = await prisma.opsRotationPlan.findMany({
    where: { status: { in: ["ACTIVE", "DRAFT"] } },
    include: {
      operationsDay: { select: { workDate: true, branch: true } },
      assignments: { orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ operationsDay: { workDate: "asc" } }, { version: "asc" }],
  });
  const affected = plans.map((plan) => ({
    planId: plan.id,
    date: plan.operationsDay.workDate,
    branch: plan.operationsDay.branch,
    version: plan.version,
    duplicateAssignmentIds: conflictingAssignmentIds(plan.assignments),
  })).filter((item) => item.duplicateAssignmentIds.length);
  const ids = affected.flatMap((item) => item.duplicateAssignmentIds);
  if (apply && ids.length) await prisma.opsRotationAssignment.deleteMany({ where: { id: { in: ids } } });
  console.log(JSON.stringify({ success: true, mode: apply ? "apply" : "dry-run", affectedPlans: affected, removedCount: apply ? ids.length : 0, pendingRemovalCount: apply ? 0 : ids.length }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

module.exports = { conflictingAssignmentIds };
