import { withAccountAccess } from '@/lib/accounts/routes';
import { calculateAndStoreAppraisal } from '@/lib/operations/appraisal-calculation';
import {loadEmployeeOfMonth,syncMonthlySummaries,createCompetition,competitionForBranch} from '@/lib/operations/employee-of-month';
import {periodSummaries,previewMonthlyAppraisal,parse as parseSummaryJson} from '@/lib/operations/monthly-summary';
import { changeSuccessionAction, enrichSuccessionActions, saveSuccessionPlan, successionOwners } from '@/lib/operations/succession-actions';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { manualAppraisalMeta, manualAppraisalSnapshots, normalizeManualAppraisalRows } from "@/lib/operations/manual-appraisal";
import { listMonthlyComponentEntries, changeMonthlyComponentEntry } from '@/lib/operations/manual-appraisal';
import { getSetting } from "@/lib/settings";
import { getEffectivePerformanceSettings, capturePerformanceSettingsSnapshot, readPerformanceSettingsSnapshot } from "@/lib/operations/performance-settings-service";
import { operationsBranch, assertBusinessRole, employeeBranchFilter, assertEmployeeBranch } from "@/lib/operations/business-access";
import { calculateMonthlyAppraisal, resolveSuccessionPath } from "@/lib/operations/performance-policy";
import { getApprovedEventAdjustments } from "@/lib/operations/operational-report-service";

const READINESS = ["NOT_ASSESSED", "DEVELOPING", "READY_SOON", "READY_NOW", "ON_HOLD", "PROMOTED", "COMPLETED", "CLOSED"];

function periodDates(year, month) {
  return { start: `${year}-${String(month).padStart(2, "0")}-01`, end: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10) };
}

async function appraisalPolicy(appraisal, branch) {
  const employee = await prisma.employee.findUnique({where:{id:appraisal.employeeId},select:{id:true,branch:true}});
  if (!employee) throw new Error('Employee not found');
  await assertEmployeeBranch(prisma,employee,branch);
  const snapshot = await readPerformanceSettingsSnapshot(prisma, { kind: "MONTHLY_APPRAISAL", recordId: appraisal.id });
  if (snapshot?.branch && snapshot.branch !== branch) throw new Error("Appraisal belongs to another branch");
  return snapshot?.effective || await getEffectivePerformanceSettings(prisma, { branch, date: periodDates(appraisal.year, appraisal.month).end });
}

async function GETHandler(request) {
  const { user, error } = await authorizeApi("OPS_APPRAISAL_READ");
  if (error) return error;
  try {
  const params = new URL(request.url).searchParams;
  const year = Number(params.get("year") || new Date().getFullYear());
  const month = Number(params.get("month") || new Date().getMonth() + 1);
  if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) return NextResponse.json({ success:false,error:"Invalid performance period" },{status:400});
  const effectiveBranch = await operationsBranch(prisma, user, params.get("branch"));
  const employeeScope = await employeeBranchFilter(prisma,effectiveBranch);
  const performanceConfiguration = await getEffectivePerformanceSettings(prisma, { branch: effectiveBranch, date: periodDates(year, month).end });
  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  const section=params.get('section')||'appraisal',appraisalMode=section==='appraisal',eotmMode=section==='eotm',successionMode=section==='succession';
  if(eotmMode){
    const monthlyView=await loadEmployeeOfMonth(prisma,{branch:effectiveBranch,year,month});
    monthlyView.componentEntries=await listMonthlyComponentEntries(prisma,{branch:effectiveBranch,year,month,employeeIds:monthlyView.rows.map(row=>row.employee.id)});
    let artworkConfig={};try{artworkConfig=JSON.parse(await getSetting('RECOGNITION_ARTWORK_CONFIG','{}'));}catch{}
    const branchRows=await prisma.employee.findMany({select:{branch:true},distinct:['branch']});
    const branches=[...new Set([effectiveBranch,...branchRows.map(row=>row.branch).filter(Boolean)])].filter(code=>user.profile?.allBranches||user.profile?.branches?.includes(code)||code===effectiveBranch);
    return NextResponse.json({success:true,year,month,branch:{branchCode:effectiveBranch},branches,monthlyView,competitions:monthlyView.competition?[monthlyView.competition]:[],appraisals:[],appraisalSummary:{pending:monthlyView.liveRows.filter(row=>row.appraisalStatus&&row.appraisalStatus!=='APPROVED').length,approved:monthlyView.liveRows.filter(row=>row.appraisalStatus==='APPROVED').length},artworkConfig,performanceSettings:performanceConfiguration.value});
  }
  const [appraisalRows, previousAppraisals, competitions, succession, employees, artworkRaw, branchRaw] = await Promise.all([
    (appraisalMode||eotmMode)?prisma.opsMonthlyAppraisal.findMany({ where: { year, month, employee: { ...employeeScope } }, include: { employee: { select: { id: true, name: true, nameEn: true, hrisNumber: true, localEmployeeCode: true, jobTitle: true } }, formulaVersion: { select: { code: true, label: true } } }, orderBy: [{ version: "desc" }, { totalScore: "desc" }, { employee: { name: "asc" } }] }):Promise.resolve([]),
    appraisalMode?prisma.opsMonthlyAppraisal.findMany({ where: { year: previousYear, month: previousMonth, status: "APPROVED", employee: employeeScope }, select: { totalScore: true } }):Promise.resolve([]),
    eotmMode?prisma.opsEotmCompetition.findMany({ where: { year, month }, include: { winner: { select: { id: true, name: true, nameAr: true, nameEn: true, operationalName: true, documents: { where: { documentType: "EMPLOYEE_PHOTO", status: "ACTIVE" }, orderBy: { uploadedAt: "desc" }, take: 1 } } }, candidates: { include: { employee: { select: { id: true, name: true } } }, orderBy: { rank: "asc" } }, formulaVersion: true }, orderBy: { version: "desc" } }):Promise.resolve([]),
    successionMode?prisma.opsSuccessionCandidate.findMany({ where: { active: true, employee: { OR: [{ branch: effectiveBranch }, { branch: null }] } }, include: { employee: { select: { id: true, name: true, jobTitle: true } }, developmentActions: true, reviews: { orderBy: { reviewDate: "desc" } } }, orderBy: { updatedAt: "desc" } }):Promise.resolve([]),
    (appraisalMode||successionMode)?prisma.employee.findMany({ where: appraisalMode?employeeScope:{ OR: [{ branch: effectiveBranch }, { branch: null }] }, select: { id: true, name: true, jobTitle: true, active: true, employmentStatus: true, hrisNumber: true, localEmployeeCode: true }, orderBy: [{ active: "desc" }, { name: "asc" }] }):Promise.resolve([]),
    getSetting("RECOGNITION_ARTWORK_CONFIG", "{}"),
    getSetting("OPS_BRANCH_CONFIG", "{}"),
  ]);
  let artworkConfig = {}; let branch = {};
  try { artworkConfig = JSON.parse(artworkRaw); } catch {}
  try { branch = JSON.parse(branchRaw); } catch {}
  const latestAppraisals = new Map();
  appraisalRows.forEach((item) => { if (!latestAppraisals.has(item.employeeId)) latestAppraisals.set(item.employeeId, item); });
  const appraisals = [...latestAppraisals.values()].filter(row=>row.status!=='SUPERSEDED')
    .map((item) => ({ ...item, ...manualAppraisalMeta(item) }))
    .sort((left, right) => right.totalScore - left.totalScore || left.employee.name.localeCompare(right.employee.name));
  const serializedCompetitions = competitions.map((competition) => ({ ...competition, winner: competition.winner ? { ...competition.winner, photoUrl: competition.winner.documents?.[0] ? `/api/operations/employees/${competition.winner.id}/documents/${competition.winner.documents[0].id}` : null, documents: undefined } : null }));
  for (const plan of succession) {
    const snapshot = await readPerformanceSettingsSnapshot(prisma, { kind: "SUCCESSION", recordId: plan.id });
    plan.configuration = snapshot?.effective.value.succession || performanceConfiguration.value.succession;
  }
  await enrichSuccessionActions(prisma, succession, effectiveBranch);
  const owners=params.get('section')==='succession'?await successionOwners(prisma,effectiveBranch,user):[];
  const monthlyView=appraisalMode?await loadEmployeeOfMonth(prisma,{branch:effectiveBranch,year,month}):null;
  const dailySummaries=monthlyView?.liveRows.filter(row=>row.dailyDetails.length)||[];
  const branchRows=appraisalMode?await prisma.employee.findMany({select:{branch:true},distinct:['branch']}):[];
  const branches=[...new Set([effectiveBranch,...branchRows.map(row=>row.branch).filter(Boolean)])].filter(code=>user.profile?.allBranches||user.profile?.branches?.includes(code)||code===effectiveBranch);
  return NextResponse.json({ success: true, year, month, previousPeriod: { year: previousYear, month: previousMonth }, appraisals, dailySummaries, monthlyResults:monthlyView?.liveRows||[], branches,appraisalSummary:{pending:appraisals.filter(row=>['DRAFT','REVIEWED','REOPENED'].includes(row.status)).length,approved:appraisals.filter(row=>row.status==='APPROVED').length}, previousAppraisals, competitions: serializedCompetitions, succession, employees, owners, currentUserId:user.id, artworkConfig, branch:{...branch,branchCode:effectiveBranch}, performanceSettings: performanceConfiguration.value, configurationVersion: performanceConfiguration.version });
  } catch (operationError) {
    return NextResponse.json({ success: false, error: operationError.message }, { status: operationError.status || 400 });
  }
}

async function POSTHandler(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ success:false,error:"Invalid JSON request" },{status:400});
  const successionAction = String(body.action || "").startsWith("succession");
  const appraisalAction = String(body.action || "").startsWith("appraisal");
  const { user, error } = await authorizeApi(successionAction ? "OPS_SUCCESSION_MANAGE" : appraisalAction ? "OPS_APPRAISAL_APPROVE" : "OPS_EOTM_MANAGE");
  if (error) return error;
  try {
    const branch = await operationsBranch(prisma, user, body.branch);
    if(['appraisalSourcePropose','appraisalSourceApprove','appraisalSourceCancel'].includes(body.action))return NextResponse.json({success:true,...await changeMonthlyComponentEntry(prisma,{user,branch,year:Number(body.year),month:Number(body.month),action:body.action,rows:body.rows,id:body.entryId,reason:body.reason})});
    if(body.action==='appraisalRefresh'){
      const view=await loadEmployeeOfMonth(prisma,{branch,year:Number(body.year),month:Number(body.month)});
      assertBusinessRole(user,view.formula.workflow.reviewRoles);
      if(!body.confirmed||String(body.reason||'').trim().length<5)throw new Error('Preview, confirm and provide a reason before recalculating');
      if(body.expectedFingerprint!==view.sourceFingerprint)throw Object.assign(new Error('Source records changed; review a fresh preview'),{status:409});
      if(view.frozen)throw new Error('Reopen the published competition explicitly before recalculating');
      const result=await syncMonthlySummaries(prisma,{user,branch,year:Number(body.year),month:Number(body.month),explicit:true,reason:body.reason});
      return NextResponse.json({success:true,...result});
    }
    if(body.action==='eotmCreate')return NextResponse.json({success:true,...await createCompetition(prisma,{user,branch,year:Number(body.year),month:Number(body.month),expectedFingerprint:body.expectedFingerprint})});
    if (body.action === "successionDevelopment") return NextResponse.json({success:true,...await changeSuccessionAction(prisma,{...body,user,branch,id:body.developmentActionId})});
    if (body.action === "successionPlanUpdate") return NextResponse.json({success:true,...await saveSuccessionPlan(prisma,{...body,user,branch})});
    if (body.action === "appraisalCalculate") return NextResponse.json({success:true,...await calculateAndStoreAppraisal(prisma,{user,branch,employeeId:String(body.employeeId||''),year:Number(body.year),month:Number(body.month),reason:body.reason})});
    if (body.action === "appraisalManualOverride") {
      const year = Number(body.year); const month = Number(body.month); const reason = String(body.reason || "").trim();
      if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error("Invalid appraisal period");
      if (reason.length < 5) throw new Error("A clear manual override reason is required");
      const effective = await getEffectivePerformanceSettings(prisma, { branch, date: periodDates(year, month).end });
      const monthly = effective.value.monthlyAppraisal;
      assertBusinessRole(user, effective.value.permissions.adjustmentProposeRoles);
      const rows = normalizeManualAppraisalRows(body.rows, { minimum: monthly.finalScoreMinimum, maximum: monthly.finalScoreMaximum });
      rows.forEach(row => assertBusinessRole(user, effective.value.permissions.adjustmentProposeRoles, row.employeeId));
      const [lockedCompetition, employees, activeFormulas] = await Promise.all([
        prisma.opsEotmCompetition.findFirst({ where: { year, month, status: "LOCKED" }, select: { id: true } }),
        prisma.employee.findMany({ where: { id: { in: rows.map((item) => item.employeeId) }, ...await employeeBranchFilter(prisma,branch) }, select: { id: true, name: true } }),
        prisma.opsAppraisalFormulaVersion.findMany({ where: { id: monthly.formulaVersionId }, orderBy: { createdAt: "desc" } }),
      ]);
      if (lockedCompetition) throw new Error("Reopen the locked Employee of the Month competition before changing historical appraisal scores");
      if (employees.length !== rows.length) throw new Error("One or more employees could not be found");
      const periodKey = `${year}-${String(month).padStart(2, "0")}-01`;
      const activeFormula = activeFormulas[0];
      const names = new Map(employees.map((employee) => [employee.id, employee.name]));
      const created = await prisma.$transaction(async (tx) => {
        const results = [];
        for (const row of rows) {
          const previous = await tx.opsMonthlyAppraisal.findFirst({ where: { employeeId: row.employeeId, year, month }, orderBy: { version: "desc" } });
          const formulaVersionId = activeFormula?.id;
          if (!formulaVersionId) throw new Error("An active monthly appraisal formula is required before entering a manual score");
          await tx.opsMonthlyAppraisal.updateMany({ where: { employeeId: row.employeeId, year, month, status: { in: ["DRAFT", "REVIEWED", "REOPENED"] } }, data: { status: "SUPERSEDED" } });
          const snapshots = manualAppraisalSnapshots({ totalScore: row.totalScore, reason, userId: user.id, priorAppraisal: previous });
          const appraisal = await tx.opsMonthlyAppraisal.create({ data: { employeeId: row.employeeId, year, month, version: (previous?.version || 0) + 1, formulaVersionId, status: "DRAFT", totalScore: row.totalScore, ...snapshots } });
          await capturePerformanceSettingsSnapshot(tx, { kind: "MONTHLY_APPRAISAL", recordId: appraisal.id, branch, date: periodKey, configOverride: effective });
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
      if (appraisal.status === "APPROVED") throw new Error("This appraisal is already approved");
      const pinned = await appraisalPolicy(appraisal, branch);
      assertBusinessRole(user, pinned.value.monthlyAppraisal.workflow.approvalRoles, appraisal.employeeId);
      if(parseSummaryJson(appraisal.sourceSnapshotJson).source!=='MANUAL_OVERRIDE'){
        const current=await previewMonthlyAppraisal(prisma,{employeeId:appraisal.employeeId,branch,year:appraisal.year,month:appraisal.month});
        if(current.summary.finalResult==null||parseSummaryJson(appraisal.sourceSnapshotJson).fingerprint!==current.fingerprint)throw new Error('Daily sources or scoring settings changed; review and recalculate this draft before approval');
      }
      const now = new Date();
      const updated = await prisma.opsMonthlyAppraisal.update({ where: { id: appraisal.id }, data: { status: "APPROVED", reviewedBy: appraisal.reviewedBy || user.id, reviewedAt: appraisal.reviewedAt || now, approvedBy: user.id, approvedAt: now } });
      await writeAudit({ action: "OPS_APPRAISAL_APPROVED", user, summary: `Approved appraisal ${appraisal.year}-${appraisal.month}`, metadata: { appraisalId: appraisal.id, employeeId: appraisal.employeeId, scorePreserved: appraisal.totalScore } });
      return NextResponse.json({ success: true, appraisal: updated });
    }
    if (body.action === "appraisalApproveAll") {
      const year = Number(body.year); const month = Number(body.month);
      if (!Number.isInteger(year) || year < 2020 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) throw new Error("Invalid appraisal period");
      const pending = await prisma.opsMonthlyAppraisal.findMany({ where: { year, month, status: { in: ["DRAFT", "REVIEWED", "REOPENED"] }, employee: await employeeBranchFilter(prisma,branch) } });
      if (!pending.length) throw new Error("No pending appraisals exist for this period");
      for (const appraisal of pending) {
        const pinned = await appraisalPolicy(appraisal, branch);
        assertBusinessRole(user, pinned.value.monthlyAppraisal.workflow.approvalRoles, appraisal.employeeId);
        if(parseSummaryJson(appraisal.sourceSnapshotJson).source!=='MANUAL_OVERRIDE'){
          const current=await previewMonthlyAppraisal(prisma,{employeeId:appraisal.employeeId,branch,year,month});
          if(current.summary.finalResult==null||parseSummaryJson(appraisal.sourceSnapshotJson).fingerprint!==current.fingerprint)throw new Error('Daily sources changed; recalculate stale drafts before approving this month');
        }
      }
      const now = new Date();
      await prisma.$transaction(pending.map((appraisal) => prisma.opsMonthlyAppraisal.update({ where: { id: appraisal.id }, data: { status: "APPROVED", reviewedBy: appraisal.reviewedBy || user.id, reviewedAt: appraisal.reviewedAt || now, approvedBy: user.id, approvedAt: now } })));
      await writeAudit({ action: "OPS_APPRAISAL_PERIOD_APPROVED", user, summary: `Approved ${pending.length} appraisals for ${year}-${month}`, metadata: { year, month, appraisalIds: pending.map((item) => item.id), scoresPreserved: true } });
      return NextResponse.json({ success: true, approved: pending.length });
    }
    if (body.action === "successionCreate") {
      const employee = await prisma.employee.findUnique({ where: { id: String(body.employeeId || "") } });
      if (!employee || !employee.active) throw new Error("Select an active employee");
      await assertEmployeeBranch(prisma,employee,branch);
      const effective = await getEffectivePerformanceSettings(prisma, { branch });
      const configuredPath = resolveSuccessionPath(effective.value, { fromRole: employee.jobTitle, toRole: body.targetRole });
      const path = { currentRole: configuredPath.path.fromRole, targetRole: configuredPath.path.toRole };
      if(await prisma.opsSuccessionCandidate.findFirst({where:{employeeId:employee.id,targetRole:path.targetRole,active:true,readinessStatus:{notIn:["CLOSED","COMPLETED","PROMOTED"]}}}))throw new Error("An active plan already exists for this employee and target role");
      const candidate = await prisma.$transaction(async tx => {
        const record = await tx.opsSuccessionCandidate.create({ data: { employeeId: employee.id, currentRole: path.currentRole, targetRole: path.targetRole, managementNotes: String(body.notes || "").trim() || null, createdBy: user.id, updatedBy: user.id } });
        await capturePerformanceSettingsSnapshot(tx, { kind: "SUCCESSION", recordId: record.id, branch, date: new Date().toISOString().slice(0, 10), configOverride: effective });
        return record;
      });
      await writeAudit({ action: "OPS_SUCCESSION_CREATED", user, summary: `Created succession plan for ${employee.name}`, metadata: { candidateId: candidate.id, targetRole: candidate.targetRole } });
      return NextResponse.json({ success: true, candidate });
    }
    if (body.action === "successionReadiness") {
      if (!READINESS.includes(body.readinessStatus)) throw new Error("Invalid readiness status");
      const candidate = await prisma.opsSuccessionCandidate.findUnique({ where: { id: String(body.candidateId || "") } });
      if (!candidate) throw new Error("Succession candidate not found");
      const assessed=await prisma.employee.findUnique({where:{id:candidate.employeeId}});
      await assertEmployeeBranch(prisma,assessed,branch);
      const savedPolicy = await readPerformanceSettingsSnapshot(prisma, { kind: "SUCCESSION", recordId: candidate.id });
      const effective = savedPolicy?.effective || await getEffectivePerformanceSettings(prisma, { branch });
      assertBusinessRole(user,effective.value.permissions.adjustmentApproveRoles,candidate.employeeId);
      if (!effective.value.succession.readinessLevels.some(item => item.active && item.code === body.readinessStatus)) throw new Error("This readiness level is disabled in the plan's configuration");
      if (savedPolicy?.branch && savedPolicy.branch !== branch) throw new Error("Succession plan belongs to another branch");
      const notes = String(body.notes || "").trim();
      if(notes.length<5)throw new Error("A clear review rationale is required");
      if(body.expectedUpdatedAt&&new Date(body.expectedUpdatedAt).getTime()!==candidate.updatedAt.getTime())throw Object.assign(new Error("Plan changed; reload before recording a readiness decision"),{status:409});
      const updated = await prisma.$transaction(async (tx) => {
        const changed=await tx.opsSuccessionCandidate.updateMany({where:{id:candidate.id,updatedAt:candidate.updatedAt},data:{readinessStatus:body.readinessStatus,readinessReviewDate:new Date(),managementNotes:notes,updatedBy:user.id}});
        if(changed.count!==1)throw Object.assign(new Error("Plan changed; reload before recording a readiness decision"),{status:409});
        await tx.auditLog.create({data:{action:"OPS_SUCCESSION_READINESS_UPDATED",userId:user.id,summary:"Updated succession readiness manually",metadata:JSON.stringify({candidateId:candidate.id,from:candidate.readinessStatus,to:body.readinessStatus,notes})}});
        await tx.opsSuccessionReview.create({ data: { candidateId: candidate.id, previousReadiness: candidate.readinessStatus, newReadiness: body.readinessStatus, notes: notes || null, reviewedBy: user.id } });
        return tx.opsSuccessionCandidate.findUnique({where:{id:candidate.id}});
      });
      return NextResponse.json({ success: true, candidate: updated });
    }
    const competition = await prisma.opsEotmCompetition.findUnique({ where: { id: String(body.competitionId || "") }, include: { candidates: true } });
    if (!competition) throw new Error("Competition not found");
    const scopedCompetition=await competitionForBranch(prisma,{branch,year:competition.year,month:competition.month});
    if(scopedCompetition?.id!==competition.id)throw Object.assign(new Error('Competition belongs to another branch or has been superseded'),{status:403});
    if (body.action === "eotmWinner") {
      if(user.employeeId===body.employeeId)throw Object.assign(new Error('You cannot approve yourself as winner'),{status:403});
      if (['LOCKED','WINNER_APPROVED'].includes(competition.status)) throw new Error("Published competition must be explicitly reopened first");
      const view=await loadEmployeeOfMonth(prisma,{branch,year:competition.year,month:competition.month});
      if(view.sourceChanged)throw new Error('Candidate sources changed; explicitly recalculate and review before selecting a winner');
      if (!competition.candidates.some((item) => item.employeeId === body.employeeId&&item.eligible)) throw new Error("Winner must be an eligible competition candidate");
      const updated = await prisma.opsEotmCompetition.update({ where: { id: competition.id }, data: { winnerEmployeeId: body.employeeId, status: "WINNER_APPROVED", approvedBy: user.id, approvedAt: new Date() } });
      return NextResponse.json({ success: true, competition: updated });
    }
    if (body.action === "eotmLock") {
      if(competition.status!=='WINNER_APPROVED')throw new Error('Only an approved winner can be locked');
      if (!competition.winnerEmployeeId) throw new Error("Approve a winner before locking");
      const updated = await prisma.opsEotmCompetition.update({ where: { id: competition.id }, data: { status: "LOCKED", lockedBy: user.id, lockedAt: new Date() } });
      await writeAudit({ action: "OPS_EOTM_LOCKED", user, summary: `Locked EOTM ${competition.year}-${competition.month}`, metadata: { competitionId: competition.id, winnerEmployeeId: competition.winnerEmployeeId } });
      return NextResponse.json({ success: true, competition: updated });
    }
    if (body.action === "eotmReopen") {
      const { error: reopenError } = await authorizeApi("OPS_EOTM_REOPEN"); if (reopenError) return reopenError;
      const reason = String(body.reason || "").trim(); if (!reason) throw new Error("Reopen reason is required");
      if (!['LOCKED','WINNER_APPROVED'].includes(competition.status)) throw new Error("Only a published or locked competition can be reopened");
      const updated = await prisma.opsEotmCompetition.update({ where: { id: competition.id }, data: { status: "REOPENED", reopenedBy: user.id, reopenedAt: new Date(), reopenReason: reason } });
      await writeAudit({ action: "OPS_EOTM_REOPENED", user, summary: `Reopened EOTM ${competition.year}-${competition.month}`, metadata: { competitionId: competition.id }, reason });
      return NextResponse.json({ success: true, competition: updated });
    }
    throw new Error("Unknown performance action");
  } catch (operationError) {
    const message = operationError?.code === "P2002" ? "This record was updated concurrently; refresh before trying again" : operationError.message;
    return NextResponse.json({ success: false, error: message }, { status: operationError.status||400 });
  }
}

export const GET=withAccountAccess(GETHandler);
export const POST=withAccountAccess(POSTHandler);
