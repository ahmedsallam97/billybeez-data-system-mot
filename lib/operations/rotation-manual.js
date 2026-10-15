const { hourlySlots, rotationPreview } = require('./rotation-service');
const { applicableRules } = require('./rotation-distributions');
const { canAssign, overlaps } = require('./live-daily');
const {physicalConflict,assignmentPosition}=require('./rotation-locations');
const {handoverRules,handoverBreaks,dataExitBlocked,policyConflicts}=require('./rotation-handover');

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
function capacityUsed(assignments, positionId, employeeId, slot) {
  const others = assignments.filter(a => a.employeeId !== employeeId && a.operationalPositionId === positionId && overlaps(a.startTime, a.endTime, slot.startTime, slot.endTime));
  const boundaries = [slot.startTime, ...others.map(a => a.startTime).filter(t => t > slot.startTime && t < slot.endTime)];
  return Math.max(0, ...boundaries.map(t => others.filter(a => a.startTime <= t && a.endTime > t).length));
}
function rotationEditor(data) {
  const preview = rotationPreview(data);
  const slots = hourlySlots(data.shifts, data.team, data.rotationRules?.slotsPerShift);
  const cells = data.team.filter(m => m.working).flatMap(member => slots.filter(s => s.shiftCode === member.shiftCode).map(slot => {
    const existing = data.assignments.filter(a => a.employeeId === member.employeeId && overlaps(a.startTime, a.endTime, slot.startTime, slot.endTime));
    let blocked = !preview.canApply ? 'CLOSED' : !member.employee?.active ? 'INACTIVE' : member.frontAssignment || member.employee?.department==='CASHIER' ? 'FRONT_ASSIGNMENT' : (member.isShiftLeader??member.employee?.operationsTeamLeader) ? 'TEAM_LEADER' : existing.some(a => a.manualLock) ? 'LOCKED' : existing.length > 1 ? 'OVERLAPPING' : '';
    if (!blocked && ((member.expectedStart && slot.startTime < member.expectedStart) || (member.expectedEnd && slot.endTime > member.expectedEnd))) blocked = 'OUTSIDE_SHIFT';
    if (!blocked && member.liveDay && member.attendance && !['PRESENT', 'LATE', 'EARLY_LEAVE', 'UNEXPECTED_PRESENT'].includes(member.attendance.status)) blocked = 'ABSENT';
    if (!blocked && handoverBreaks(data).some(b => b.employeeId === member.employeeId && b.status !== 'CANCELLED' && overlaps(b.startTime, b.endTime, slot.startTime, slot.endTime))) blocked = 'BREAK';
    const rules = handoverRules(data,slot);
    const options = data.positions.filter(p => p.active && p.code !== 'CASHIER').map(position => {
      const row = rules.find(r => r.position.id === position.id), rule = row?.rule;
      const excluded = !row || Boolean(row.excludedReason);
      const policyExcluded=['HANDOVER_BREAK','PM_HANDOVER_SUPPORT_ONLY','AFTER_HANDOVER_ONLY'].includes(row?.excludedReason);
      let reason = policyExcluded ? row.excludedReason : excluded && !data.distributions.allowDisabledManualAssignments ? 'EXCLUDED' : '';
      if (!reason && rule?.roles?.length && !rule.roles.some(role => [member.employee.jobTitle, member.employee.department].includes(role))) reason = 'ROLE';
      if (!reason && !canAssign({ qualifications: data.qualifications, employeeId: member.employeeId, position: { ...position, requiresQualification: position.requiresQualification || rule?.qualificationRequired }, workDate: data.date,positions:data.positions })) reason = 'QUALIFICATION';
      if(!reason&&data.assignments.some(a=>a.employeeId!==member.employeeId&&overlaps(a.startTime,a.endTime,slot.startTime,slot.endTime)&&physicalConflict(position,assignmentPosition(a,data.positions))))reason='COMPONENT_CONFLICT';
      if(!reason&&dataExitBlocked(data,position,data.assignments.filter(a=>a.employeeId!==member.employeeId),slot,rules))reason='DATA_EXIT_COVERAGE';
      if (!reason && capacityUsed(data.assignments, position.id, member.employeeId, slot) >= (rule?.max ?? 1)) reason = 'MAX_COVERAGE';
      return { id: position.id, code: position.code, label: position.label, labelAr: position.labelAr, reason, requiresOverride: excluded };
    });
    options.push({id:'BREAK',code:'BREAK',label:'Break',labelAr:'استراحة',reason:'',requiresOverride:false});
    return { employeeId: member.employeeId, employeeName: member.employee.operationalName || member.employee.name, ...slot, currentPositionId: existing[0]?.operationalPositionId || '', blocked, options };
  }));
  return { sourceFingerprint: preview.sourceFingerprint, canEdit: preview.canApply, allowDisabledManualAssignments: data.distributions.allowDisabledManualAssignments, planVersion: data.plan?.version || 0, cells };
}
function replaceCell(data, body) {
  const editor = rotationEditor(data);
  if (!body.sourceFingerprint || body.sourceFingerprint !== editor.sourceFingerprint) throw fail('The roster or its inputs changed. Reload edit mode and try again / الروستر أو بياناته اتغيرت؛ أعد تحميل وضع التعديل', 409);
  const cell = editor.cells.find(c => c.employeeId === body.employeeId && c.startTime === body.startTime && c.endTime === body.endTime);
  if (!cell || cell.blocked) throw fail('This cell cannot be edited: ' + (cell?.blocked || 'INVALID_SLOT'), 409);
  const positionId = String(body.operationalPositionId || '');
  const option = cell.options.find(o => o.id === positionId);
  if (positionId && (!option || option.reason || (option.requiresOverride && body.allowDisabled !== true))) throw fail('Location cannot be assigned: ' + (option?.reason || 'EXPLICIT_OVERRIDE_REQUIRED'));
  if (!String(body.reason || '').trim()) throw fail('A reason for the manual change is required / اكتب سبب التعديل اليدوي');
  if (positionId === cell.currentPositionId) throw fail('Choose a different location / اختار موقع مختلف');
  const assignments = data.assignments.flatMap(a => {
    if (a.employeeId !== body.employeeId || !overlaps(a.startTime, a.endTime, body.startTime, body.endTime)) return [a];
    // Split long assignments around this hour; other hours and all previous versions stay intact.
    return [a.startTime < body.startTime ? { ...a, endTime: body.startTime } : null, a.endTime > body.endTime ? { ...a, startTime: body.endTime } : null].filter(Boolean);
  });
  if (positionId && positionId!=='BREAK') assignments.push({ employeeId: body.employeeId, operationalPositionId: positionId, startTime: body.startTime, endTime: body.endTime, source: 'MANUAL', manualLock: false, overrideReason: String(body.reason).trim() });
  const breaks=positionId==='BREAK'?[...data.breaks,{employeeId:body.employeeId,startTime:body.startTime,endTime:body.endTime,status:'PLANNED',note:String(body.reason).trim()}]:data.breaks;
  const slot={startTime:body.startTime,endTime:body.endTime,shiftCode:cell.shiftCode};
  // Clearing/changing a core location can invalidate a pre-existing Data/Exit pair.
  if(policyConflicts(data,assignments,handoverBreaks(data),['AM','BW','PM'].map(shiftCode=>({...slot,shiftCode}))).some(c=>c.code==='DATA_EXIT_COVERAGE_CONFLICT'))throw fail('Data and Exit require coverage of all other enabled locations',422);
  return { assignments, breaks, cell, positionId };
}
async function changeRotationCell(db, { user, date, branch, body, loadDaily }) {
  return db.$transaction(async tx => {
    const data = await loadDaily(date, branch, tx);
    const changed = replaceCell(data, body);
    const day = data.day || await tx.opsOperationsDay.create({ data: { workDate: date, branch } });
    const version = (data.day?.rotationPlans?.[0]?.version || 0) + 1;
    await tx.opsRotationPlan.updateMany({ where: { operationsDayId: day.id, status: { in: ['ACTIVE', 'DRAFT'] } }, data: { status: 'SUPERSEDED' } });
    const plan = await tx.opsRotationPlan.create({ data: {
      operationsDayId: day.id, branch, version, status: 'ACTIVE', generatedBy: user.id, generatedAt: new Date(),
      generationSnapshotJson: JSON.stringify({ schemaVersion: 1, action: 'MANUAL_CELL_CHANGE', previousPlanId: data.plan?.id, sourceFingerprint: body.sourceFingerprint, configurationRevision: data.distributions.revision, employeeId: body.employeeId, startTime: body.startTime, endTime: body.endTime, fromPositionId: changed.cell.currentPositionId, toPositionId: changed.positionId, reason: String(body.reason).trim(), allowDisabled: body.allowDisabled === true }),
      assignments: { create: changed.assignments.map(a => ({ employeeId: a.employeeId, operationalPositionId: a.operationalPositionId, startTime: a.startTime, endTime: a.endTime, source: a.source, manualLock: Boolean(a.manualLock), overrideReason: a.overrideReason || null, createdBy: a.createdBy || user.id, updatedBy: user.id })) },
      breaks: { create: changed.breaks.map(b => ({ employeeId: b.employeeId, startTime: b.startTime, endTime: b.endTime, status: b.status, note: b.note, createdBy: b.createdBy, updatedBy: user.id })) },
    }, include: { assignments: true } });
    await tx.auditLog.create({ data: { action: 'OPS_ROTATION_CELL_CHANGED', userId: user.id, summary: `Manual rotation ${branch} ${date} ${changed.cell.employeeName} ${body.startTime}–${body.endTime}`, metadata: JSON.stringify({ branch, date, oldPlanId: data.plan?.id, newPlanId: plan.id, version, employeeId: body.employeeId, startTime: body.startTime, endTime: body.endTime, fromPositionId: changed.cell.currentPositionId, toPositionId: changed.positionId, reason: String(body.reason).trim(), allowDisabled: body.allowDisabled === true, monthlyScheduleUnchanged: true }) } });
    return { plan };
  });
}
module.exports = { rotationEditor, replaceCell, changeRotationCell, capacityUsed };
