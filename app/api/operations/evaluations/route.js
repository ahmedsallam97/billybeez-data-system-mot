import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { getSetting } from "@/lib/settings";

function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")); }
const dailyActionMarker = (evaluationId, type) => `DAILY_EVALUATION:${evaluationId}:${type}`;

async function syncDailyAction(tx, { evaluation, date, type, note, points, userId }) {
  const actionTaken = dailyActionMarker(evaluation.id, type);
  const existing = await tx.employeeGuidanceRecord.findFirst({ where: { employeeId: evaluation.employeeId, actionTaken } });
  const details = String(note || "").trim();
  if (!details) {
    if (existing) await tx.employeeGuidanceRecord.delete({ where: { id: existing.id } });
    return null;
  }
  const data = {
    recordDate: new Date(`${date}T12:00:00.000Z`),
    recordType: type,
    title: type === "PENALTY" ? "Daily evaluation penalty" : "Daily evaluation guidance",
    details,
    points: -Math.abs(Number(points)),
    actionTaken,
    status: "OPEN",
  };
  return existing
    ? tx.employeeGuidanceRecord.update({ where: { id: existing.id }, data })
    : tx.employeeGuidanceRecord.create({ data: { ...data, employeeId: evaluation.employeeId, createdBy: userId } });
}

async function expectedTeam(date) {
  const schedule = await prisma.opsSchedule.findFirst({ where: { status: "PUBLISHED", periodStart: { lte: date }, periodEnd: { gte: date } }, orderBy: { version: "desc" } });
  if (!schedule) return [];
  return prisma.opsScheduleAssignment.findMany({ where: { scheduleId: schedule.id, workDate: date, code: { in: ["AM", "PM", "BW", "MISSION"] }, employee: { department: { in: ["OPERATION", "CASHIER"] } } }, include: { employee: { select: { id: true, name: true, nameEn: true, department: true } } }, orderBy: { employee: { name: "asc" } } });
}

export async function GET(request) {
  const { error } = await authorizeApi("OPS_EVALUATION_READ");
  if (error) return error;
  const date = String(new URL(request.url).searchParams.get("date") || "");
  if (!validDate(date)) return NextResponse.json({ success: false, error: "Invalid date" }, { status: 400 });
  const [team, day, activeVersion, rulesRaw] = await Promise.all([
    expectedTeam(date),
    prisma.opsDailyEvaluationDay.findFirst({
      where: { evaluationDate: date },
      include: {
        criteriaVersion: {
          include: {
            criteria: {
              where: { active: true },
              include: { reasons: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
        evaluations: { include: { employee: { select: { id: true, name: true } }, exceptions: true } },
      },
      orderBy: { version: "desc" },
    }),
    prisma.opsEvaluationCriteriaVersion.findFirst({ where: { active: true }, include: { criteria: { where: { active: true }, include: { reasons: { where: { active: true } } }, orderBy: { sortOrder: "asc" } } }, orderBy: { createdAt: "desc" } }),
    getSetting("OPS_EVALUATION_RULES", "{}"),
  ]);
  let rules = {}; try { rules = JSON.parse(rulesRaw); } catch {}
  if (day?.evaluations?.length) {
    const markers = day.evaluations.flatMap((evaluation) => [dailyActionMarker(evaluation.id, "PENALTY"), dailyActionMarker(evaluation.id, "GUIDANCE")]);
    const actions = await prisma.employeeGuidanceRecord.findMany({ where: { actionTaken: { in: markers } } });
    const byMarker = new Map(actions.map((item) => [item.actionTaken, item]));
    day.evaluations = day.evaluations.map((evaluation) => ({
      ...evaluation,
      penaltyNote: byMarker.get(dailyActionMarker(evaluation.id, "PENALTY"))?.details || "",
      guidanceNote: byMarker.get(dailyActionMarker(evaluation.id, "GUIDANCE"))?.details || "",
    }));
  }
  return NextResponse.json({ success: true, date, team, day, criteriaVersion: day?.criteriaVersion || activeVersion, rules });
}

export async function POST(request) {
  const body = await request.json();
  const permission = body.action === "close" || body.action === "correct" ? "OPS_EVALUATION_FINALIZE" : "OPS_EVALUATION_MANAGE";
  const { user, error } = await authorizeApi(permission);
  if (error) return error;
  const date = String(body.date || "");
  if (!validDate(date)) return NextResponse.json({ success: false, error: "Invalid date" }, { status: 400 });
  try {
    let rules = {}; try { rules = JSON.parse(await getSetting("OPS_EVALUATION_RULES", "{}")); } catch {}
    if (body.action === "open") {
      const existing = await prisma.opsDailyEvaluationDay.findFirst({ where: { evaluationDate: date }, orderBy: { version: "desc" } });
      if (existing) return NextResponse.json({ success: true, day: existing, existing: true });
      const [criteriaVersion, team] = await Promise.all([prisma.opsEvaluationCriteriaVersion.findFirst({ where: { active: true }, include: { criteria: { where: { active: true } } } }), expectedTeam(date)]);
      if (!criteriaVersion) throw new Error("Active evaluation criteria are required");
      if (!team.length) throw new Error("A published schedule with a working team is required");
      const maxScore = criteriaVersion.criteria.reduce((sum, item) => sum + item.maxScore, 0);
      const day = await prisma.$transaction(async (tx) => {
        const created = await tx.opsDailyEvaluationDay.create({ data: { evaluationDate: date, criteriaVersionId: criteriaVersion.id } });
        const fullDefault = rules.defaultScoreMode !== "ZERO_UNREVIEWED";
        await tx.opsEmployeeDailyEvaluation.createMany({ data: team.map((item) => ({ dailyEvaluationDayId: created.id, employeeId: item.employeeId, maxScore, finalScore: fullDefault ? maxScore : 0, status: fullDefault ? "DEFAULT_FULL" : "DEFAULT_ZERO" })) });
        return created;
      });
      await writeAudit({ action: "OPS_EVALUATION_DAY_OPENED", user, summary: `Opened daily evaluation ${date}`, metadata: { dayId: day.id, teamSize: team.length } });
      return NextResponse.json({ success: true, day }, { status: 201 });
    }
    const day = await prisma.opsDailyEvaluationDay.findFirst({ where: { evaluationDate: date }, include: { criteriaVersion: { include: { criteria: true } }, evaluations: true }, orderBy: { version: "desc" } });
    if (!day) throw new Error("Evaluation day not found");
    if (body.action === "syncTeam") {
      if (day.status === "CLOSED") throw new Error("Closed evaluation days cannot add team members");
      const team = await expectedTeam(date);
      const existingIds = new Set(day.evaluations.map((item) => item.employeeId));
      const missing = team.filter((item) => !existingIds.has(item.employeeId));
      const maxScore = day.criteriaVersion.criteria.reduce((sum, item) => sum + Number(item.maxScore), 0);
      const fullDefault = rules.defaultScoreMode !== "ZERO_UNREVIEWED";
      if (missing.length) await prisma.opsEmployeeDailyEvaluation.createMany({ data: missing.map((item) => ({ dailyEvaluationDayId: day.id, employeeId: item.employeeId, maxScore, finalScore: fullDefault ? maxScore : 0, status: fullDefault ? "DEFAULT_FULL" : "DEFAULT_ZERO" })) });
      if (missing.length) await writeAudit({ action: "OPS_EVALUATION_TEAM_SYNCED", user, summary: `Added ${missing.length} scheduled employees to daily evaluation ${date}`, metadata: { dayId: day.id, employeeIds: missing.map((item) => item.employeeId) } });
      return NextResponse.json({ success: true, added: missing.length });
    }
    if (body.action === "close") {
      if (day.status === "CLOSED") throw new Error("Evaluation day is already closed");
      if (rules.requireReviewBeforeClose !== false && day.evaluations.some((item) => item.status === "DEFAULT_FULL" || item.status === "DEFAULT_ZERO")) {
        throw new Error("Save every employee evaluation before closing the day");
      }
      const updated = await prisma.opsDailyEvaluationDay.update({ where: { id: day.id }, data: { status: "CLOSED", closedBy: user.id, closedAt: new Date(), teamNote: String(body.teamNote || "").trim() || null } });
      await writeAudit({ action: "OPS_EVALUATION_DAY_CLOSED", user, summary: `Closed daily evaluation ${date}`, metadata: { dayId: day.id } });
      return NextResponse.json({ success: true, day: updated });
    }
    if (body.action === "save" || body.action === "correct") {
      const correction = body.action === "correct";
      if (day.status === "CLOSED" && !correction) throw new Error("Closed evaluation requires an authorized correction");
      if (correction && day.status !== "CLOSED") throw new Error("Use normal save while the evaluation is open");
      if (correction && !String(body.reason || "").trim()) throw new Error("Correction reason is required");
      const criteriaById = new Map(day.criteriaVersion.criteria.map((item) => [item.id, item]));
      const evaluationsByEmployee = new Map(day.evaluations.map((item) => [item.employeeId, item]));
      const changes = Array.isArray(body.evaluations) ? body.evaluations : [];
      const penaltyDeduction = Math.max(0, Number(rules.penaltyDeduction ?? 25));
      const guidanceDeduction = Math.max(0, Number(rules.guidanceDeduction ?? 15));
      await prisma.$transaction(async (tx) => {
        for (const change of changes) {
          const evaluation = evaluationsByEmployee.get(String(change.employeeId));
          if (!evaluation) throw new Error("Employee is not in this evaluation team");
          const exceptions = Array.isArray(change.exceptions) ? change.exceptions : [];
          let totalDeduction = 0;
          const seen = new Set();
          for (const exception of exceptions) {
            const criterion = criteriaById.get(String(exception.criterionId));
            const deduction = Number(exception.deduction);
            if (!criterion || seen.has(criterion.id) || !Number.isFinite(deduction) || deduction <= 0 || deduction > criterion.maxScore) throw new Error("Invalid or duplicate evaluation deduction");
            if (rules.requireReasonForDeduction !== false && !exception.reasonId && !String(exception.note || "").trim()) throw new Error("A reason or note is required for every deduction");
            seen.add(criterion.id); totalDeduction += deduction;
          }
          const penaltyNote = String(change.penaltyNote || "").trim();
          const guidanceNote = String(change.guidanceNote || "").trim();
          if (penaltyNote) totalDeduction += penaltyDeduction;
          if (guidanceNote) totalDeduction += guidanceDeduction;
          const finalScore = Math.max(0, evaluation.maxScore - totalDeduction);
          await tx.opsEvaluationException.deleteMany({ where: { employeeDailyEvaluationId: evaluation.id } });
          if (exceptions.length) await tx.opsEvaluationException.createMany({ data: exceptions.map((item) => ({ employeeDailyEvaluationId: evaluation.id, criterionId: item.criterionId, reasonId: item.reasonId || null, deduction: Number(item.deduction), note: String(item.note || "").trim() || null, createdBy: user.id })) });
          await syncDailyAction(tx, { evaluation, date, type: "PENALTY", note: penaltyNote, points: penaltyDeduction, userId: user.id });
          await syncDailyAction(tx, { evaluation, date, type: "GUIDANCE", note: guidanceNote, points: guidanceDeduction, userId: user.id });
          const hasAction = Boolean(penaltyNote || guidanceNote);
          await tx.opsEmployeeDailyEvaluation.update({ where: { id: evaluation.id }, data: { finalScore, status: correction ? "MODIFIED" : (exceptions.length || hasAction) ? "EXCEPTION" : "REVIEWED", supervisorNote: String(change.supervisorNote || "").trim() || null } });
        }
      }, { timeout: 30000 });
      await writeAudit({ action: correction ? "OPS_EVALUATIONS_CORRECTED" : "OPS_EVALUATIONS_SAVED", user, summary: `${correction ? "Corrected" : "Saved"} ${changes.length} daily evaluations for ${date}`, metadata: { dayId: day.id, employeeCount: changes.length }, reason: correction ? String(body.reason).trim() : undefined });
      return NextResponse.json({ success: true });
    }
    throw new Error("Unknown evaluation action");
  } catch (operationError) {
    return NextResponse.json({ success: false, error: operationError.message }, { status: 400 });
  }
}
