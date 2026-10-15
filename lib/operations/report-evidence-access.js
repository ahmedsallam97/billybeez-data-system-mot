// Report-derived scores belong to the evaluation that uses them. Detailed
// source evidence still belongs to its independently authorized report module.
async function authorizedReportIds(db, user, { branch } = {}) {
  if (!user.permissions?.['reports.view']) return new Set();
  const { getOperationalReports } = require('./operational-report-service');
  try {
    const { reports } = await getOperationalReports(db, { user, branch });
    return new Set(reports.map(report => report.id));
  } catch (error) {
    // An evaluation may be readable in a branch where report details are not.
    if (error.status === 403) return new Set();
    throw error;
  }
}

function reportIdentity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (value.sourceReportId || value.reportId || value.sourceSnapshot?.reportId) return value.sourceReportId || value.reportId || value.sourceSnapshot.reportId;
  if (['OPERATIONAL_REPORT', 'EVENT_SURVEY'].includes(value.sourceType)) return value.sourceId;
  if (value.reportType && value.sourceId && value.approvedBy && value.id) return value.id;
  return null;
}

function filterReportEvidence(value, visibleReportIds) {
  if (Array.isArray(value)) return value.map(item => filterReportEvidence(item, visibleReportIds)).filter(item => item !== undefined);
  if (!value || typeof value !== 'object') return value;
  const reportId = reportIdentity(value);
  if (reportId && !visibleReportIds.has(reportId)) return undefined;
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'sourceSnapshotJson' && typeof item === 'string') {
      try { result[key] = JSON.stringify(filterReportEvidence(JSON.parse(item), visibleReportIds)); }
      catch { result[key] = item; }
      continue;
    }
    const filtered = filterReportEvidence(item, visibleReportIds);
    if (filtered !== undefined) result[key] = filtered;
  }
  if (Array.isArray(value.sources) && Object.hasOwn(value, 'score') && Object.hasOwn(value, 'mode')) {
    result.sourceRecordCount = value.sources.length;
    result.restrictedSourceCount = value.sources.length - result.sources.length;
  }
  return result;
}

async function redactReportEvidence(db, user, payload, options) {
  return filterReportEvidence(payload, await authorizedReportIds(db, user, options));
}

module.exports = { authorizedReportIds, filterReportEvidence, redactReportEvidence };
