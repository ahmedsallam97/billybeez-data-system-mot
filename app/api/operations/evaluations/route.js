import { withAccountAccess } from '@/lib/accounts/routes';
import { NextResponse } from "next/server";
import { evaluationReviewState } from "@/lib/operations/evaluation-review";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { getEffectivePerformanceSettings, capturePerformanceSettingsSnapshot, readPerformanceSettingsSnapshot } from "@/lib/operations/performance-settings-service";
import { operationsBranch } from "@/lib/operations/business-access";
import {refreshAfterSourceChange} from '@/lib/operations/employee-of-month';
import { eventImpactForDaily } from '@/lib/operations/operational-report-service';

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

async function expectedTeam(date, branch) {
  const schedule = await prisma.opsSchedule.findFirst({ where: { status: "PUBLISHED", periodStart: { lte: date }, periodEnd: { gte: date } }, orderBy: { version: "desc" } });
  if (!schedule) return [];
  return prisma.opsScheduleAssignment.findMany({ where: { scheduleId: schedule.id, workDate: date, code: { in: ["AM", "PM", "BW", "MISSION"] }, employee: { department: { in: ["OPERATION", "CASHIER"] }, OR: [{ branch }, { branch: null }] } }, include: { employee: { select: { id: true, name: true, nameEn: true, department: true } } }, orderBy: { employee: { name: "asc" } } });
}

async function GETHandler(request) {
  const { user, error } = await authorizeApi("OPS_EVALUATION_READ");
  if (error) return error;
  const date = String(new URL(request.url).searchParams.get("date") || "");
  if (!validDate(date)) return NextResponse.json({ success: false, error: "Invalid date" }, { status: 400 });
  try {
  const branch = await operationsBranch(prisma, user, new URL(request.url).searchParams.get("branch"));
  const effective = await getEffectivePerformanceSettings(prisma, { branch, date });
  const [team, day, activeVersion] = await Promise.all([
    expectedTeam(date, branch),
    prisma.opsDailyEvaluationDay.findFirst({
      where: { evaluationDate: date },
      include: {
        criteriaVersion: {
          include: {
            criteria: {
              include: { reasons: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
        evaluations: { include: { employee: { select: { id: true, name: true } }, exceptions: true } },
      },
      orderBy: { version: "desc" },
    }),
    effective.value.evaluation.criteriaVersionId ? prisma.opsEvaluationCriteriaVersion.findUnique({ where: { id: effective.value.evaluation.criteriaVersionId }, include: { criteria: { where: { active: true }, include: { reasons: { where: { active: true } } }, orderBy: { sortOrder: "asc" } } } }) : null,
  ]);
  const snapshot = day ? await readPerformanceSettingsSnapshot(prisma, { kind: "EVALUATION_DAY", recordId: day.id, date }) : null;
  if (snapshot?.branch && snapshot.branch !== branch) throw new Error("Evaluation day belongs to a different branch");
  const pinned = snapshot?.effective || effective;
  const rules = pinned.value.evaluation.rules;
  // A version may include deactivated criteria for future days. Historical days
  // retain only the criteria present in their immutable configuration snapshot.
  if (day?.criteriaVersion && snapshot) {
    const codes = new Set(snapshot.effective.value.evaluation.criteria.filter(item => item.active).map(item => item.code));
    day.criteriaVersion.criteria = day.criteriaVersion.criteria.filter(item => codes.has(item.code));
  }
  if (day?.evaluations?.length) {
    const markers = day.evaluations.flatMap((evaluation) => [dailyActionMarker(evaluation.id, "PENALTY"), dailyActionMarker(evaluation.id, "GUIDANCE")]);
    const actions = await prisma.employeeGuidanceRecord.findMany({ where: { actionTaken: { in: markers } } });
    const byMarker = new Map(actions.map((item) => [item.actionTaken, item]));
    day.evaluations = day.evaluations.map((evaluation) => ({
      ...evaluation,
      penaltyNote: byMarker.get(dailyActionMarker(evaluation.id, "PENALTY"))?.details || "",
      guidanceNote: byMarker.get(dailyActionMarker(evaluation.id, "GUIDANCE"))?.details || "",
    }));
    day.evaluations = await Promise.all(day.evaluations.map(async evaluation => {
      if (["DEFAULT_FULL", "DEFAULT_ZERO"].includes(evaluation.status)) return evaluation;
      const eventImpact = await eventImpactForDaily(prisma, { employeeId: evaluation.employeeId, branch, date, baseScore: evaluation.finalScore, maxScore: evaluation.maxScore });
      return { ...evaluation, baseFinalScore: evaluation.finalScore, finalScore: eventImpact.finalScore, eventImpact };
    }));
  }
  return NextResponse.json({ success: true, date, branch, team, day, reviewState: evaluationReviewState(day), criteriaVersion: day?.criteriaVersion || activeVersion, rules, configurationVersion: pinned.version });
  } catch (operationError) {
    return NextResponse.json({ success: false, error: operationError.message }, { status: operationError.status || 400 });
  }
}

async function POSTHandler(request) {
  const body = await request.json();
  const permission = body.action === "close" || body.action === "correct" ? "OPS_EVALUATION_FINALIZE" : "OPS_EVALUATION_MANAGE";
  const { user, error } = await authorizeApi(permission);
  if (error) return error;
  const date = String(body.date || "");
  if (!validDate(date)) return NextResponse.json({ success: false, error: "Invalid date" }, { status: 400 });
  try {
    const branch = await operationsBranch(prisma, user, body.branch);
    const effective = await getEffectivePerformanceSettings(prisma, { branch, date });
    let rules = effective.value.evaluation.rules;
    if (body.action === "open") {
      const existing = await prisma.opsDailyEvaluationDay.findFirst({ where: { evaluationDate: date }, orderBy: { version: "desc" } });
      if (existing) {
        const snapshot = await readPerformanceSettingsSnapshot(prisma, { kind: "EVALUATION_DAY", recordId: existing.id, date });
        if (snapshot?.branch && snapshot.branch !== branch) throw new Error("Evaluation day belongs to a different branch");
        return NextResponse.json({ success: true, day: existing, existing: true });
      }
      const team = await expectedTeam(date, branch);
      const criteriaVersion = effective.value.evaluation.criteriaVersionId ? await prisma.opsEvaluationCriteriaVersion.findUnique({ where: { id: effective.value.evaluation.criteriaVersionId }, include: { criteria: { where: { active: true } } } }) : null;
      if (!criteriaVersion) throw new Error("Active evaluation criteria are required");
      if (!team.length) throw new Error("A published schedule with a working team is required");
      const maxScore = criteriaVersion.criteria.reduce((sum, item) => sum + item.maxScore, 0);
      const day = await prisma.$transaction(async (tx) => {
        const created = await tx.opsDailyEvaluationDay.create({ data: { evaluationDate: date, criteriaVersionId: criteriaVersion.id } });
        await capturePerformanceSettingsSnapshot(tx, { kind: "EVALUATION_DAY", recordId: created.id, branch, date, configOverride: effective });
        const fullDefault = rules.defaultScoreMode !== "ZERO_UNREVIEWED";
        await tx.opsEmployeeDailyEvaluation.createMany({ data: team.map((item) => ({ dailyEvaluationDayId: created.id, employeeId: item.employeeId, maxScore, finalScore: fullDefault ? maxScore : 0, status: fullDefault ? "DEFAULT_FULL" : "DEFAULT_ZERO" })) });
        return created;
      });
      await writeAudit({ action: "OPS_EVALUATION_DAY_OPENED", user, summary: `Opened daily evaluation ${date}`, metadata: { dayId: day.id, teamSize: team.length } });
      return NextResponse.json({ success: true, day }, { status: 201 });
    }
    const day = await prisma.opsDailyEvaluationDay.findFirst({ where: { evaluationDate: date }, include: { criteriaVersion: { include: { criteria: true } }, evaluations: true }, orderBy: { version: "desc" } });
    if (!day) throw new Error("Evaluation day not found");
    const snapshot = await readPerformanceSettingsSnapshot(prisma, { kind: "EVALUATION_DAY", recordId: day.id, date });
    if (snapshot?.branch && snapshot.branch !== branch) throw new Error("Evaluation day belongs to a different branch");
    if (snapshot) rules = snapshot.effective.value.evaluation.rules;
    const activeCodes = new Set((snapshot?.effective || effective).value.evaluation.criteria.filter(item => item.active).map(item => item.code));
    day.criteriaVersion.criteria = day.criteriaVersion.criteria.filter(item => activeCodes.has(item.code));
    if (body.action === "syncTeam") {
      if (day.status === "CLOSED") throw new Error("Closed evaluation days cannot add team members");
      const team = await expectedTeam(date, branch);
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
      if (rules.requireReviewBeforeClose && !evaluationReviewState(day).canFinalize) {
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
      const penaltyDeduction = rules.penaltyDeduction;
      const guidanceDeduction = rules.guidanceDeduction;
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

export const GET=withAccountAccess(GETHandler);
export const POST=withAccountAccess(async request=>{
  const body=await request.clone().json().catch(()=>null),response=await POSTHandler(request);
  if(response.ok&&body){const {user}=await authorizeApi(body.action==='close'||body.action==='correct'?'OPS_EVALUATION_FINALIZE':'OPS_EVALUATION_MANAGE');const branch=await operationsBranch(prisma,user,body.branch);const monthlyRefresh=await refreshAfterSourceChange(prisma,{user,branch,date:body.date});const payload=await response.json();return NextResponse.json({...payload,monthlyRefresh},{status:response.status});}
  return response;
});
