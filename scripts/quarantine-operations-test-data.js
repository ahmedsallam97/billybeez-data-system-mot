const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const apply = process.argv.includes('--apply');
const db = new DatabaseSync(path.resolve('prisma/dev.db'), { readOnly: !apply });
const formulas = db.prepare("SELECT * FROM OpsAppraisalFormulaVersion WHERE code='E2E-APPRAISAL-V1'").all();
const candidates = formulas.flatMap(f => db.prepare("SELECT * FROM OpsMonthlyAppraisal WHERE formulaVersionId=? AND year=2099 AND month=10 AND version=1 AND status='DRAFT' AND sourceId IS NULL AND totalScore IN (80,90) AND componentSnapshotJson='{}' AND sourceSnapshotJson='{}' AND calculationExplanationJson='{}' AND reviewedBy IS NULL AND approvedBy IS NULL").all(f.id));
const competitions = db.prepare('SELECT id,year,month,status,formulaVersionId,winnerEmployeeId FROM OpsEotmCompetition ORDER BY year,month').all();
const evaluationDays = db.prepare("SELECT d.*,e.id evaluationId,e.employeeId,e.status evaluationStatus,e.finalScore,e.maxScore FROM OpsDailyEvaluationDay d JOIN OpsEmployeeDailyEvaluation e ON e.dailyEvaluationDayId=d.id WHERE d.status='CLOSED' AND e.status IN ('DEFAULT_FULL','DEFAULT_ZERO') ORDER BY evaluationDate,e.employeeId").all();
const testCriteria = db.prepare("SELECT v.id,v.code,v.active,d.id dayId,d.evaluationDate FROM OpsEvaluationCriteriaVersion v LEFT JOIN OpsDailyEvaluationDay d ON d.criteriaVersionId=v.id WHERE v.code='E2E-DAILY-V1'").all();
const evidence = { applied: apply, candidates, competitions, evaluationDays, testCriteria, note:'Delete only exact unapproved E2E fixture fingerprints. Referenced historical E2E criteria/formulas are retained and deactivated for future selection. Official appraisals and winners remain unchanged.' };
fs.mkdirSync('docs/audit-evidence/repair-batch-1',{recursive:true});
if (apply) {
 db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
 try {
  for (const row of candidates) db.prepare('DELETE FROM OpsMonthlyAppraisal WHERE id=? AND status=\'DRAFT\'').run(row.id);
  // Test setup disabled the authentic criteria; restore future selection, not historical references.
  db.prepare("UPDATE OpsEvaluationCriteriaVersion SET active=0 WHERE code='E2E-DAILY-V1'").run();
  db.prepare("UPDATE OpsEvaluationCriteriaVersion SET active=1 WHERE code='DAILY-V1' AND sourceId IS NOT NULL").run();
  db.prepare("UPDATE OpsEotmFormulaVersion SET active=0 WHERE code='E2E-EOTM-V1'").run();
  for (const f of formulas) {
   const refs=db.prepare('SELECT COUNT(*) n FROM OpsMonthlyAppraisal WHERE formulaVersionId=?').get(f.id).n;
   if (!refs) db.prepare('DELETE FROM OpsAppraisalFormulaVersion WHERE id=?').run(f.id);
   else db.prepare('UPDATE OpsAppraisalFormulaVersion SET active=0 WHERE id=?').run(f.id);
  }
  db.exec('COMMIT');
 } catch(e) { db.exec('ROLLBACK'); throw e; }
}
fs.writeFileSync('docs/audit-evidence/repair-batch-1/test-data-cleanup.json',JSON.stringify(evidence,null,2));
console.log(JSON.stringify({apply,provenDraftFixtures:candidates.length,closedUnreviewed:evaluationDays.length,preservedCompetitions:competitions.length,preservedCriteriaReferences:testCriteria},null,2));
db.close();
