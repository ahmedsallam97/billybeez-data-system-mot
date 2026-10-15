const { parseOptionalDate, validateHrisNumber } = require('./employees');
const { readEmployeeFile } = require('../employee-file-storage');
const { validateFileContent } = require('./employee-uploads');

// A stored, readable contract is the prerequisite. The employee, appointment,
// employment event and audit entry are then committed together, or not at all.
async function convertToHris(db, employeeId, body, userId, readFile = readEmployeeFile) {
  const hrisNumber = validateHrisNumber(body.hrisNumber);
  const effectiveDate = parseOptionalDate(body.effectiveDate, 'HRIS effective date');
  const contractEnd = parseOptionalDate(body.contractEnd, 'Contract end date');
  const contractDocumentId = String(body.contractDocumentId || '');
  const positionName = String(body.jobTitle || '').trim();
  const jobCode = String(body.jobCode || '').trim() || null;
  if (!hrisNumber || !effectiveDate || !positionName) throw new Error('HRIS number, effective date, and job title are required');
  if (contractEnd && contractEnd < effectiveDate) throw new Error('Contract end date cannot be before the effective date');
  const contract = contractDocumentId && await db.employeeDocument.findFirst({ where: { id: contractDocumentId, employeeId, documentType: 'CONTRACT', status: 'ACTIVE' } });
  if (!contract) throw new Error('Store the signed employment contract before converting to HRIS. The PT profile is unchanged.');
  try {
    const bytes = await readFile(contract.storageKey);
    if (bytes.length !== contract.sizeBytes) throw new Error('Incomplete contract');
    validateFileContent(bytes, contract.mimeType);
  } catch { throw new Error('The employment contract could not be read. Retry its upload before converting. The PT profile is unchanged.'); }
  return db.$transaction(async tx => {
    const employee = await tx.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new Error('Employee not found');
    if (employee.employmentType === 'HRIS' || employee.hrisNumber) {
      const audits = await tx.auditLog.findMany({ where: { action: 'OPS_EMPLOYEE_CONVERTED_TO_HRIS', metadata: { contains: employeeId } } });
      const replay = audits.find(row => {
        try { const m = JSON.parse(row.metadata); return m.employeeId === employeeId && m.contractDocumentId === contractDocumentId && m.hrisNumber === hrisNumber && m.effectiveDate === body.effectiveDate && m.positionName === positionName && m.jobCode === jobCode && m.contractEnd === (body.contractEnd || null); } catch { return false; }
      });
      if (replay) return { employee, replayed: true };
      throw new Error('Employee is already assigned to HRIS');
    }
    if (employee.employmentType !== 'PART_TIME') throw new Error('Only a Part-Time employee can use the PT to HRIS conversion');
    if (!await tx.employeeDocument.findFirst({ where: { id: contractDocumentId, employeeId, documentType: 'CONTRACT', status: 'ACTIVE', storageKey: contract.storageKey } })) throw new Error('The required contract is no longer active. Select an active contract and retry.');
    const claimed = await tx.employee.updateMany({ where: { id: employeeId, employmentType: 'PART_TIME', hrisNumber: null }, data: { employmentType: 'HRIS', hrisNumber, localEmployeeCode: null, jobTitle: positionName, joinDate: effectiveDate, employmentStatus: 'ACTIVE', active: true } });
    if (!claimed.count) throw new Error('The employee changed during conversion. Reload and retry.');
    let period = await tx.employmentPeriod.findFirst({ where: { employeeId, startDate: { lte: effectiveDate }, OR: [{ endDate: null }, { endDate: { gte: effectiveDate } }] }, orderBy: { startDate: 'desc' } });
    if (!period) period = await tx.employmentPeriod.create({ data: { employeeId, startDate: employee.hireDate && employee.hireDate <= effectiveDate ? employee.hireDate : effectiveDate } });
    const previousDay = new Date(effectiveDate); previousDay.setUTCDate(previousDay.getUTCDate() - 1);
    await tx.employmentAssignment.updateMany({ where: { employeeId, effectiveFrom: { lt: effectiveDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveDate } }] }, data: { effectiveTo: previousDay } });
    await tx.employmentAssignment.create({ data: { employeeId, employmentPeriodId: period.id, positionName, jobCode, effectiveFrom: effectiveDate, effectiveTo: contractEnd, changeReason: 'PT_TO_HRIS' } });
    const reason = String(body.reason || 'Converted from Part-Time to HRIS').trim();
    const previousCode = employee.localEmployeeCode || employee.employmentType;
    const event = await tx.employeeEmploymentEvent.create({ data: { employeeId, eventType: 'CONVERTED_TO_HRIS', effectiveDate, previousValue: `PART_TIME · ${previousCode}`, newValue: `HRIS · ${hrisNumber}`, reason, createdBy: userId } });
    await tx.auditLog.create({ data: { action: 'OPS_EMPLOYEE_CONVERTED_TO_HRIS', userId, summary: `Converted ${employee.name} to HRIS ${hrisNumber}`, metadata: JSON.stringify({ employeeId, hrisNumber, previousCode, effectiveDate: body.effectiveDate, contractEnd: body.contractEnd || null, positionName, jobCode, contractDocumentId, eventId: event.id, reason }) } });
    return { employee: await tx.employee.findUnique({ where: { id: employeeId } }), event, replayed: false };
  });
}
module.exports = { convertToHris };
