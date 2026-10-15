const { randomUUID, createHash } = require('node:crypto');
const { writeEmployeeFile, readEmployeeFile, deleteEmployeeFile } = require('../employee-file-storage');
const { FILE_EXTENSIONS, MAX_FILE_BYTES, validateFileContent } = require('./employee-uploads');
const { getOperationalReports, assertReportModuleAccess } = require('./operational-report-service');
const PREFIX = 'OPS_REPORT_FILE:';
const error = (message, status = 422) => Object.assign(new Error(message), { status });
async function reportAccess(db, user, reportId, editing = false) {
  const { reports } = await getOperationalReports(db, { user, id: reportId });
  const report = reports[0];
  if (!report) throw error('Report not found', 404);
  if(user.profile){
    const fresh=await require('../accounts/service').loadAccount(db,await db.user.findUnique({where:{id:user.id},include:{employee:true}}));
    require('../accounts/service').assertCan(fresh,editing?'reports.upload':'reports.download');
    await assertReportModuleAccess(db,fresh,report,editing?'upload':'download');
  }
  if (editing && (report.locked || !['DRAFT', 'REOPENED'].includes(report.status))) throw error('Files can only be uploaded to an editable report', 409);
  if (editing && !report.configSnapshot.effective.value.permissions.reportProposeRoles.includes(user.role)) throw error('Your role cannot attach report evidence', 403);
  return report;
}
async function uploadReportFile(db, { user, reportId, file }) {
  await reportAccess(db, user, reportId, true);
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size || file.size > MAX_FILE_BYTES || !FILE_EXTENSIONS[file.type]) throw error('Use a JPG, PNG, WebP, or PDF up to 8 MB');
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length !== file.size || bytes.length > MAX_FILE_BYTES) throw error('Invalid upload size');
  validateFileContent(bytes, file.type);
  const id = randomUUID(), storageKey = `report-evidence/${id}.${FILE_EXTENSIONS[file.type]}`;
  const metadata = { id, reportId, storageKey, name: String(file.name || 'Report evidence').replace(/[\u0000-\u001f\u007f/\\]/g, '_').slice(0, 200), type: file.type, sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), uploadedBy: user.id, uploadedAt: new Date().toISOString() };
  await writeEmployeeFile(storageKey, bytes, file.type);
  try {
    await db.$transaction(async tx => {
      await reportAccess(tx, user, reportId, true);
      await tx.systemSetting.create({ data: { key: PREFIX + id, value: JSON.stringify(metadata), updatedBy: user.id } });
      await tx.auditLog.create({ data: { action: 'OPS_REPORT_FILE_UPLOADED', userId: user.id, summary: 'Uploaded protected report evidence', metadata: JSON.stringify(metadata) } });
    });
  } catch (e) { await deleteEmployeeFile(storageKey); throw e; }
  return { id, reference: `/api/operations/reports/files/${id}`, name: metadata.name, type: file.type };
}
async function downloadReportFile(db, { user, id }) {
  if (!/^[a-f0-9-]{36}$/.test(String(id))) throw error('File not found', 404);
  const row = await db.systemSetting.findUnique({ where: { key: PREFIX + id } });
  if (!row) throw error('File not found', 404);
  const metadata = JSON.parse(row.value);
  await reportAccess(db, user, metadata.reportId);
  const bytes = await readEmployeeFile(metadata.storageKey);
  if (bytes.length !== metadata.sizeBytes || createHash('sha256').update(bytes).digest('hex') !== metadata.sha256) throw error('Stored evidence failed integrity verification', 500);
  return { bytes, metadata };
}
module.exports = { PREFIX, uploadReportFile, downloadReportFile };
