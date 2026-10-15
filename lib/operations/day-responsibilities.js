const { ScheduleInputError } = require('./schedule-input');
const { scheduleBranch, readScheduleState, writeScheduleState, assertScheduleBranch, publishedScheduleForBranch } = require('./schedule-state');
const { hasPermission } = require('../accounts/registry');
const { loadAccount, assertCan } = require('../accounts/service');
const { resolveScope } = require('../accounts/enforcement');

function dayRoles(state, date) {
  const saved = state?.dayResponsibilities?.[date] || {};
  return { AM: saved.AM || '', PM: saved.PM || '', TRIP:saved.TRIP||'', BIRTHDAY:saved.BIRTHDAY||'', trips: { ...(saved.trips || {}) }, birthdays: { ...(saved.birthdays || {}) } };
}
function applyDayRoles(rows, roles) {
  return rows.map(row => ({ ...row, isShiftLeader: roles[row.shiftCode || row.code] === (row.employeeId || row.employee?.id) }));
}
async function loadResponsibilities(db, user, input) {
  const date = String(input.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(date).toISOString().slice(0, 10) !== date) throw new ScheduleInputError('Invalid date');
  const branch = await scheduleBranch(db, user, input.branch);
  const schedule = input.scheduleId ? await db.opsSchedule.findUnique({ where: { id: String(input.scheduleId) } }) : await publishedScheduleForBranch(db, date, branch);
  if (!schedule || !['DRAFT', 'PUBLISHED'].includes(schedule.status) || date < schedule.periodStart || date > schedule.periodEnd) throw new ScheduleInputError('No available schedule covers this date');
  const previous = await assertScheduleBranch(db, schedule, branch);
  const [rows, trips, birthdays, day] = await Promise.all([
    db.opsScheduleAssignment.findMany({ where: { scheduleId: schedule.id, workDate: date, code: { in: ['AM', 'BW', 'PM'] }, employee: { active: true } }, include: { employee: { select: { id: true, name: true, nameEn: true } } }, orderBy: { employee: { name: 'asc' } } }),
    db.opsDailyTrip.findMany({ where: { branch, workDate: date, status: { not: 'CANCELLED' } }, select: { id: true, name: true, startTime: true, endTime: true }, orderBy: { startTime: 'asc' } }),
    db.opsDailyEvent.findMany({ where: { branch, workDate: date, status: { not: 'CANCELLED' } }, select: { id: true, name: true, childName: true, startTime: true, endTime: true }, orderBy: { startTime: 'asc' } }),
    db.opsOperationsDay.findFirst({ where: { branch, workDate: date }, orderBy: { version: 'desc' } }),
  ]);
  return { date, branch, schedule, previous, rows, trips, birthdays, closed: day?.status === 'CLOSED', values: dayRoles(previous.state, date), canAssign: hasPermission(user, 'rotations.assign') && day?.status !== 'CLOSED' };
}
function publicResponsibilities(data) {
  return { success: true, date: data.date, branch: data.branch, scheduleId: data.schedule.id, revision: data.previous.state.revision, values: data.values, employees: data.rows.map(row => ({ ...row.employee, shiftCode: row.shiftCode || row.code })), trips: data.trips, birthdays: data.birthdays, canAssign: data.canAssign, closed: data.closed };
}
function validateRoles(data, values = {}) {
  const result = { AM: '', PM: '', TRIP:'', BIRTHDAY:'', trips: {}, birthdays: {} };
  for (const shift of ['AM', 'PM']) {
    const id = String(values[shift] || '');
    if (id && !data.rows.some(row => row.employeeId === id && (row.shiftCode || row.code) === shift)) throw new ScheduleInputError(`Select an active scheduled ${shift} employee`);
    result[shift] = id;
  }
  for(const key of ['TRIP','BIRTHDAY']){
    const id=String(values[key]||'');
    if(id&&!data.rows.some(row=>row.employeeId===id))throw new ScheduleInputError('Select an active employee working on this date');
    result[key]=id;
  }
  for (const key of ['trips', 'birthdays']) {
    if (values[key] != null && (typeof values[key] !== 'object' || Array.isArray(values[key]))) throw new ScheduleInputError('Invalid responsibility selections');
    const sourceIds = new Set(data[key].map(row => row.id));
    for (const [sourceId, employeeId] of Object.entries(values[key] || {})) {
      if (!sourceIds.has(sourceId)) throw new ScheduleInputError('Event does not belong to this branch and date');
      const id = String(employeeId || '');
      if (id && !data.rows.some(row => row.employeeId === id)) throw new ScheduleInputError('Select an active employee working on this date');
      if (id) result[key][sourceId] = id;
    }
  }
  return result;
}
async function saveResponsibilities(db, user, input) {
  if (!hasPermission(user, 'rotations.assign')) throw new ScheduleInputError('Permission denied', 403);
  const saved = await db.$transaction(async tx => {
    const rawUser = await tx.user.findUnique({ where: { id: user.id } });
    if (!rawUser?.active) throw new ScheduleInputError('Login required', 401);
    const fresh = await loadAccount(tx, rawUser);
    if (fresh.profile.sessionVersion !== user.profile.sessionVersion) throw new ScheduleInputError('Login required', 401);
    assertCan(fresh, 'rotations.assign');
    const scope = await resolveScope(tx, fresh, 'rotations.assign');
    if (!scope.unrestricted && ['OWN', 'TEAM'].includes(scope.recordScope)) throw new ScheduleInputError('This shared action requires branch scope', 403);
    const data = await loadResponsibilities(tx, fresh, input);
    if (!scope.unrestricted && !scope.branches.includes(data.branch)) throw new ScheduleInputError('Branch access denied', 403);
    if (data.closed) throw new ScheduleInputError('Reopen the operations day before changing responsibilities', 409);
    if (Number(input.expectedRevision) !== data.previous.state.revision) throw new ScheduleInputError('Schedule changed. Reload before retrying.', 409);
    const values = validateRoles(data, input.values);
    if (!scope.unrestricted && [values.AM, values.PM, values.TRIP,values.BIRTHDAY,...Object.values(values.trips), ...Object.values(values.birthdays)].filter(Boolean).some(id => !scope.employeeIds.includes(id))) throw new ScheduleInputError('Employee access denied', 403);
    const state = await writeScheduleState(tx, data.schedule.id, data.previous, { ...data.previous.state, dayResponsibilities: { ...(data.previous.state.dayResponsibilities || {}), [data.date]: values } }, user.id);
    await tx.auditLog.create({ data: { userId: user.id, action: 'OPS_DAY_RESPONSIBILITIES_UPDATED', summary: `Updated daily responsibilities for ${data.date}`, metadata: JSON.stringify({ scheduleId: data.schedule.id, branch: data.branch, date: data.date, before: data.values, after: values }) } });
    return publicResponsibilities({ ...data, values, previous: { state } });
  });
  // Use the same deterministic source key as an explicit Operations-day save.
  // A responsibility write is not rolled back by a missing report permission/template.
  if (saved.values.AM || saved.values.PM) {
    const day = await db.opsOperationsDay.findFirst({ where: { branch: saved.branch, workDate: saved.date }, orderBy: { version: "desc" } });
    {
      try { saved.leadershipReports = await require("./operational-report-service").ensureAutomaticShiftLeadershipReports(db, { user, day: day || {branch:saved.branch,workDate:saved.date,status:'SCHEDULED'} }); }
      catch (error) { saved.leadershipReports = { created: [], existing: [], warnings: [{ code: error.code || "REPORT_CREATION_FAILED", message: error.message }] }; }
    }
  }
  return saved;
}
module.exports = { dayRoles, applyDayRoles, loadResponsibilities, publicResponsibilities, validateRoles, saveResponsibilities };
