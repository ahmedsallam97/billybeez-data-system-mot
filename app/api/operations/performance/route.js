import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { assertSuccessionPath } from "@/lib/operations/succession";
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
  const [appraisals, previousAppraisals, competitions, succession, employees, artworkRaw, branchRaw] = await Promise.all([
    prisma.opsMonthlyAppraisal.findMany({ where: { year, month }, include: { employee: { select: { id: true, name: true, nameEn: true, hrisNumber: true, localEmployeeCode: true, jobTitle: true } }, formulaVersion: { select: { code: true, label: true } } }, orderBy: [{ totalScore: "desc" }, { employee: { name: "asc" } }] }),
    prisma.opsMonthlyAppraisal.findMany({ where: { year: previousYear, month: previousMonth, status: "APPROVED" }, select: { totalScore: true } }),
    prisma.opsEotmCompetition.findMany({ where: { year, month }, include: { winner: { select: { id: true, name: true, nameAr: true, nameEn: true, operationalName: true, documents: { where: { documentType: "EMPLOYEE_PHOTO", status: "ACTIVE" }, orderBy: { uploadedAt: "desc" }, take: 1 } } }, candidates: { include: { employee: { select: { id: true, name: true } } }, orderBy: { rank: "asc" } }, formulaVersion: true }, orderBy: { version: "desc" } }),
    prisma.opsSuccessionCandidate.findMany({ where: { active: true }, include: { employee: { select: { id: true, name: true, jobTitle: true } }, developmentActions: true, reviews: { orderBy: { reviewDate: "desc" } } }, orderBy: { updatedAt: "desc" } }),
    prisma.employee.findMany({ where: { active: true }, select: { id: true, name: true, jobTitle: true }, orderBy: { name: "asc" } }),
    getSetting("RECOGNITION_ARTWORK_CONFIG", "{}"),
    getSetting("OPS_BRANCH_CONFIG", "{}"),
  ]);
  let artworkConfig = {}; let branch = {};
  try { artworkConfig = JSON.parse(artworkRaw); } catch {}
  try { branch = JSON.parse(branchRaw); } catch {}
  const serializedCompetitions = competitions.map((competition) => ({ ...competition, winner: competition.winner ? { ...competition.winner, photoUrl: competition.winner.documents?.[0] ? `/api/operations/employees/${competition.winner.id}/documents/${competition.winner.documents[0].id}` : null, documents: undefined } : null }));
  return NextResponse.json({ success: true, year, month, previousPeriod: { year: previousYear, month: previousMonth }, appraisals, previousAppraisals, competitions: serializedCompetitions, succession, employees, artworkConfig, branch });
}

export async function POST(request) {
  const body = await request.json();
  const successionAction = String(body.action || "").startsWith("succession");
  const { user, error } = await authorizeApi(successionAction ? "OPS_SUCCESSION_MANAGE" : "OPS_EOTM_MANAGE");
  if (error) return error;
  try {
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
      const appraisals = await prisma.opsMonthlyAppraisal.findMany({ where: { year, month, status: "APPROVED" }, orderBy: { totalScore: "desc" } });
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
