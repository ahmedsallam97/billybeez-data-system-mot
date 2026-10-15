const KEY = 'OPS_CURRENT_EMPLOYEE_QUALIFICATIONS_V1';

// A one-time, explicitly approved baseline. Never called by employee creation,
// login, rotation generation or application startup.
async function qualifyCurrentEmployees(db, { userId, backupReference }) {
  return db.$transaction(async tx => {
    const existing = await tx.systemSetting.findUnique({ where: { key: KEY } });
    if (existing) return { applied: false, ...JSON.parse(existing.value) };
    const employees = await tx.employee.findMany({ where: { active: true, department: { in: ['OPERATION', 'CASHIER'] } }, select: { id: true } });
    const positions = await tx.opsOperationalPosition.findMany({ where: { active: true, requiresQualification: true }, select: { id: true } });
    let qualificationCount = 0;
    for (const employee of employees) for (const position of positions) {
      const data = { status: 'QUALIFIED', effectiveDate: null, expiryDate: null, notes: 'Existing employee qualification baseline approved by the operator. New employees require individual qualification.' };
      await tx.employeeQualification.upsert({ where: { employeeId_operationalPositionId: { employeeId: employee.id, operationalPositionId: position.id } }, create: { employeeId: employee.id, operationalPositionId: position.id, ...data, createdBy: userId }, update: data });
      qualificationCount++;
    }
    const record = { employeeIds: employees.map(row => row.id), positionIds: positions.map(row => row.id), qualificationCount, seededAt: new Date().toISOString(), backupReference };
    await tx.systemSetting.create({ data: { key: KEY, value: JSON.stringify(record), updatedBy: userId } });
    await tx.auditLog.create({ data: { userId, action: 'OPS_EXISTING_EMPLOYEES_QUALIFIED', summary: `Approved qualification baseline: ${employees.length} existing employees, ${positions.length} positions`, metadata: JSON.stringify(record) } });
    return { applied: true, ...record };
  }, { timeout: 30000 });
}
module.exports = { KEY, qualifyCurrentEmployees };
