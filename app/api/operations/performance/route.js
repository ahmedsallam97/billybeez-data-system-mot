import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { assertSuccessionPath } from "@/lib/operations/succession";
import { manualAppraisalMeta, manualAppraisalSnapshots, normalizeManualAppraisalRows } from "@/lib/operations/manual-appraisal";
import { getSetting } from "@/lib/settings";

const READINESS = ["NOT_ASSESSED", "DEVELOPING", "READY_SOON", "READY_NOW", "ON_HOLD", "PROMOTED", "COMPLETED", "CLOSED"];

export async function GET(request) {
  const { error } = await authorizeApi("OPS_APPRAISAL_READ");
  if (error) return error;
  const params = new URL(request.url).searchParams;
  const year = Number(params.get("year") || new Date().getFullYear());
  const month = Number(params.get("month") || new Date().getMonth() + 1);
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  const [appraisalRows, previousAppraisals, competitions, succession, employees, artworkRaw, branchRaw] = await Promise.all([
    prisma.opsMonthlyAppraisal.findMany({ where: { year, month }, include: { employee: { select: { id: true, name: true, nameEn: true, hrisNumber: true, localEmployeeCode: true, jobTitle: true } }, formulaVersion: { select: { code: true, label: true } } }, orderBy: [{ version: "desc" }, { totalScore: "desc" }, { employee: { name: "asc" } }] }),
    prisma.opsMonthlyAppraisal.findMany({ where: { year: previousYear, month: previousMonth, status: "APPROVED" }, select: { totalScore: true } }),
    prisma.opsEotmCompetition.findMany({ where: { year, month }, include: { winner: { select: { id: true, name: true, nameAr: true, nameEn: true, operationalName: true, documents: { where: { documentType: "EMPLOYEE_PHOTO", status: "ACTIVE" }, orderBy: { uploadedAt: "desc" }, take: 1 } } }, candidates: { include: { employee: { select: { id: true, name: true } } }, orderBy: { rank: "asc" } }, formulaVersion: true }, orderBy: { version: "desc" } }),
    prisma.opsSuccessionCandidate.findMany({ where: { active: true }, include: { employee: { select: { id: true, name: true, jobTitle: true } }, developmentActions: true, reviews: { orderBy: { reviewDate: "desc" } } }, orderBy: { updatedAt: "desc" } }),
    prisma.employee.findMany({ select: { id: true, name: true, jobTitle: true, active: true, employmentStatus: true, hrisNumber: true, localEmployeeCode: true }, orderBy: [{ active: "desc" }, { name: "asc" }] }),
    getSetting("RECOGNITION_ARTWORK_CONFIG", "{}"),
    getSetting("OPS_BRANCH_CONFIG", "{}"),
  ]);
  let artworkConfig = {}; let branch = {};
  try { artworkConfig = JSON.parse(artworkRaw); } catch {}
  try { branch = JSON.parse(branchRaw); } catch {}
  const latestAppraisals = new Map();
  appraisalRows.forEach((item) => { if (!latestAppraisals.has(item.employeeId)) latestAppraisals.set(item.employeeId, item); });
  const appraisals = [...latestAppraisals.values()]
    .map((item) => ({ ...item, ...manualAppraisalMeta(item) }))
    .sort((left, right) => right.totalScore - left.totalScore || left.employee.name.localeCompare(right.employee.name));
  const serializedCompetitions = competitions.map((competition) => ({ ...competition, winner: competition.winner ? { ...competition.winner, photoUrl: competition.winner.documents?.[0] ? `/api/operations/employees/${competition.winner.id}/documents/${competition.winner.documents[0].id}` : null, documents: undefined } : null }));
  return NextResponse.json({ success: true, year, month, previousPeriod: { year: previousYear, month: previousMonth }, appraisals, previousAppraisals, competitions: serializedCompetitions, succession, employees, artworkConfig, branch });
}

export async function POST(request) {
  const body = await request.json();
  const successionAction = String(body.action || "").startsWith("succession");
  const appraisalAction = String(body.action || "").startsWith("appraisal");
  const { user, error } = await authorizeApi(successionAction ? "OPS_SUCCESSION_MANAGE" : appraisalAction ? "OPS_APPRAISAL_APPROVE" : "OPS_EOTM_MANAGE");
  if (error) return error;
  try {
    if (body.action === "appraisalManualOverride") {
      const year = Number(body.year); const month = Number(body.month); const reason = String(body.reason || "").trim();
      if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error("Invalid appraisal period");
      if (reason.length < 5) throw new Error("A clear manual override reason is required");
      const rows = normalizeManualAppraisalRows(body.rows);
      const [lockedCompetition, employees, activeFormulas] = await Promise.all([
        prisma.opsEotmCompetition.findFirst({ where: { year, month, status: "LOCKED" }, select: { id: true } }),
        prisma.employee.findMany({ where: { id: { in: rows.map((item) => item.employeeId) } }, select: { id: true, name: true } }),
        prisma.opsAppraisalFormulaVersion.findMany({ where: { active: true }, orderBy: { createdAt: "desc" } }),
      ]);
      if (lockedCompetition) throw new Error("Reopen the locked Employee of the Month competition before changing historical appraisal scores");
      if (employees.length !== rows.length) throw new Error("One or more employees could not be found");
      const periodKey = `${year}-${String(month).padStart(2, "0")}-01`;
      const activeFormula = activeFormulas.find((formula) => formula.effectiveFrom <= periodKey && (!formula.effectiveTo || formula.effectiveTo >= periodKey));
      const names = new Map(employees.map((employee) => [employee.id, employee.name]));
      const created = await prisma.$transaction(async (tx) => {
        const results = [];
        for (const row of rows) {
          const previous = await tx.opsMonthlyAppraisal.findFirst({ where: { employeeId: row.employeeId, year, month }, orderBy: { version: "desc" } });
          const formulaVersionId = previous?.formulaVersionId || activeFormula?.id;
          if (!formulaVersionId) throw new Error("An active monthly appraisal formula is required before entering a manual score");
          await tx.opsMonthlyAppraisal.updateMany({ where: { employeeId: row.employeeId, year, month, status: { not: "SUPERSEDED" } }, data: { status: "SUPERSEDED" } });
          const snapshots = manualAppraisalSnapshots({ totalScore: row.totalScore, reason, userId: user.id, priorAppraisal: previous });
          const appraisal = await tx.opsMonthlyAppraisal.create({ data: { employeeId: row.employeeId, year, month, version: (previous?.version || 0) + 1, formulaVersionId, status: "DRAFT", totalScore: row.totalScore, ...snapshots } });
          results.push({ appraisal, employeeName: names.get(row.employeeId), previousScore: previous?.totalScore ?? null });
        }
        return results;
      });
      await writeAudit({ action: "OPS_APPRAISAL_MANUAL_OVERRIDE", user, summary: `Entered ${created.length} manual appraisal score(s) for ${year}-${month}`, metadata: { year, month, changes: created.map((item) => ({ appraisalId: item.appraisal.id, employeeId: item.appraisal.employeeId, employeeName: item.employeeName, previousScore: item.previousScore, newScore: item.appraisal.totalScore, version: item.appraisal.version })) }, reason });
      return NextResponse.json({ success: true, appraisals: created.map((item) => item.appraisal) });
    }
    if (body.action === "appraisalApprove") {
      const appraisal = await prisma.opsMonthlyAppraisal.findUnique({ where: { id: String(body.appraisalId || "") } });
      if (!appraisal) throw new Error("Appraisal not found");
      if (appraisal.status === "SUPERSEDED") throw new Error("A superseded appraisal cannot be approved");
      const now = new Date();
      const updated = await prisma.opsMonthlyAppraisal.update({ where: { id: appraisal.id }, data: { status: "APPROVED", reviewedBy: appraisal.reviewedBy || user.id, reviewedAt: appraisal.reviewedAt || now, approvedBy: user.id, approvedAt: now } });
      await writeAudit({ action: "OPS_APPRAISAL_APPROVED", user, summary: `Approved appraisal ${appraisal.year}-${appraisal.month}`, metadata: { appraisalId: appraisal.id, employeeId: appraisal.employeeId, scorePreserved: appraisal.totalScore } });
      return NextResponse.json({ success: true, appraisal: updated });
    }
    if (body.action === "appraisalApproveAll") {
      const year = Number(body.year); const month = Number(body.month);
      if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error("Invalid appraisal period");
      const pending = await prisma.opsMonthlyAppraisal.findMany({ where: { year, month, status: { in: ["DRAFT", "REVIEWED", "REOPENED"] } } });
      if (!pending.length) throw new Error("No pending appraisals exist for this period");
      const now = new Date();
      await prisma.$transaction(pending.map((appraisal) => prisma.opsMonthlyAppraisal.update({ where: { id: appraisal.id }, data: { status: "APPROVED", reviewedBy: appraisal.reviewedBy || user.id, reviewedAt: appraisal.reviewedAt || now, approvedBy: user.id, approvedAt: now } })));
      await writeAudit({ action: "OPS_APPRAISAL_PERIOD_APPROVED", user, summary: `Approved ${pending.length} appraisals for ${year}-${month}`, metadata: { year, month, appraisalIds: pending.map((item) => item.id), scoresPreserved: true } });
      return NextResponse.json({ success: true, approved: pending.length });
    }
    if (body.action === "successionCreate") {
      const employee = await prisma.employee.findUnique({ where: { id: String(body.employeeId || "") } });
      if (!employee) throw new Error("Employee not found");
      const path = assertSuccessionPath(body.currentRole || employee.jobTitle, body.targetRole);
      const candidate = await prisma.opsSuccessionCandidate.create({ data: { employeeId: employee.id, currentRole: path.currentRole, targetRole: path.targetRole, managementNotes: String(body.notes || "").trim() || null, createdBy: user.id, updatedBy: user.id } });
      await writeAudit({ action: "OPS_SUCCESSION_CREATED", user, summary: `Created succession plan for ${employee.name}`, metadata: { candidateId: candidate.id, targetRole: candidate.targetRole } });
      return NextResponse.json({ success: true, candidate });
    }
    if (body.action === "successionReadiness") {
      if (!READINESS.includes(body.readinessStatus)) throw new Error("Invalid readiness status");
      const candidate = await prisma.opsSuccessionCandidate.findUnique({ where: { id: String(body.candidateId || "") } });
      if (!candidate) throw new Error("Succession candidate not found");
      const notes = String(body.notes || "").trim();
      const updated = await prisma.$transaction(async (tx) => {
        await tx.opsSuccessionReview.create({ data: { candidateId: candidate.id, previousReadiness: candidate.readinessStatus, newReadiness: body.readinessStatus, notes: notes || null, reviewedBy: user.id } });
        return tx.opsSuccessionCandidate.update({ where: { id: candidate.id }, data: { readinessStatus: body.readinessStatus, readinessReviewDate: new Date(), managementNotes: notes || candidate.managementNotes, updatedBy: user.id } });
      });
      await writeAudit({ action: "OPS_SUCCESSION_READINESS_UPDATED", user, summary: "Updated succession readiness manually", metadata: { candidateId: candidate.id, from: candidate.readinessStatus, to: body.readinessStatus } });
      return NextResponse.json({ success: true, candidate: updated });
    }
    if (body.action === "eotmCreate") {
      const year = Number(body.year); const month = Number(body.month);
      const formula = await prisma.opsEotmFormulaVersion.findFirst({ where: { active: true }, orderBy: { createdAt: "desc" } });
      if (!formula) throw new Error("An active EOTM formula is required");
      const pendingCount = await prisma.opsMonthlyAppraisal.count({ where: { year, month, status: { in: ["DRAFT", "REVIEWED", "REOPENED"] } } });
      if (pendingCount) throw new Error("Approve all monthly appraisals before calculating EOTM candidates");
      const appraisalRows = await prisma.opsMonthlyAppraisal.findMany({ where: { year, month, status: "APPROVED" }, orderBy: [{ version: "desc" }, { totalScore: "desc" }] });
      const appraisals = [...new Map(appraisalRows.map((item) => [item.employeeId, item])).values()].sort((left, right) => right.totalScore - left.totalScore);
      if (!appraisals.length) throw new Error("Approved appraisals are required for EOTM");
      const latest = await prisma.opsEotmCompetition.findFirst({ where: { year, month }, orderBy: { version: "desc" } });
      const competition = await prisma.$transaction(async (tx) => {
        const created = await tx.opsEotmCompetition.create({ data: { year, month, version: (latest?.version || 0) + 1, status: "CALCULATED", formulaVersionId: formula.id } });
        await tx.opsEotmCandidate.createMany({ data: appraisals.map((item, index) => ({ competitionId: created.id, employeeId: item.employeeId, eligible: true, finalScore: item.totalScore, rank: index + 1, componentSnapshotJson: item.componentSnapshotJson, sourceSnapshotJson: JSON.stringify({ appraisalId: item.id, appraisalVersion: item.version, formulaCode: formula.code }) })) });
        return created;
      });
      await writeAudit({ action: "OPS_EOTM_CALCULATED", user, summary: `Calculated EOTM ${year}-${month}`, metadata: { competitionId: competition.id, candidateCount: appraisals.length } });
      return NextResponse.json({ success: true, competition });
    }
    const competition = await prisma.opsEotmCompetition.findUnique({ where: { id: String(body.competitionId || "") }, include: { candidates: true } });
    if (!competition) throw new Error("Competition not found");
    if (body.action === "eotmWinner") {
      if (competition.status === "LOCKED") throw new Error("Locked competition must be explicitly reopened first");
      if (!competition.candidates.some((item) => item.employeeId === body.employeeId)) throw new Error("Winner must be an eligible competition candidate");
      const updated = await prisma.opsEotmCompetition.update({ where: { id: competition.id }, data: { winnerEmployeeId: body.employeeId, status: "WINNER_APPROVED", approvedBy: user.id, approvedAt: new Date() } });
      return NextResponse.json({ success: true, competition: updated });
    }
    if (body.action === "eotmLock") {
      if (!competition.winnerEmployeeId) throw new Error("Approve a winner before locking");
      const updated = await prisma.opsEotmCompetition.update({ where: { id: competition.id }, data: { status: "LOCKED", lockedBy: user.id, lockedAt: new Date() } });
      await writeAudit({ action: "OPS_EOTM_LOCKED", user, summary: `Locked EOTM ${competition.year}-${competition.month}`, metadata: { competitionId: competition.id, winnerEmployeeId: competition.winnerEmployeeId } });
      return NextResponse.json({ success: true, competition: updated });
    }
    if (body.action === "eotmReopen") {
      const { error: reopenError } = await authorizeApi("OPS_EOTM_REOPEN"); if (reopenError) return reopenError;
      const reason = String(body.reason || "").trim(); if (!reason) throw new Error("Reopen reason is required");
      if (competition.status !== "LOCKED") throw new Error("Only a locked competition can be reopened");
      const updated = await prisma.opsEotmCompetition.update({ where: { id: competition.id }, data: { status: "REOPENED", reopenedBy: user.id, reopenedAt: new Date(), reopenReason: reason } });
      await writeAudit({ action: "OPS_EOTM_REOPENED", user, summary: `Reopened EOTM ${competition.year}-${competition.month}`, metadata: { competitionId: competition.id }, reason });
      return NextResponse.json({ success: true, competition: updated });
    }
    throw new Error("Unknown performance action");
  } catch (operationError) {
    const message = operationError?.code === "P2002" ? "This active succession plan already exists" : operationError.message;
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
