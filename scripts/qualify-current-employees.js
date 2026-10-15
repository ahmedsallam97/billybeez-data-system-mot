const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { verifyBundle, inspectDatabase } = require('./pilot-backup');
const { qualifyCurrentEmployees } = require('../lib/operations/current-employee-qualifications');

async function main() {
  const args = process.argv.slice(2), option = name => args[args.indexOf(name) + 1];
  if (!['--database', '--backup', '--restore-check', '--apply'].every(name => args.includes(name))) throw Error('Required: --database FILE --backup BUNDLE --restore-check RESTORED_BUNDLE --apply');
  const database = path.resolve(option('--database')), backup = verifyBundle(path.resolve(option('--backup'))), restored = verifyBundle(path.resolve(option('--restore-check')));
  if (JSON.stringify(backup) !== JSON.stringify(restored)) throw Error('Restoration verification does not match the approved backup');
  const before = inspectDatabase(database);
  if (before.schemaSha256 !== backup.database.schemaSha256 || JSON.stringify(before.tables) !== JSON.stringify(backup.database.tables)) throw Error('Database changed since backup. Create and verify a new backup first.');
  const db = new PrismaClient({ datasources: { db: { url: 'file:' + database.replaceAll('\\', '/') } } });
  try {
    const settings = await db.systemSetting.findUnique({ where: { key: 'ACCOUNT_ACCESS_CONFIG' } });
    const config = JSON.parse(settings?.value || '{}'), profiles = config.accounts || {}, roleId = config.roles?.find(role => role.name === 'Super Admin')?.id;
    const user = await db.user.findFirst({ where: { id: { in: Object.entries(profiles).filter(([, profile]) => profile.roleId === roleId && !profile.archivedAt).map(([id]) => id) }, active: true }, select: { id: true } });
    if (!user) throw Error('An active Super Admin account is required for the audit record');
    const result = await qualifyCurrentEmployees(db, { userId: user.id, backupReference: path.resolve(option('--backup')) });
    const after = inspectDatabase(database);
    for (const [table, value] of Object.entries(before.tables)) if (!['EmployeeQualification', 'SystemSetting', 'AuditLog'].includes(table) && after.tables[table].sha256 !== value.sha256) throw Error('Unexpected change to ' + table);
    console.log(JSON.stringify({ applied: result.applied, employeeCount: result.employeeIds.length, positionCount: result.positionIds.length, qualificationCount: result.qualificationCount, verifiedBackupAndRestore: true, otherOperationalDataPreserved: true, qualificationStillRequiredForNewEmployees: true }));
  } finally { await db.$disconnect(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
