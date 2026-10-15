const { randomUUID, createHash } = require("crypto");
const { getEffectivePerformanceSettings } = require("./performance-settings-service");
const {
  calculateSuitability,
  overlapMinutes,
  resolveShiftLeadershipRequirement,
  scoreOperationalEvent,
  validateStaffing,
} = require("./performance-policy");

const REPORT_PREFIX = "OPS_OPERATIONAL_REPORT:";
const SUITABILITY_PREFIX = "OPS_SUITABILITY_SNAPSHOT:";
const SCHEMA_VERSION = 1;
const REPORT_TYPES = new Set(["TRIP", "BIRTHDAY", "SHIFT_LEADERSHIP"]);
const REPORT_STATUSES = new Set(["DRAFT", "REOPENED", "SUBMITTED", "REVIEWED", "APPROVED", "REJECTED", "CANCELLED"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function serviceError(message, code, status = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (details) error.details = details;
  return error;
}

function validDate(value, label = "Date") {
  const text = String(value || "");
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (!ISO_DATE.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw serviceError(`${label} must be a valid YYYY-MM-DD date`, "INVALID_DATE", 422);
  return text;
}

function normalizeBranch(value) {
  const branch = String(value || "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,79}$/.test(branch)) throw serviceError("A valid branch is required", "INVALID_BRANCH", 422);
  return branch;
}

function normalizeReportType(value) {
  const reportType = String(value || "").trim().toUpperCase();
  if (!REPORT_TYPES.has(reportType)) throw serviceError("A supported report type is required", "INVALID_REPORT_TYPE", 422);
  return reportType;
}

function normalizeText(value, maximum = 5000) {
  return String(value || "").trim().slice(0, maximum);
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function reportKey(id) {
  const reportId = String(id || "").trim();
  if (!reportId || reportId.length > 300 || /[\r\n]/.test(reportId)) throw serviceError("A valid report id is required", "INVALID_REPORT_ID", 422);
  return `${REPORT_PREFIX}${reportId}`;
}

function reasonRequired(value, label = "reason") {
  const reason = normalizeText(value, 2000);
  if (reason.length < 5) throw serviceError(`A clear ${label} of at least 5 characters is required`, "REASON_REQUIRED", 422);
  return reason;
}

function assertRevision(value) {
  const revision = Number(value);
  if (!Number.isInteger(revision) || revision < 1) throw serviceError("expectedRevision is required", "EXPECTED_REVISION_REQUIRED", 422);
  return revision;
}

function parseReport(row) {
  let report;
  try { report = JSON.parse(row?.value || ""); } catch { throw serviceError("Stored operational report is malformed", "MALFORMED_OPERATIONAL_REPORT", 500); }
  if (!report || report.schemaVersion !== SCHEMA_VERSION || !report.id || !REPORT_TYPES.has(report.reportType) || !REPORT_STATUSES.has(report.status) || !Number.isInteger(report.revision) || report.revision < 1 || !report.configSnapshot?.effective?.value || !report.source?.id || !Array.isArray(report.history)) {
    throw serviceError("Stored operational report is malformed", "MALFORMED_OPERATIONAL_REPORT", 500);
  }
  return report;
}

async function loadActor(db, user) {
  const id = String(user?.id || "").trim();
  if (!id) throw serviceError("Login required", "LOGIN_REQUIRED", 401);
  const actor = await db.user.findUnique({ where: { id }, select: { id: true, role: true, active: true, employeeId: true, employee: { select: { id: true, branch: true } } } });
  if (!actor?.active) throw serviceError("Login required", "LOGIN_REQUIRED", 401);
  if(user.profile){const fresh=await require('../accounts/service').loadAccount(db,actor);if(!fresh.roleActive||fresh.profile.archivedAt||fresh.profile.forcePasswordChange)throw serviceError('Account access denied','PERMISSION_DENIED',403);return {...actor,profile:fresh.profile,permissions:fresh.permissions};}
  if (!["ADMIN", "MANAGER"].includes(actor.role)) throw serviceError("Permission denied", "PERMISSION_DENIED", 403);
  return actor;
}

async function configuredDefaultBranch(db) {
  const row = await db.systemSetting.findUnique({ where: { key: "OPS_BRANCH_CONFIG" } });
  const branch = String(parseJsonObject(row?.value).branchCode || "").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{0,79}$/.test(branch) ? branch : null;
}

async function assertBranchAccess(db, actor, branchInput, { allowAllAdmin = false } = {}) {
  if(actor.profile){const current=require('../accounts/context').context.getStore();if(branchInput&&current&&!current.unrestricted&&!current.branches.includes(String(branchInput).toUpperCase()))throw serviceError('Report is outside your branch scope','BRANCH_ACCESS_DENIED',403);if(allowAllAdmin&&!branchInput&&actor.profile.allBranches&&actor.profile.dataScope==='ALL')return null;return require('./business-access').operationsBranch(db,actor,branchInput);}
  const linkedBranch = String(actor.employee?.branch || "").trim().toUpperCase();
  const managerBranch = actor.role === "MANAGER" ? (linkedBranch || await configuredDefaultBranch(db)) : null;
  if (actor.role === "ADMIN" && allowAllAdmin && !branchInput) return null;
  const branch = normalizeBranch(branchInput || managerBranch || await configuredDefaultBranch(db));
  if (actor.role === "MANAGER" && (!managerBranch || branch !== managerBranch)) throw serviceError("Managers may only access their linked employee branch or configured default branch", "BRANCH_ACCESS_DENIED", 403);
  return branch;
}

function assertRole(roles, actor, message = "This role cannot perform the report action") {
  if (!Array.isArray(roles) || !roles.includes(actor.role)) throw serviceError(message, "REPORT_ROLE_DENIED", 403);
}

function branchApplies(branches, branch) {
  return Array.isArray(branches) && (branches.includes("*") || branches.includes(branch));
}

function effectiveOn(item, date) {
  return item?.active && item.effectiveFrom <= date && (!item.effectiveTo || item.effectiveTo >= date);
}

function templateCandidates(items, { reportType, branch, date }) {
  const candidates = (Array.isArray(items) ? items : []).filter((item) => effectiveOn(item, date) && item.reportType === reportType && branchApplies(item.branches, branch));
  candidates.sort((left, right) => Number(right.version || 0) - Number(left.version || 0) || String(right.effectiveFrom).localeCompare(String(left.effectiveFrom)));
  return candidates;
}

function selectTemplate(items, { reportType, branch, date, code, required, kind }) {
  const candidates = templateCandidates(items, { reportType, branch, date }).filter(item => !code || item.code === code);
  if (!candidates.length) {
    if (!required) return null;
    throw serviceError(`An active ${kind} template is required for ${reportType}`, `${kind.toUpperCase()}_TEMPLATE_REQUIRED`, 422);
  }
  if (!code && new Set(candidates.map((item) => item.code)).size > 1) throw serviceError(`Select a ${kind} template because multiple templates are active`, `${kind.toUpperCase()}_TEMPLATE_AMBIGUOUS`, 409);
  return clone(candidates[0]);
}

function templateChoices(items, scope, { process = false } = {}) {
  const seen = new Set();
  return templateCandidates(items, scope).filter(template => {
    if (seen.has(template.code)) return false;
    seen.add(template.code);
    // Match createReport's existing requirement for active branch process steps.
    if (process && !applicableSteps(template, scope.branch).length) return false;
    return true;
  }).map(({ code, label, labelAr, version, effectiveFrom, effectiveTo }) => ({ code, label, labelAr, version, effectiveFrom, effectiveTo }));
}

async function findSource(db, reportType, sourceId, shiftCode) {
  const id = String(sourceId || "").trim();
  if (!id) throw serviceError("A source record is required", "REPORT_SOURCE_REQUIRED", 422);
  if (reportType === "TRIP") {
    const source = await db.opsDailyTrip.findFirst({ where: { id, status: { not: "CANCELLED" } } });
    if (!source) throw serviceError("Trip source was not found or is cancelled", "REPORT_SOURCE_NOT_FOUND", 404);
    return { type: "OPS_DAILY_TRIP", id: source.id, branch: normalizeBranch(source.branch), workDate: validDate(source.workDate), snapshot: clone(source) };
  }
  if (reportType === "BIRTHDAY") {
    const source = await db.opsDailyEvent.findFirst({ where: { id, eventType: "BIRTHDAY", status: { not: "CANCELLED" } } });
    if (!source) throw serviceError("Birthday source was not found or is cancelled", "REPORT_SOURCE_NOT_FOUND", 404);
    return { type: "OPS_DAILY_EVENT", id: source.id, branch: normalizeBranch(source.branch), workDate: validDate(source.workDate), snapshot: clone(source) };
  }
  let source = await db.opsOperationsDay.findUnique({ where: { id } });
  let scheduleSource = null;
  if (!source) {
    const reference = /^SCHEDULE:([^:]+):(\d{4}-\d{2}-\d{2})$/.exec(id);
    if (!reference) throw serviceError("Operations day source was not found", "REPORT_SOURCE_NOT_FOUND", 404);
    const workDate = validDate(reference[2]);
    const {state} = await require('./schedule-state').readScheduleState(db, reference[1]);
    const schedule = await require('./schedule-state').publishedScheduleForBranch(db, workDate, state.branch);
    if (!schedule || schedule.id !== reference[1]) throw serviceError("A published schedule for this date and shift is required", "SHIFT_SCHEDULE_REQUIRED", 422);
    source = {id, branch: state.branch, workDate, status: 'SCHEDULED', version: schedule.version};
    scheduleSource = schedule;
  }
  const normalizedShift = String(shiftCode || "").trim().toUpperCase();
  if (!normalizedShift) throw serviceError("A Shift Leadership report requires a shift code", "SHIFT_CODE_REQUIRED", 422);
  const shift = await db.opsShiftDefinition.findUnique({ where: { code: normalizedShift } });
  if (!shift?.active) throw serviceError("The selected shift is not active", "SHIFT_NOT_ACTIVE", 422);
  const publishedSchedule = await require('./schedule-state').publishedScheduleForBranch(db, source.workDate, source.branch);
  if (!publishedSchedule) throw serviceError("A published schedule for this date and shift is required", "SHIFT_SCHEDULE_REQUIRED", 422);
  const shiftAssignments = await db.opsScheduleAssignment.findMany({ where: { scheduleId: publishedSchedule.id, workDate: source.workDate, shiftCode: normalizedShift }, select: { employeeId: true }, take: 1 });
  if (!shiftAssignments.length) throw serviceError("A published schedule for this date and shift is required", "SHIFT_SCHEDULE_REQUIRED", 422);
  const {state} = await require('./schedule-state').readScheduleState(db, publishedSchedule.id);
  if (state.branch !== source.branch) throw serviceError('Published schedule belongs to another branch', 'BRANCH_ACCESS_DENIED', 403);
  const selectedLeaderId = require('./day-responsibilities').dayRoles(state, source.workDate)[normalizedShift] || null;
  return { type: scheduleSource ? "OPS_PUBLISHED_SCHEDULE_SHIFT" : "OPS_OPERATIONS_DAY", id: source.id, branch: normalizeBranch(source.branch), workDate: validDate(source.workDate), shiftCode: normalizedShift, snapshot: { ...clone(source), startTime: shift.startTime, endTime: shift.endTime, selectedLeaderId, publishedSchedule: { id: publishedSchedule.id, version: publishedSchedule.version, startTime: shift.startTime, endTime: shift.endTime } } };
}

function reportIdFor(source, reportType) {
  return reportType === "SHIFT_LEADERSHIP" ? `${reportType}:${source.branch}:${source.workDate}:${source.shiftCode}` : `${reportType}:${source.id}`;
}

async function existingShiftReport(db, branch, date, shiftCode) {
  const rows = await db.systemSetting.findMany({where:{key:{startsWith:REPORT_PREFIX}}});
  return rows.map(parseReport).find(report=>report.reportType==='SHIFT_LEADERSHIP'&&report.branch===branch&&report.workDate===date&&report.shiftCode===shiftCode) || null;
}

function reportDeadline(source, reportConfig, leadership, timezone) {
  const start = source.snapshot.startTime;
  const end = source.snapshot.endTime;
  const time = leadership?.dueTime || end || start;
  if (!time || (!leadership?.dueTime && reportConfig.completionDeadlineMinutes == null)) return null;
  const anchor = leadership?.dueTime ? "SHIFT_DUE_TIME" : end ? "SOURCE_END" : "SOURCE_START";
  const nextDay = start && time < start ? 1 : 0;
  const date = new Date(`${source.workDate}T${time}:00.000Z`);
  date.setUTCDate(date.getUTCDate() + nextDay);
  if (!leadership?.dueTime) date.setUTCMinutes(date.getUTCMinutes() + Number(reportConfig.completionDeadlineMinutes));
  return { localDateTime: date.toISOString().slice(0, 16), timezone, anchor, completionDeadlineMinutes: reportConfig.completionDeadlineMinutes };
}

function normalizeEvidence(item) {
  if (typeof item === "string") return { id: randomUUID(), reference: normalizeText(item, 1000), name: null, type: null };
  if (!item || typeof item !== "object" || Array.isArray(item)) throw serviceError("Evidence entries must be file references", "INVALID_EVIDENCE", 422);
  const reference = normalizeText(item.reference || item.url || item.storageKey, 1000);
  if (!reference) throw serviceError("Evidence requires a stored file reference", "INVALID_EVIDENCE", 422);
  return { id: normalizeText(item.id, 200) || randomUUID(), reference, name: normalizeText(item.name, 300) || null, type: normalizeText(item.type || item.mimeType, 200) || null };
}

function normalizeAttachment(item) {
  return normalizeEvidence(item);
}

function normalizeIssue(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) throw serviceError("Follow-up issues must be objects", "INVALID_FOLLOW_UP", 422);
  const description = normalizeText(item.description || item.text, 3000);
  if (!description) throw serviceError("A follow-up issue description is required", "INVALID_FOLLOW_UP", 422);
  const category = normalizeText(item.category, 80).toUpperCase() || "OTHER";
  if (!["COMPLAINT", "INCIDENT", "CLEANLINESS", "SUPERVISOR", "COVERAGE", "OTHER"].includes(category)) throw serviceError("Select a supported issue category", "INVALID_FOLLOW_UP", 422);
  return { id: normalizeText(item.id, 200) || randomUUID(), category, employeeId: normalizeText(item.employeeId, 200) || null, description, action: normalizeText(item.action, 3000) || null, leaderIntervention: normalizeText(item.leaderIntervention, 3000) || null, resolved: Boolean(item.resolved), resolution: normalizeText(item.resolution, 3000) || null };
}

const SECTION_KEYS = ["staffing", "coverage", "cleanliness", "communication", "handover", "leaderPerformance", "managerComments"];
function normalizeSections(input) {
  return Object.fromEntries(SECTION_KEYS.map(key => [key, normalizeText(input?.[key], 5000) || null]));
}

// Read-only context reuses the published roster, responsibility selections and actual attendance.
async function sourceContext(db, source, reportType, actor) {
  let rosterScope, attendanceScope;
  if (actor?.profile) {
    if (!actor.permissions?.["schedules.view"]) return { schedule: null, employees: [], selectedLeaderId: null, restricted: true };
    rosterScope = await require("../accounts/enforcement").resolveScope(db, actor, "schedules.view");
    if (actor.permissions?.["attendance.view"]) attendanceScope = await require("../accounts/enforcement").resolveScope(db, actor, "attendance.view");
  }
  const { publishedScheduleForBranch, readScheduleState } = require("./schedule-state");
  const schedule = await publishedScheduleForBranch(db, source.workDate, source.branch);
  if (!schedule) return { schedule: null, employees: [], selectedLeaderId: source.snapshot.selectedLeaderId || null };
  const { state } = await readScheduleState(db, schedule.id);
  const roles = require("./day-responsibilities").dayRoles(state, source.workDate);
  const [rows, shifts] = await Promise.all([
    db.opsScheduleAssignment.findMany({ where: { scheduleId: schedule.id, workDate: source.workDate, employee: { active: true, employmentStatus: "ACTIVE" } }, include: { employee: { select: { id: true, name: true, nameEn: true, nameAr: true, operationsTeamLeader: true } } } }),
    db.opsShiftDefinition.findMany ? db.opsShiftDefinition.findMany({ where: { active: true } }) : [],
  ]);
  const shiftMap = new Map(shifts.map(shift => [shift.code, shift]));
  const allowedRows = rows.filter(row => !rosterScope || rosterScope.unrestricted || (rosterScope.branches.includes(source.branch) && rosterScope.employeeIds.includes(row.employeeId)));
  const attendanceIds = allowedRows.filter(row => !actor?.profile || attendanceScope?.unrestricted || (attendanceScope?.branches.includes(source.branch) && attendanceScope?.employeeIds.includes(row.employeeId))).map(row => row.employeeId);
  const attendance = attendanceIds.length && db.opsAttendanceRecord?.findMany ? await db.opsAttendanceRecord.findMany({ where: { employeeId: { in: attendanceIds }, attendanceDay: { workDate: source.workDate } }, include: { attendanceDay: { select: { id: true, status: true, version: true } } }, orderBy: { attendanceDay: { version: "desc" } } }) : [];
  const attendanceMap = new Map();
  for (const row of attendance) if (!attendanceMap.has(row.employeeId)) attendanceMap.set(row.employeeId, row);
  const selectedLeaderId = reportType === "TRIP" ? roles.trips[source.id] || roles.TRIP : reportType === "BIRTHDAY" ? roles.birthdays[source.id] || roles.BIRTHDAY : roles[source.shiftCode];
  const employees = allowedRows.flatMap(row => {
    const shiftCode = row.shiftCode || row.code;
    const shift = shiftMap.get(shiftCode);
    // A mock or older shift definition can omit labels, but never infer working leave codes.
    if (!shift && !["AM", "BW", "PM"].includes(shiftCode)) return [];
    const record = attendanceMap.get(row.employeeId);
    const relevant = reportType === "TRIP" ? shiftCode === "AM" : reportType === "SHIFT_LEADERSHIP" ? shiftCode === source.shiftCode : Boolean(shift && source.snapshot.startTime && source.snapshot.endTime ? overlapMinutes(shift, source.snapshot) > 0 : true);
    return [{ employeeId: row.employeeId, employee: row.employee || { id: row.employeeId, name: row.employeeId }, shiftCode, startTime: shift?.startTime || null, endTime: shift?.endTime || null, relevant, scheduleAssignmentId: row.id || null, attendance: record ? { id: record.id, attendanceDayId: record.attendanceDayId, status: record.status, dayStatus: record.attendanceDay?.status, actualIn: record.actualIn, actualOut: record.actualOut, lateMinutes: record.lateMinutes, earlyLeaveMinutes: record.earlyLeaveMinutes, version: record.version } : null }];
  });
  return { schedule: { id: schedule.id, version: schedule.version, revision: state.revision || 0 }, employees, selectedLeaderId: selectedLeaderId || source.snapshot.selectedLeaderId || null };
}

function suggestedParticipants(context, source, reportType) {
  const relevant = context.employees.filter(row => row.relevant);
  const selected = reportType === "BIRTHDAY" ? relevant.filter(row => row.employeeId === context.selectedLeaderId) : relevant;
  return selected.map(row => ({ employeeId: row.employeeId, shiftCode: row.shiftCode, role: reportType === "BIRTHDAY" ? "BIRTHDAY_HOST" : row.employeeId === context.selectedLeaderId ? reportType === "TRIP" ? "TRIP_TEAM_LEADER" : "SHIFT_TEAM_LEADER" : "STAFF", primaryLeader: reportType !== "BIRTHDAY" && row.employeeId === context.selectedLeaderId, responsibleHost: reportType === "BIRTHDAY", isTeamLeader: reportType !== "BIRTHDAY" && row.employeeId === context.selectedLeaderId, startTime: source.snapshot.startTime || row.startTime, endTime: source.snapshot.endTime || row.endTime }));
}

function normalizeSurvey(survey, template) {
  if (!template) return null;
  const supplied = survey && typeof survey === "object" && !Array.isArray(survey) ? survey : {};
  const questions = new Map((template.questions || []).map((question) => [question.code, question]));
  const seen = new Set();
  const answers = (Array.isArray(supplied.answers) ? supplied.answers : []).map((answer) => {
    const questionCode = String(answer?.questionCode || "").trim().toUpperCase();
    if (seen.has(questionCode)) throw serviceError(`Survey question ${questionCode} is answered more than once`, "DUPLICATE_SURVEY_ANSWER", 422);
    seen.add(questionCode);
    const question = questions.get(questionCode);
    if (!question?.active) throw serviceError(`Survey question ${questionCode} is not active in the report snapshot`, "INVALID_SURVEY_QUESTION", 422);
    const choiceCode = String(answer?.choiceCode || "").trim().toUpperCase();
    const choice = question.choices?.find((item) => item?.active && item.code === choiceCode);
    if (!choice) throw serviceError(`Survey choice ${choiceCode} is not active for ${questionCode}`, "INVALID_SURVEY_CHOICE", 422);
    return { questionCode, choiceCode, questionText: question.text, questionTextAr: question.textAr, choiceLabel: choice.label, choiceLabelAr: choice.labelAr, numericValue: choice.numericValue, comment: normalizeText(answer.comment, 3000) || null, followUpSuggested: Boolean(choice.followUpSuggested) };
  });
  return { answers: supplied.removed ? [] : answers, removed: Boolean(supplied.removed), paperAttachment: supplied.paperAttachment ? normalizeAttachment(supplied.paperAttachment) : null };
}

function normalizeParticipants(items, source) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter(item=>item?.actualParticipant!==false).map((item) => {
    const employeeId = String(item?.employeeId || "").trim();
    if (!employeeId || seen.has(employeeId)) throw serviceError("Report participants require unique employee ids", "INVALID_REPORT_PARTICIPANTS", 422);
    seen.add(employeeId);
    return {
      employeeId,
      role: normalizeText(item.role, 100).toUpperCase() || "STAFF",
      isTeamLeader: Boolean(item.isTeamLeader || item.primaryLeader),
      primaryLeader: Boolean(item.primaryLeader),
      responsibleHost: Boolean(item.responsibleHost),
      backup: Boolean(item.backup),
      deputy: Boolean(item.deputy || item.role === "SHIFT_DEPUTY"),
      shiftCode: normalizeText(item.shiftCode, 80).toUpperCase() || source.shiftCode || null,
      startTime: normalizeText(item.startTime, 5) || source.snapshot.startTime || null,
      endTime: normalizeText(item.endTime, 5) || source.snapshot.endTime || null,
    };
  });
}

function normalizeAdjustments(items, prior, actor) {
  const previous = new Map((prior || []).map((item) => [item.id, item]));
  const seen = new Set();
  return (Array.isArray(items) ? items : []).map((item) => {
    const id = normalizeText(item?.id, 200) || randomUUID();
    if (seen.has(id)) throw serviceError("Adjustment ids must be unique", "DUPLICATE_ADJUSTMENT", 422);
    seen.add(id);
    const existing = previous.get(id);
    if (!String(item?.employeeId || '').trim() || !Number.isFinite(Number(item?.lateMinutes || 0)) || Number(item?.lateMinutes || 0) < 0) throw serviceError('Adjustment requires an employee and non-negative lateness', 'INVALID_ADJUSTMENT', 422);
    return {
      id,
      employeeId: String(item?.employeeId || "").trim(),
      levelCode: normalizeText(item?.levelCode, 80).toUpperCase() || null,
      lateMinutes: Number(item?.lateMinutes || 0),
      absent: Boolean(item?.absent),
      isTeamLeader: Boolean(item?.isTeamLeader),
      evidence: (Array.isArray(item?.evidence) ? item.evidence : []).map(normalizeEvidence),
      comment: normalizeText(item?.comment, 3000) || null,
      status: "PROPOSED",
      proposedBy: existing?.proposedBy || actor.id,
      proposedByEmployeeId: existing?.proposedByEmployeeId || actor.employeeId || null,
      proposedAt: existing?.proposedAt || new Date().toISOString(),
      scoreSnapshot: null,
    };
  });
}

function applicableSteps(template, branch) {
  return (template?.steps || []).filter(step => step.active && branchApplies(step.branches, branch));
}

function stepDefaults(template, branch) {
  return applicableSteps(template, branch).map((step) => ({ code: step.code, completed: false, responsibleEmployeeId: null, evidence: [], comment: null }));
}

function normalizeSteps(items, template, everythingPlanned, branch) {
  const steps = applicableSteps(template, branch);
  const definitions = new Map(steps.map((step) => [step.code, step]));
  const supplied = new Map();
  for (const item of Array.isArray(items) ? items : []) {
    const code = String(item?.code || "").trim().toUpperCase();
    if (!definitions.has(code)) throw serviceError(`Process step ${code} is not part of the snapshotted template`, "INVALID_PROCESS_STEP", 422);
    if (supplied.has(code)) throw serviceError(`Process step ${code} is duplicated`, "DUPLICATE_PROCESS_STEP", 422);
    supplied.set(code, item);
  }
  return steps.map((definition) => {
    const item = supplied.get(definition.code) || {};
    return { code: definition.code, completed: everythingPlanned || Boolean(item.completed), responsibleEmployeeId: String(item.responsibleEmployeeId || "").trim() || null, evidence: (Array.isArray(item.evidence) ? item.evidence : []).map(normalizeEvidence), comment: normalizeText(item.comment, 3000) || null };
  });
}

function valueAtPath(value, path) {
  return String(path || "").split(".").reduce((current, key) => current?.[key], value);
}

async function validateEmployees(db, employeeIds, branch) {
  const ids = [...new Set(employeeIds.filter(Boolean))];
  if (!ids.length) return [];
  const employees = await db.employee.findMany({ where: { id: { in: ids } }, select: { id: true, active: true, employmentStatus: true, branch: true, operationsTeamLeader: true } });
  if (employees.length !== ids.length) throw serviceError("One or more report employees do not exist", "REPORT_EMPLOYEE_NOT_FOUND", 422);
  for (const employee of employees) {
    if (!employee.active || employee.employmentStatus !== "ACTIVE") throw serviceError(`Employee ${employee.id} is not active`, "REPORT_EMPLOYEE_INACTIVE", 422);
    const employeeBranch = String(employee.branch || "").trim().toUpperCase();
    if (employeeBranch && employeeBranch !== branch) throw serviceError(`Employee ${employee.id} belongs to another branch`, "REPORT_EMPLOYEE_BRANCH_MISMATCH", 403);
  }
  return employees;
}

async function normalizeAndValidateDraft(db, report, input, actor, { approving = false } = {}) {
  const snapshot = report.configSnapshot;
  const settings = snapshot.effective.value;
  const reportConfig = settings.reports[report.reportType];
  const draftInput = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const everythingPlanned = Boolean(draftInput.everythingPlanned);
  if (everythingPlanned && !reportConfig.fastEverythingPlannedEnabled) throw serviceError("Everything went as planned is disabled for this report type", "FAST_REPORT_FLOW_DISABLED", 422);
  const draft = {
    everythingPlanned,
    summary: normalizeText(draftInput.summary, 5000) || null,
    steps: normalizeSteps(draftInput.steps, snapshot.processTemplate, everythingPlanned, report.branch),
    survey: normalizeSurvey(draftInput.survey, snapshot.surveyTemplate),
    unresolvedIssues: (Array.isArray(draftInput.unresolvedIssues) ? draftInput.unresolvedIssues : []).map(normalizeIssue),
    participants: normalizeParticipants(draftInput.participants, report.source),
    adjustments: normalizeAdjustments(draftInput.adjustments, report.draft?.adjustments, actor),
    attachments: (Array.isArray(draftInput.attachments) ? draftInput.attachments : []).map(normalizeAttachment),
    staffingOverride: draftInput.staffingOverride ? { reason: normalizeText(draftInput.staffingOverride.reason, 2000) } : null,
    leadershipReplacementReason: normalizeText(draftInput.leadershipReplacementReason, 2000) || null,
    sections: normalizeSections(draftInput.sections),
    guestComments: normalizeText(draftInput.guestComments, 5000) || null,
  };
  if (report.reportType === "BIRTHDAY" && draft.participants.length > Math.min(2, Number(settings.staffing.maximumResponsibleBirthdayHosts || 2))) throw serviceError("A birthday report allows at most two responsible employees", "BIRTHDAY_RESPONSIBLE_LIMIT", 422);
  const participantIdsForDraft = new Set(draft.participants.map(item => item.employeeId));
  if (draft.adjustments.some(item => !participantIdsForDraft.has(item.employeeId))) throw serviceError("Event points must belong to an actual report participant", "ADJUSTMENT_PARTICIPANT_REQUIRED", 422);
  const employeeIds = [...draft.participants.map((item) => item.employeeId), ...draft.adjustments.map((item) => item.employeeId), ...draft.steps.map((item) => item.responsibleEmployeeId).filter(Boolean), ...draft.unresolvedIssues.map(item => item.employeeId).filter(Boolean)];
  const employees = await validateEmployees(db, employeeIds, report.branch);
  const employeeMap = new Map(employees.map((item) => [item.id, item]));
  if (report.reportType === "SHIFT_LEADERSHIP") for (const participant of draft.participants.filter((item) => item.isTeamLeader || item.primaryLeader || item.deputy)) {
    if (!employeeMap.get(participant.employeeId)?.operationsTeamLeader && participant.employeeId !== report.source.snapshot.selectedLeaderId) throw serviceError(`Employee ${participant.employeeId} is not selected for this shift or marked as an Operations Team Leader`, "SHIFT_LEADER_NOT_QUALIFIED", 422);
  }
  if (report.reportType === "SHIFT_LEADERSHIP") {
    if (!settings.shiftLeadership.deputyAllowed && draft.participants.some(item => item.deputy)) throw serviceError("Deputies are disabled for this Shift Leadership report", "SHIFT_DEPUTY_DISABLED", 422);
    const priorLeaders = (report.draft?.participants || []).filter(item => item.primaryLeader).map(item => item.employeeId).sort();
    const nextLeaders = draft.participants.filter(item => item.primaryLeader).map(item => item.employeeId).sort();
    if (priorLeaders.length && JSON.stringify(priorLeaders) !== JSON.stringify(nextLeaders)) {
      const replacement = settings.shiftLeadership.replacement;
      if (!replacement.allowed) throw serviceError("Leader replacement is disabled", "SHIFT_REPLACEMENT_DISABLED", 422);
      assertRole(replacement.roles, actor, "This role cannot replace shift leaders");
      if (replacement.reasonRequired) reasonRequired(draft.leadershipReplacementReason, "leader replacement reason");
    }
  }

  if (draft.adjustments.length) {
    assertRole(settings.permissions.adjustmentProposeRoles, actor, "This role cannot propose score adjustments");
    assertRole(settings.rewards.roles.propose, actor, "This role cannot propose score adjustments");
  }
  const evidenceItems = [...draft.attachments, ...draft.steps.flatMap(step => step.evidence), ...draft.adjustments.flatMap(item => item.evidence), ...(draft.survey?.paperAttachment ? [draft.survey.paperAttachment] : [])];
  for (const item of evidenceItems) {
    if (!item.reference.startsWith('/api/operations/reports/files/')) continue;
    const id = item.reference.slice('/api/operations/reports/files/'.length);
    const stored = await db.systemSetting.findUnique({where:{key:'OPS_REPORT_FILE:'+id}});
    let metadata; try { metadata=JSON.parse(stored?.value || 'null'); } catch {}
    if (!metadata || metadata.reportId !== report.id) throw serviceError('Uploaded evidence does not belong to this report', 'REPORT_EVIDENCE_ACCESS_DENIED', 403);
    item.id=metadata.id; item.name=metadata.name; item.type=metadata.type;
  }
  if (draft.survey?.paperAttachment?.type && !draft.survey.paperAttachment.type.startsWith('image/')) throw serviceError('Paper survey evidence must be an image', 'SURVEY_IMAGE_INVALID', 422);
  if (!approving) return draft;

  for (const requiredField of reportConfig.requiredFields || []) {
    const fieldValue = valueAtPath(draft, requiredField);
    if (fieldValue == null || fieldValue === "" || (Array.isArray(fieldValue) && !fieldValue.length)) throw serviceError(`Required report field ${requiredField} is missing`, "REPORT_REQUIRED_FIELD_MISSING", 422);
  }
  if (reportConfig.attachments.required && draft.attachments.length < reportConfig.attachments.minimumCount) throw serviceError(`At least ${reportConfig.attachments.minimumCount} report attachments are required`, "REPORT_ATTACHMENTS_REQUIRED", 422);
  if (reportConfig.attachments.allowedTypes?.length) for (const attachment of draft.attachments) if (!attachment.type || !reportConfig.attachments.allowedTypes.includes(attachment.type)) throw serviceError(`Attachment type ${attachment.type || "unknown"} is not allowed`, "REPORT_ATTACHMENT_TYPE_INVALID", 422);
  for (const definition of applicableSteps(snapshot.processTemplate, report.branch)) {
    const step = draft.steps.find((item) => item.code === definition.code);
    if (definition.required && !step?.completed) throw serviceError(`Required process step ${definition.code} is incomplete`, "REPORT_STEP_INCOMPLETE", 422);
    if (definition.responsibleEmployeeRequired && !step?.responsibleEmployeeId) throw serviceError(`Process step ${definition.code} requires a responsible employee`, "REPORT_STEP_EMPLOYEE_REQUIRED", 422);
    if (definition.evidenceRequired && !step?.evidence.length) throw serviceError(`Process step ${definition.code} requires evidence`, "REPORT_STEP_EVIDENCE_REQUIRED", 422);
  }
  if (reportConfig.unresolvedIssuesBlockApproval && draft.unresolvedIssues.some((item) => !item.resolved)) throw serviceError("Resolve all report issues before approval", "REPORT_UNRESOLVED_ISSUES", 422);
  if (reportConfig.surveyRequired && !snapshot.surveyTemplate) throw serviceError("This report requires an active snapshotted survey", "REPORT_SURVEY_REQUIRED", 422);
  if (reportConfig.surveyRequired && draft.survey?.removed) throw serviceError("This report requires genuine survey responses before approval", "REPORT_SURVEY_REQUIRED", 422);
  if (snapshot.surveyTemplate) {
    const answers = new Map((draft.survey?.answers || []).map((answer) => [answer.questionCode, answer]));
    for (const question of snapshot.surveyTemplate.questions || []) {
      if (!question.active || !question.required) continue;
      const answer = answers.get(question.code);
      if (!answer) throw serviceError(`Survey question ${question.code} requires an answer`, "SURVEY_ANSWER_REQUIRED", 422);
      const choice = question.choices.find((item) => item.code === answer.choiceCode);
      if (choice.commentRequired && !answer.comment) throw serviceError(`Survey answer ${question.code} requires a comment`, "SURVEY_COMMENT_REQUIRED", 422);
    }
    if ((draft.survey?.answers || []).some((answer) => answer.followUpSuggested) && !draft.unresolvedIssues.length) throw serviceError("A survey answer requires a recorded follow-up issue", "SURVEY_FOLLOW_UP_REQUIRED", 422);
    if (snapshot.surveyTemplate.paperImageRequired && !draft.survey?.paperAttachment) throw serviceError("A paper survey image is required", "SURVEY_IMAGE_REQUIRED", 422);
  }
  const participantIds = draft.participants.map((item) => item.employeeId);
  const scheduleAssignments = participantIds.length && db.opsScheduleAssignment?.findMany
    ? await db.opsScheduleAssignment.findMany({ where: { employeeId: { in: participantIds }, workDate: report.workDate, schedule: { status: "PUBLISHED" } }, select: { employeeId: true, shiftCode: true, code: true } })
    : [];
  const availableEmployeeIds = [...new Set(scheduleAssignments.filter((item) => report.reportType !== "SHIFT_LEADERSHIP" || item.shiftCode === report.shiftCode || item.code === report.shiftCode).map((item) => item.employeeId))];
  const otherReports = (await db.systemSetting.findMany({ where: { key: { startsWith: REPORT_PREFIX } } })).map(parseReport).filter(item => item.id !== report.id && item.branch === report.branch && item.workDate === report.workDate && item.status === "APPROVED");
  const conflictingEmployeeIds = draft.participants.filter(participant => participant.startTime && participant.endTime && otherReports.some(other => other.draft.participants.some(assigned => assigned.employeeId === participant.employeeId && assigned.startTime && assigned.endTime && overlapMinutes(participant, assigned) > settings.staffing.timeOverlap.toleranceMinutes))).map(item => item.employeeId);
  const staffing = validateStaffing(settings, {
    reportType: report.reportType,
    assignments: draft.participants,
    availableEmployeeIds,
    conflictingEmployeeIds,
    override: draft.staffingOverride ? { role: actor.role, reason: draft.staffingOverride.reason } : null,
  });
  if (!staffing.valid) throw serviceError("Report staffing violates the active snapshot", "REPORT_STAFFING_INVALID", 422, staffing);
  if (report.reportType === "SHIFT_LEADERSHIP" && settings.shiftLeadership.teamLeaderRequired) {
    const primaryCount = new Set(draft.participants.filter((item) => item.primaryLeader).map((item) => item.employeeId)).size;
    if (primaryCount !== settings.shiftLeadership.primaryLeaderCount) throw serviceError(`Shift Leadership requires exactly ${settings.shiftLeadership.primaryLeaderCount} primary leader(s)`, "SHIFT_PRIMARY_LEADER_COUNT_INVALID", 422);
  }
  return draft;
}

function contributorEmployeeIds(report) {
  return new Set([report.createdByEmployeeId, report.lastEditedByEmployeeId ?? report.updatedByEmployeeId, ...(report.draft?.adjustments || []).map((item) => item.proposedByEmployeeId)].filter(Boolean));
}

function assertIndependentApproval(report, actor) {
  const lastEditor = report.lastEditedBy || report.updatedBy;
  if (report.reportType === "SHIFT_LEADERSHIP" && report.configSnapshot.effective.value.shiftLeadership.preventSelfApproval && (actor.id === report.createdBy || actor.id === lastEditor)) throw serviceError("Shift Leadership requires an independent reviewer", "INDEPENDENT_REPORT_REVIEW_REQUIRED", 403);
  if (!actor.employeeId) return;
  if (actor.id === report.createdBy || actor.id === lastEditor || contributorEmployeeIds(report).has(actor.employeeId) || report.draft?.participants?.some((item) => item.employeeId === actor.employeeId) || report.draft?.adjustments?.some((item) => item.employeeId === actor.employeeId)) {
    throw serviceError("A linked employee cannot approve a report they created, edited, participated in, or scored in", "INDEPENDENT_REPORT_REVIEW_REQUIRED", 403);
  }
}

async function createAudit(tx, { action, actor, report, reason, before, after }) {
  await tx.auditLog.create({ data: {
    action,
    userId: actor.id,
    summary: `${action.replaceAll("_", " ")} ${report.id}`,
    metadata: JSON.stringify({ reportId: report.id, reportType: report.reportType, branch: report.branch, sourceId: report.source.id, reason: reason || null, before: before || null, after: after || null }),
  } });
}

async function createReport(db, input) {
  try {
    return await db.$transaction(async (tx) => {
      const actor = await loadActor(tx, input.user);
      const reportType = normalizeReportType(input.reportType);
      if(actor.profile)require('../accounts/service').assertCan(actor,'reports.create');
      const source = await findSource(tx, reportType, input.sourceId, input.shiftCode);
      await assertBranchAccess(tx, actor, source.branch);
      if (input.branch && normalizeBranch(input.branch) !== source.branch) throw serviceError("The requested branch does not match the source record", "REPORT_SOURCE_BRANCH_MISMATCH", 409);
      if (input.workDate && validDate(input.workDate) !== source.workDate) throw serviceError("The requested date does not match the source record", "REPORT_SOURCE_DATE_MISMATCH", 409);
      if (reportType === "TRIP") {
        const siblings = await tx.opsDailyTrip.findMany({ where: { branch: source.branch, workDate: source.workDate, startTime: source.snapshot.startTime, name: source.snapshot.name, status: { not: "CANCELLED" } }, select: { id: true } });
        if (siblings.length > 1) throw serviceError("This trip source is ambiguous because duplicate live bookings exist; resolve the duplicate before reporting", "AMBIGUOUS_TRIP_SOURCE", 409, { sourceIds: siblings.map((item) => item.id) });
      }
      const effective = await getEffectivePerformanceSettings(tx, { branch: source.branch, date: source.workDate });
      const settings = effective.value;
      const reportConfig = settings.reports?.[reportType];
      if (!reportConfig?.active || !branchApplies(reportConfig.branches, source.branch)) throw serviceError(`${reportType} reporting is not active for ${source.branch}`, "REPORT_NOT_ACTIVE", 422);
      assertRole(settings.permissions.reportProposeRoles, actor);
      const leadershipRequirement = reportType === "SHIFT_LEADERSHIP" ? resolveShiftLeadershipRequirement(effective, { branch: source.branch, date: source.workDate, shiftCode: source.shiftCode, shiftStartTime: source.snapshot.startTime }) : null;
      if (leadershipRequirement && !leadershipRequirement.required) throw serviceError("Shift Leadership is not required by the configured calendar for this source", "SHIFT_LEADERSHIP_NOT_REQUIRED", 422, leadershipRequirement);
      const processTemplate = selectTemplate(settings.processTemplates, { reportType, branch: source.branch, date: source.workDate, code: input.templateCode, required: true, kind: "process" });
      if (!applicableSteps(processTemplate, source.branch).length) throw serviceError("The process template has no active step for this branch", "PROCESS_TEMPLATE_BRANCH_EMPTY", 422);
      const surveyTemplate = selectTemplate(settings.surveyTemplates, { reportType, branch: source.branch, date: source.workDate, code: input.surveyTemplateCode, required: Boolean(reportConfig.surveyRequired), kind: "survey" });
      const id = reportIdFor(source, reportType);
      if (reportType === 'SHIFT_LEADERSHIP' && await existingShiftReport(tx, source.branch, source.workDate, source.shiftCode)) throw serviceError('A report already exists for this source', 'REPORT_ALREADY_EXISTS', 409);
      const now = input.now || new Date().toISOString();
      const branchSettings = parseJsonObject((await tx.systemSetting.findUnique({ where: { key: "OPS_BRANCH_CONFIG" } }))?.value);
      const deadline = reportDeadline(source, reportConfig, leadershipRequirement, branchSettings.timezone || "Africa/Cairo");
      const baseReport = {
        schemaVersion: SCHEMA_VERSION, id, revision: 1, reportType, branch: source.branch, workDate: source.workDate, shiftCode: source.shiftCode || null, source,
        status: "DRAFT", locked: false, createdAt: now, createdBy: actor.id, createdByEmployeeId: actor.employeeId || null,
        updatedAt: now, updatedBy: actor.id, updatedByEmployeeId: actor.employeeId || null,
        lastEditedBy: actor.id, lastEditedByEmployeeId: actor.employeeId || null,
        approvedAt: null, approvedBy: null, rejectedAt: null, rejectedBy: null, lockedAt: null, lockedBy: null,
        configSnapshot: { capturedAt: now, effective: clone(effective), processTemplate, surveyTemplate, leadershipRequirement, deadline }, draft: null, history: [],
      };
      const rosterContext = await sourceContext(tx, source, reportType, actor);
      source.snapshot.roster = clone(rosterContext);
      const participants = suggestedParticipants(rosterContext, source, reportType);
      baseReport.draft = await normalizeAndValidateDraft(tx, baseReport, input.draft || { steps: stepDefaults(processTemplate, source.branch), participants }, actor);
      await assertReportModuleAccess(tx, actor, baseReport, "create");
      baseReport.history.push({ action: "CREATED", at: now, by: actor.id, reason: normalizeText(input.reason, 2000) || null, revision: 1, template: { code: processTemplate.code, version: processTemplate.version } });
      await tx.systemSetting.create({ data: { key: reportKey(id), value: JSON.stringify(baseReport), description: `${reportType} operational report ${source.id}`, updatedBy: actor.id } });
      await createAudit(tx, { action: "OPS_OPERATIONAL_REPORT_CREATED", actor, report: baseReport, reason: input.reason, before: null, after: { revision: 1, status: "DRAFT" } });
      return { change: { action: "create", id, revision: 1, status: "DRAFT" }, report: clone(baseReport), context: rosterContext };
    });
  } catch (error) {
    if (error?.code === "P2002") throw serviceError("A report already exists for this source", "REPORT_ALREADY_EXISTS", 409);
    throw error;
  }
}

// Called only by explicit day/responsibility writes. Read-only loads never create reports.
async function ensureAutomaticShiftLeadershipReports(db, { user, day, now } = {}) {
  const actor = await loadActor(db, user);
  const branch = await assertBranchAccess(db, actor, day?.branch);
  const date = validDate(day?.workDate);
  if (day?.status === "CLOSED") return { created: [], existing: [], warnings: [] };
  const effective = await getEffectivePerformanceSettings(db, { branch, date });
  const result = { created: [], existing: [], warnings: [] };
  for (const shiftCode of effective.value.shiftLeadership.shiftCodes) {
    const requirement = resolveShiftLeadershipRequirement(effective, { branch, date, shiftCode });
    if (!requirement.shouldCreateReport) continue;
    const existing = await existingShiftReport(db, branch, date, shiftCode);
    if (existing) { result.existing.push(existing.id); continue; }
    const id = reportIdFor({branch,workDate:date,shiftCode}, "SHIFT_LEADERSHIP");
    try {
      let sourceId = day.id;
      if (!sourceId) {
        const schedule = await require('./schedule-state').publishedScheduleForBranch(db,date,branch);
        if (!schedule) throw serviceError('A published schedule for this date and shift is required','SHIFT_SCHEDULE_REQUIRED',422);
        const {state} = await require('./schedule-state').readScheduleState(db,schedule.id);
        if (!require('./day-responsibilities').dayRoles(state,date)[shiftCode]) continue;
        sourceId = `SCHEDULE:${schedule.id}:${date}`;
      }
      const created = await createReport(db, { user, reportType: "SHIFT_LEADERSHIP", sourceId, branch, workDate: date, shiftCode, now, reason: "Automatic draft from the published Shift Leadership calendar" });
      result.created.push(created.report.id);
    } catch (error) {
      if (error.code === "REPORT_ALREADY_EXISTS") result.existing.push(id);
      else result.warnings.push({ shiftCode, code: error.code || "REPORT_CREATION_FAILED", message: error.message });
    }
  }
  return result;
}

async function approveAdjustments(tx, report, draft, actor, now) {
  const settings = report.configSnapshot.effective.value;
  if (draft.adjustments.length) {
    assertRole(settings.permissions.adjustmentApproveRoles, actor, "This role cannot approve score adjustments");
    assertRole(settings.rewards.roles.approve, actor, "This role cannot approve score adjustments");
  }
  const approved = [];
  for (const adjustment of draft.adjustments) {
    if (actor.id === adjustment.proposedBy || (actor.employeeId && (actor.employeeId === adjustment.proposedByEmployeeId || actor.employeeId === adjustment.employeeId))) throw serviceError("An adjustment requires an independent approver who is not its subject or proposer", "INDEPENDENT_ADJUSTMENT_REVIEW_REQUIRED", 403);
    const scoreSnapshot = scoreOperationalEvent(report.configSnapshot.effective, { ...adjustment, branch: report.branch, reportType: report.reportType, approvalStatus: "APPROVED" });
    approved.push({ ...adjustment, status: "APPROVED", approvedBy: actor.id, approvedAt: now, scoreSnapshot });
  }
  return approved;
}

async function mutateReport(db, input) {
  const id = String(input.id || "").trim();
  const expectedRevision = assertRevision(input.expectedRevision);
  const operation = String(input.action || "");
  if (!["saveDraft", "submit", "review", "approve", "reject", "cancel", "reopen", "lock", "upgradeDraftTemplate"].includes(operation)) throw serviceError("Unknown report action", "UNKNOWN_REPORT_ACTION", 400);
  const result = await db.$transaction(async (tx) => {
    const actor = await loadActor(tx, input.user);
    const row = await tx.systemSetting.findUnique({ where: { key: reportKey(id) } });
    if (!row) throw serviceError("Operational report not found", "REPORT_NOT_FOUND", 404);
    const report = parseReport(row);
    report.lastEditedBy ||= report.updatedBy;
    if (report.lastEditedByEmployeeId === undefined) report.lastEditedByEmployeeId = report.updatedByEmployeeId || null;
    await assertBranchAccess(tx, actor, report.branch);
    if(actor.profile){const key=['approve','reject','review'].includes(operation)?'reports.approve':operation==='lock'?'reports.lock':operation==='reopen'||(operation==='cancel'&&report.status==='APPROVED')?'reports.unlock':'reports.edit';require('../accounts/service').assertCan(actor,key);const scope=await require('../accounts/enforcement').resolveScope(tx,actor,key);if(!visibleScopedReport(report,actor,scope))throw serviceError('Report is outside your access scope','REPORT_SCOPE_DENIED',403);}
    await assertReportModuleAccess(tx, actor, report, ["approve", "reject", "review"].includes(operation) ? "approve" : "edit");
    if (report.revision !== expectedRevision) throw serviceError("The report changed in another session; reload and retry", "REPORT_CONFLICT", 409);
    const settings = report.configSnapshot.effective.value;
    const reportConfig = settings.reports[report.reportType];
    const before = { revision: report.revision, status: report.status, locked: report.locked, draft: clone(report.draft), template: report.configSnapshot.processTemplate ? { code: report.configSnapshot.processTemplate.code, version: report.configSnapshot.processTemplate.version } : null };
    const now = input.now || new Date().toISOString();
    if (["submit", "review", "approve"].includes(operation) && !await reportSourceIsAvailable(tx, report)) throw serviceError("The linked booking was cancelled or removed; this report cannot be submitted or approved", "REPORT_SOURCE_NOT_FOUND", 409);
    let auditAction;
    let reason = normalizeText(input.reason, 2000) || null;

    if (operation === "saveDraft") {
      if (report.locked || !["DRAFT", "REOPENED"].includes(report.status)) throw serviceError("Only an unlocked draft or reopened report can be edited", "REPORT_NOT_EDITABLE", 409);
      assertRole(settings.permissions.reportProposeRoles, actor);
      report.draft = await normalizeAndValidateDraft(tx, report, input.draft, actor);
      auditAction = "OPS_OPERATIONAL_REPORT_DRAFT_SAVED";
    } else if (operation === "submit") {
      if (report.locked || !["DRAFT", "REOPENED"].includes(report.status)) throw serviceError("Only an unlocked draft can be submitted", "REPORT_NOT_EDITABLE", 409);
      assertRole(settings.permissions.reportProposeRoles, actor);
      report.draft = await normalizeAndValidateDraft(tx, report, report.draft, actor, { approving: true });
      report.status = "SUBMITTED"; report.submittedAt = now; report.submittedBy = actor.id;
      auditAction = "OPS_OPERATIONAL_REPORT_SUBMITTED";
    } else if (operation === "review") {
      if (report.locked || report.status !== "SUBMITTED") throw serviceError("Submit the report before recording its review", "REPORT_NOT_REVIEWABLE", 409);
      assertRole(settings.permissions.reportApproveRoles, actor);
      if (reportConfig.approvalRole && actor.role !== "ADMIN" && actor.role !== reportConfig.approvalRole) throw serviceError(`This report requires review by ${reportConfig.approvalRole}`, "REPORT_APPROVAL_ROLE_DENIED", 403);
      if (report.reportType === "SHIFT_LEADERSHIP" && actor.role !== "ADMIN" && actor.role !== settings.shiftLeadership.approvalRole) throw serviceError(`Shift Leadership requires review by ${settings.shiftLeadership.approvalRole}`, "REPORT_APPROVAL_ROLE_DENIED", 403);
      assertIndependentApproval(report, actor);
      report.status = "REVIEWED"; report.reviewedAt = now; report.reviewedBy = actor.id;
      auditAction = "OPS_OPERATIONAL_REPORT_REVIEWED";
    } else if (operation === "approve") {
      if (report.locked || !["DRAFT", "REOPENED", "SUBMITTED", "REVIEWED"].includes(report.status)) throw serviceError("Only an unlocked draft, submitted or reviewed report can be approved", "REPORT_NOT_APPROVABLE", 409);
      assertRole(settings.permissions.reportApproveRoles, actor);
      if (reportConfig.approvalRole && actor.role !== "ADMIN" && actor.role !== reportConfig.approvalRole) throw serviceError(`This report requires approval by ${reportConfig.approvalRole}`, "REPORT_APPROVAL_ROLE_DENIED", 403);
      if (report.reportType === "SHIFT_LEADERSHIP" && actor.role !== "ADMIN" && actor.role !== settings.shiftLeadership.approvalRole) throw serviceError(`Shift Leadership requires approval by ${settings.shiftLeadership.approvalRole}`, "REPORT_APPROVAL_ROLE_DENIED", 403);
      assertIndependentApproval(report, actor);
      report.draft = await normalizeAndValidateDraft(tx, report, report.draft, actor, { approving: true });
      report.draft.adjustments = await approveAdjustments(tx, report, report.draft, actor, now);
      report.status = "APPROVED";
      report.approvedAt = now;
      report.approvedBy = actor.id;
      report.rejectedAt = null;
      report.rejectedBy = null;
      report.locked = Boolean(reportConfig.locking.lockOnApproval);
      if (report.locked) { report.lockedAt = now; report.lockedBy = actor.id; }
      auditAction = "OPS_OPERATIONAL_REPORT_APPROVED";
    } else if (operation === "reject") {
      if (report.locked || !["DRAFT", "REOPENED", "SUBMITTED", "REVIEWED"].includes(report.status)) throw serviceError("Only an unlocked active report can be rejected", "REPORT_NOT_REJECTABLE", 409);
      assertRole(settings.permissions.reportApproveRoles, actor);
      if (reportConfig.approvalRole && actor.role !== "ADMIN" && actor.role !== reportConfig.approvalRole) throw serviceError(`This report requires review by ${reportConfig.approvalRole}`, "REPORT_APPROVAL_ROLE_DENIED", 403);
      if (report.reportType === "SHIFT_LEADERSHIP" && actor.role !== "ADMIN" && actor.role !== settings.shiftLeadership.approvalRole) throw serviceError(`Shift Leadership requires review by ${settings.shiftLeadership.approvalRole}`, "REPORT_APPROVAL_ROLE_DENIED", 403);
      reason = reasonRequired(input.reason, "rejection reason");
      assertIndependentApproval(report, actor);
      report.status = "REJECTED";
      report.rejectedAt = now;
      report.rejectedBy = actor.id;
      auditAction = "OPS_OPERATIONAL_REPORT_REJECTED";
    } else if (operation === "cancel") {
      if (report.status === "CANCELLED") throw serviceError("Report is already cancelled", "REPORT_CANCELLED", 409);
      if (report.status === "APPROVED") {
        if (!reportConfig.reopen.allowed) throw serviceError("Approved report reversal is disabled", "REPORT_REOPEN_DENIED", 403);
        assertRole(reportConfig.reopen.roles, actor);
      } else assertRole(settings.permissions.reportProposeRoles, actor);
      reason = reasonRequired(input.reason, "cancellation reason");
      report.status = "CANCELLED"; report.cancelledAt = now; report.cancelledBy = actor.id;
      report.locked = true; report.lockedAt = now; report.lockedBy = actor.id;
      report.draft.adjustments = report.draft.adjustments.map(item => ({ ...item, status: "REVERSED", reversedAt: now, reversedBy: actor.id, reversalReason: reason }));
      auditAction = "OPS_OPERATIONAL_REPORT_CANCELLED";
    } else if (operation === "reopen") {
      if (!reportConfig.reopen.allowed || !reportConfig.reopen.roles.includes(actor.role)) throw serviceError("This role cannot reopen the report", "REPORT_REOPEN_DENIED", 403);
      if (!["APPROVED", "REJECTED", "CANCELLED"].includes(report.status)) throw serviceError("Only an approved, rejected or cancelled report can be reopened", "REPORT_NOT_REOPENABLE", 409);
      if (reportConfig.reopen.reasonRequired) reason = reasonRequired(input.reason, "reopen reason");
      report.status = "REOPENED";
      report.locked = false;
      report.lockedAt = null;
      report.lockedBy = null;
      report.draft.adjustments = report.draft.adjustments.map((item) => ({ ...item, status: "PROPOSED", scoreSnapshot: null, approvedBy: null, approvedAt: null }));
      auditAction = "OPS_OPERATIONAL_REPORT_REOPENED";
    } else if (operation === "lock") {
      if (report.status !== "APPROVED" || report.locked) throw serviceError("Only an unlocked approved report can be locked", "REPORT_NOT_LOCKABLE", 409);
      if (!reportConfig.locking.manualLockAllowed || !reportConfig.locking.roles.includes(actor.role)) throw serviceError("This role cannot lock the report", "REPORT_LOCK_DENIED", 403);
      report.locked = true;
      report.lockedAt = now;
      report.lockedBy = actor.id;
      auditAction = "OPS_OPERATIONAL_REPORT_LOCKED";
    } else {
      if (report.locked || !["DRAFT", "REOPENED"].includes(report.status)) throw serviceError("Only an unlocked draft can upgrade its template", "REPORT_TEMPLATE_UPGRADE_DENIED", 409);
      assertRole(settings.permissions.reportProposeRoles, actor);
      reason = reasonRequired(input.reason, "template-upgrade reason");
      const currentEffective = await getEffectivePerformanceSettings(tx, { branch: report.branch, date: validDate(input.effectiveDate || new Date().toISOString().slice(0, 10)) });
      const template = selectTemplate(currentEffective.value.processTemplates, { reportType: report.reportType, branch: report.branch, date: input.effectiveDate || new Date().toISOString().slice(0, 10), code: input.templateCode || report.configSnapshot.processTemplate?.code, required: true, kind: "process" });
      const priorTemplate = report.configSnapshot.processTemplate;
      if (priorTemplate && template.code === priorTemplate.code && template.version <= priorTemplate.version) throw serviceError("Select a newer process template version", "REPORT_TEMPLATE_NOT_NEWER", 422);
      report.configSnapshot.processTemplate = template;
      if (!applicableSteps(template, report.branch).length) throw serviceError("The process template has no active step for this branch", "PROCESS_TEMPLATE_BRANCH_EMPTY", 422);
      const retainedSteps = report.draft.steps.filter(step => applicableSteps(template, report.branch).some(item => item.code === step.code));
      report.draft.steps = normalizeSteps(retainedSteps, template, false, report.branch);
      auditAction = "OPS_OPERATIONAL_REPORT_TEMPLATE_UPGRADED";
    }

    report.revision += 1;
    if (["saveDraft", "upgradeDraftTemplate"].includes(operation)) { report.lastEditedBy = actor.id; report.lastEditedByEmployeeId = actor.employeeId || null; }
    report.updatedAt = now;
    report.updatedBy = actor.id;
    report.updatedByEmployeeId = actor.employeeId || null;
    report.history.push({ action: operation, at: now, by: actor.id, reason, revision: report.revision, status: report.status, locked: report.locked, template: report.configSnapshot.processTemplate ? { code: report.configSnapshot.processTemplate.code, version: report.configSnapshot.processTemplate.version } : null });
    const updated = await tx.systemSetting.updateMany({ where: { key: row.key, value: row.value }, data: { value: JSON.stringify(report), updatedBy: actor.id } });
    if (updated.count !== 1) throw serviceError("The report changed in another session; reload and retry", "REPORT_CONFLICT", 409);
    await createAudit(tx, { action: auditAction, actor, report, reason, before, after: { revision: report.revision, status: report.status, locked: report.locked, template: report.configSnapshot.processTemplate ? { code: report.configSnapshot.processTemplate.code, version: report.configSnapshot.processTemplate.version } : null } });
    return { change: { action: operation, id: report.id, revision: report.revision, status: report.status, locked: report.locked }, report: clone(report) };
  });
  return result;
}

async function changeOperationalReport(db, input = {}) {
  if (input.action === "create") return createReport(db, input);
  return mutateReport(db, input);
}

async function getOperationalReports(db, { user, id, branch, reportType, status, workDate, sourceId, prepare } = {}) {
  const actor = await loadActor(db, user);
  let scope;if(actor.profile){require('../accounts/service').assertCan(actor,'reports.view');scope=await require('../accounts/enforcement').resolveScope(db,actor,'reports.view');}
  const allowedBranch = await assertBranchAccess(db, actor, branch, { allowAllAdmin: true });
  if (id) {
    const row = await db.systemSetting.findUnique({ where: { key: reportKey(id) } });
    if (!row) throw serviceError("Operational report not found", "REPORT_NOT_FOUND", 404);
    const report = parseReport(row);
    await assertBranchAccess(db, actor, report.branch);
    if(scope&&!visibleScopedReport(report,actor,scope))throw serviceError('Report is outside your access scope','REPORT_SCOPE_DENIED',403);
    await assertReportModuleAccess(db, actor, report, "view");
    return { reports: [clone(report)], context: await sourceContext(db, report.source, report.reportType, actor) };
  }
  const rows = await db.systemSetting.findMany({ where: { key: { startsWith: REPORT_PREFIX } } });
  let reports = rows.map(parseReport);
  if(scope)reports=reports.filter(report=>visibleScopedReport(report,actor,scope));
  if(actor.profile){
    const scopes = new Map();
    for(const type of new Set(reports.map(report=>report.reportType))){
      const key=require('../accounts/registry').reportPermission(type,'view');
      scopes.set(type,key&&actor.permissions[key]?await require('../accounts/enforcement').resolveScope(db,actor,key):null);
    }
    reports=reports.filter(report=>scopes.get(report.reportType)&&visibleScopedReport(report,actor,scopes.get(report.reportType)));
  }
  if (allowedBranch) reports = reports.filter((item) => item.branch === allowedBranch);
  if (reportType) reports = reports.filter((item) => item.reportType === normalizeReportType(reportType));
  if (status) reports = reports.filter((item) => item.status === String(status).toUpperCase());
  if (workDate) reports = reports.filter((item) => item.workDate === validDate(workDate));
  if (sourceId) reports = reports.filter((item) => item.source.id === String(sourceId));
  reports.sort((left, right) => right.workDate.localeCompare(left.workDate) || right.updatedAt.localeCompare(left.updatedAt));
  return { reports: clone(reports) };
}

async function prepareOperationalReport(db, { user, reportType, sourceId, shiftCode, branch } = {}) {
  const actor = await loadActor(db, user);
  const type = normalizeReportType(reportType);
  if (actor.profile) require("../accounts/service").assertCan(actor, "reports.create");
  const source = await findSource(db, type, sourceId, shiftCode);
  await assertBranchAccess(db, actor, branch || source.branch);
  if (branch && normalizeBranch(branch) !== source.branch) throw serviceError("The requested branch does not match the source record", "REPORT_SOURCE_BRANCH_MISMATCH", 409);
  const context = await sourceContext(db, source, type, actor);
  const participants = suggestedParticipants(context, source, type);
  const previewReport = { reportType: type, branch: source.branch, source, createdBy: actor.id, draft: { participants, steps: [], adjustments: [] } };
  await assertReportModuleAccess(db, actor, previewReport, "create");
  const effective = await getEffectivePerformanceSettings(db, { branch: source.branch, date: source.workDate });
  const settings = effective.value, reportConfig = settings.reports?.[type];
  if (!reportConfig?.active || !branchApplies(reportConfig.branches, source.branch)) throw serviceError(`${type} reporting is not active for ${source.branch}`, "REPORT_NOT_ACTIVE", 422);
  assertRole(settings.permissions.reportProposeRoles, actor);
  const scope = { reportType: type, branch: source.branch, date: source.workDate };
  const process = templateChoices(settings.processTemplates, scope, { process: true });
  const survey = templateChoices(settings.surveyTemplates, scope);
  if (!process.length) {
    if (!templateCandidates(settings.processTemplates, scope).length) selectTemplate(settings.processTemplates, { ...scope, required: true, kind: 'process' });
    throw serviceError('The process template has no active step for this branch', 'PROCESS_TEMPLATE_BRANCH_EMPTY', 422);
  }
  if (!survey.length && reportConfig.surveyRequired) selectTemplate(settings.surveyTemplates, { ...scope, required: true, kind: 'survey' });
  return { source, context, suggestedParticipants: participants, templates: { process, survey, surveyRequired: Boolean(reportConfig.surveyRequired), configurationVersion: effective.version } };
}
function visibleScopedReport(report,actor,scope){
 const current=require('../accounts/context').context.getStore();
 if(current&&!current.unrestricted&&!current.branches.includes(report.branch))return false;
 if(scope.unrestricted)return true;
 if(!scope.branches.includes(report.branch))return false;
 if(!['OWN','TEAM'].includes(scope.recordScope))return true;
 const ids=[...(report.draft?.participants||[]).map(p=>p.employeeId),...(report.draft?.adjustments||[]).map(p=>p.employeeId),...(report.draft?.steps||[]).map(p=>p.responsibleEmployeeId).filter(Boolean)];
 if(scope.recordScope==='OWN'&&report.createdBy!==actor.id&&!ids.includes(actor.employeeId))return false;
 return ids.length?ids.every(id=>scope.employeeIds.includes(id)):report.createdBy===actor.id;
}
async function assertReportModuleAccess(db, actor, report, action) {
  if(!actor.profile)return;
  const key=require('../accounts/registry').reportPermission(report.reportType,action);
  if(!key)throw serviceError('Unknown report permission','PERMISSION_DENIED',403);
  require('../accounts/service').assertCan(actor,key);
  const scope=await require('../accounts/enforcement').resolveScope(db,actor,key);
  if(!visibleScopedReport(report,actor,scope))throw serviceError('Report is outside your module access scope','REPORT_SCOPE_DENIED',403);
}

async function getApprovedEventAdjustments(db, { employeeId, branch, startDate, endDate } = {}) {
  const employee = String(employeeId || "").trim();
  if (!employee) throw serviceError("employeeId is required", "EMPLOYEE_ID_REQUIRED", 422);
  const normalizedBranch = branch ? normalizeBranch(branch) : null;
  const start = startDate ? validDate(startDate, "startDate") : "0000-01-01";
  const end = endDate ? validDate(endDate, "endDate") : "9999-12-31";
  if (end < start) throw serviceError("endDate cannot be before startDate", "INVALID_DATE_RANGE", 422);
  const rows = await db.systemSetting.findMany({ where: { key: { startsWith: REPORT_PREFIX } } });
  const result = [];
  for (const row of rows) {
    const report = parseReport(row);
    if (report.status !== "APPROVED" || report.workDate < start || report.workDate > end || (normalizedBranch && report.branch !== normalizedBranch)) continue;
    if (!await reportSourceIsAvailable(db, report)) continue;
    for (const adjustment of report.draft.adjustments || []) {
      if (adjustment.employeeId !== employee || adjustment.status !== "APPROVED" || !adjustment.scoreSnapshot) continue;
      if (!report.draft.participants.some(participant => participant.employeeId === employee && !participant.backup && participant.actualParticipant !== false)) continue;
      // Attendance already has its own daily/monthly source. Keep the approved audit
      // snapshot intact while deriving only the configured performance contribution.
      const performanceOnly = clone(report.configSnapshot.effective.value);
      performanceOnly.rewards.attendanceScoringEnabled = false;
      const score = scoreOperationalEvent(performanceOnly, { reportType: report.reportType, ...adjustment, approvalStatus: "APPROVED", lateMinutes: 0, absent: false });
      result.push({ id: adjustment.id, sourceReportId: report.id, sourceId: report.source.id, reportType: report.reportType, branch: report.branch, workDate: report.workDate, points: Number(score.approvedPoints || 0), scoreSnapshot: clone(adjustment.scoreSnapshot), effectiveScoreSnapshot: score, attendanceExcluded: Number(adjustment.scoreSnapshot.components?.attendancePoints || 0) !== 0, approvedAt: adjustment.approvedAt, approvedBy: adjustment.approvedBy });
    }
  }
  return result.sort((left, right) => left.workDate.localeCompare(right.workDate) || left.id.localeCompare(right.id));
}

async function reportSourceIsAvailable(db, report) {
  if (report.reportType === "TRIP") return Boolean(await db.opsDailyTrip.findFirst({ where: { id: report.source.id, branch: report.branch, workDate: report.workDate, status: { not: "CANCELLED" } }, select: { id: true } }));
  if (report.reportType === "BIRTHDAY") return Boolean(await db.opsDailyEvent.findFirst({ where: { id: report.source.id, branch: report.branch, workDate: report.workDate, eventType: "BIRTHDAY", status: { not: "CANCELLED" } }, select: { id: true } }));
  if (report.source.type === 'OPS_PUBLISHED_SCHEDULE_SHIFT') {
    const id = report.source.snapshot.publishedSchedule?.id;
    const schedule = id && await db.opsSchedule.findUnique({where:{id},select:{id:true}});
    if (!schedule) return false;
    const {state} = await require('./schedule-state').readScheduleState(db,id);
    return state.branch === report.branch;
  }
  return Boolean(await db.opsOperationsDay.findUnique({ where: { id: report.source.id }, select: { id: true } }));
}

async function eventImpactForDaily(db, { employeeId, branch, date, baseScore, maxScore } = {}) {
  const workDate = validDate(date);
  const monthStart = `${workDate.slice(0, 7)}-01`;
  const all = await getApprovedEventAdjustments(db, { employeeId, branch, startDate: monthStart, endDate: workDate });
  if (!all.length) return { baseFinalScore: Number(baseScore), finalScore: Number(baseScore), points: 0, appliedPoints: 0, sourceAdjustments: [], pending: [] };
  const seen = new Set(), applied = [];
  let positive = 0, negative = 0;
  const effective = await getEffectivePerformanceSettings(db, { branch, date: workDate });
  const monthly = effective.value.monthlyAppraisal;
  for (const row of all) {
    const identity = `${row.sourceReportId}:${row.id}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    const caps = row.effectiveScoreSnapshot?.caps || row.scoreSnapshot?.caps || {};
    const positiveCaps = [caps.monthlyPositive, monthly.monthlyPositiveCap].filter(cap => cap != null).map(Number);
    const negativeCaps = [caps.monthlyNegative, monthly.monthlyNegativeCap].filter(cap => cap != null).map(Number);
    let points = monthly.eventAdjustmentTreatment === "IGNORE" ? 0 : Number(row.points);
    if (points > 0) { points = Math.min(points, ...(positiveCaps.length ? positiveCaps.map(cap => Math.max(0, cap - positive)) : [points])); positive += points; }
    else if (points < 0) { points = -Math.min(-points, ...(negativeCaps.length ? negativeCaps.map(cap => Math.max(0, cap - negative)) : [-points])); negative += -points; }
    if (row.workDate === workDate) applied.push({ ...row, uncappedPoints: row.points, points });
  }
  const points = applied.reduce((sum, row) => sum + row.points, 0);
  const baseFinalScore = Number(baseScore);
  const finalScore = Math.min(Number(maxScore), Math.max(0, baseFinalScore + points));
  return { baseFinalScore, finalScore, points, appliedPoints: finalScore - baseFinalScore, sourceAdjustments: applied, pending: [] };
}

async function validateSuitabilitySources(db, employeeId, events) {
  for (const event of events) {
    const sourceType = String(event?.sourceType || "").toUpperCase();
    const sourceId = String(event?.sourceId || "").trim();
    if (!sourceType || !sourceId) throw serviceError("Every suitability event requires a sourceType and sourceId", "SUITABILITY_SOURCE_REQUIRED", 422);
    let found = null;
    if (sourceType === "ATTENDANCE") found = await db.opsAttendanceRecord.findFirst({ where: { id: sourceId, employeeId }, select: { id: true } });
    else if (sourceType === "DAILY_EVALUATION") found = await db.opsEmployeeDailyEvaluation.findFirst({ where: { id: sourceId, employeeId }, select: { id: true } });
    else if (sourceType === "GUEST_FEEDBACK") found = await db.employeeGuestFeedback.findFirst({ where: { id: sourceId, employeeId }, select: { id: true } });
    else if (sourceType === "OPERATIONAL_REPORT") {
      const [reportId, adjustmentId] = sourceId.split("#");
      const row = await db.systemSetting.findUnique({ where: { key: reportKey(reportId) } });
      if (row) {
        const report = parseReport(row);
        found = report.status === "APPROVED" && report.draft.adjustments.some((item) => item.id === adjustmentId && item.employeeId === employeeId && item.status === "APPROVED") ? { id: sourceId } : null;
      }
    } else throw serviceError(`Unsupported suitability source type ${sourceType}`, "SUITABILITY_SOURCE_INVALID", 422);
    if (!found) throw serviceError(`Suitability source ${sourceType}:${sourceId} was not found for the employee`, "SUITABILITY_SOURCE_NOT_FOUND", 422);
  }
}

async function calculateAndStoreSuitability(db, { user, employeeId, branch, profileCode, asOfDate, events, override, reason, idempotencyKey, now = new Date().toISOString() } = {}) {
  const actor = await loadActor(db, user);
  const employee = await db.employee.findUnique({ where: { id: String(employeeId || "") }, select: { id: true, active: true, branch: true } });
  if (!employee?.active) throw serviceError("Active employee not found", "EMPLOYEE_NOT_FOUND", 404);
  if (actor.employeeId === employee.id) throw serviceError("A suitability decision requires an independent manager for the employee being assessed", "INDEPENDENT_SUITABILITY_REVIEW_REQUIRED", 403);
  const employeeBranch = normalizeBranch(employee.branch || await configuredDefaultBranch(db));
  await assertBranchAccess(db, actor, employeeBranch);
  if (branch && normalizeBranch(branch) !== employeeBranch) throw serviceError("Employee branch does not match the request", "EMPLOYEE_BRANCH_MISMATCH", 409);
  const date = validDate(asOfDate || new Date().toISOString().slice(0, 10), "asOfDate");
  let fingerprint=null;
  if (!events) {
    const source=await require('./performance-sources').suitabilityInput(db,{employeeId:employee.id,branch:employeeBranch,profileCode,asOfDate:date});
    events=source.events; fingerprint=source.fingerprint;
  } else await validateSuitabilitySources(db, employee.id, events);
  const effective = await getEffectivePerformanceSettings(db, { branch: employeeBranch, date });
  if (override) assertRole(effective.value.permissions.suitabilityOverrideRoles, actor, "Your role cannot override suitability");
  const calculated = calculateSuitability(effective.value, { profileCode, asOfDate: date, events, override: override ? { ...override, role: actor.role } : null });
  const requestedReason = override ? reasonRequired(reason || override.reason, "override reason") : (normalizeText(reason, 2000) || null);
  const id = idempotencyKey ? createHash("sha256").update(String(idempotencyKey)).digest("hex") : randomUUID();
  let snapshot = { schemaVersion: SCHEMA_VERSION, id, employeeId: employee.id, branch: employeeBranch, asOfDate: date, profileCode: calculated.profileCode, createdAt: now, createdBy: actor.id, reason: requestedReason, fingerprint, effective: clone(effective), result: calculated, events: clone(events) };
  await db.$transaction(async (tx) => {
    const existing = await tx.systemSetting.findUnique({where:{key:`${SUITABILITY_PREFIX}${id}`}});
    if(existing){snapshot=JSON.parse(existing.value);return;}
    await tx.systemSetting.create({ data: { key: `${SUITABILITY_PREFIX}${id}`, value: JSON.stringify(snapshot), description: `Immutable ${calculated.profileCode} suitability snapshot for ${employee.id}`, updatedBy: actor.id } });
    await tx.auditLog.create({ data: { action: "OPS_SUITABILITY_CALCULATED", userId: actor.id, summary: `Calculated ${calculated.profileCode} suitability for ${employee.id}`, metadata: JSON.stringify({ snapshotId: id, employeeId: employee.id, branch: employeeBranch, asOfDate: date, status: calculated.status, score: calculated.score, override: calculated.override, reason: requestedReason }) } });
  });
  return { snapshot: clone(snapshot) };
}

module.exports = {
  REPORT_PREFIX,
  SUITABILITY_PREFIX,
  calculateAndStoreSuitability,
  changeOperationalReport,
  ensureAutomaticShiftLeadershipReports,
  getApprovedEventAdjustments,
  getOperationalReports,
  prepareOperationalReport,
  reportSourceIsAvailable,
  eventImpactForDaily,
  assertReportModuleAccess,
};
