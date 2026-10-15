// Read-only evidence for local Operations rehearsals. Never prints setting values.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const digest = value => createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
function snapshot(databaseFile = path.resolve("prisma/dev.db"), storageRoot = path.resolve("storage/employee-files")) {
  const db = new DatabaseSync(databaseFile, { readOnly: true });
  try {
    const tables = {};
    for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()) {
      const rows = db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all().map(row => JSON.stringify(row)).sort();
      tables[name] = { count: rows.length, sha256: digest(rows) };
    }
    const officialAppraisals = db.prepare("SELECT * FROM OpsMonthlyAppraisal WHERE status='APPROVED' ORDER BY id").all();
    const schedules = db.prepare("SELECT * FROM OpsSchedule WHERE status='PUBLISHED' ORDER BY id").all();
    const competitions = db.prepare("SELECT id,year,month,status,winnerEmployeeId FROM OpsEotmCompetition ORDER BY year,month,id").all();
    const documents = db.prepare("SELECT id,employeeId,storageKey,status FROM EmployeeDocument ORDER BY id").all();
    const files = [];
    function walk(dir) {
      if (!fs.existsSync(dir)) return;
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir,item.name);
        if (item.isDirectory()) walk(full);
        else if (item.isFile()) files.push({ key:path.relative(storageRoot,full).replaceAll("\\","/"), sha256:digest(fs.readFileSync(full)), size:fs.statSync(full).size });
      }
    }
    walk(storageRoot); files.sort((a,b) => a.key.localeCompare(b.key));
    const knownKeys = new Set(documents.map(doc => doc.storageKey)); const fileKeys = new Set(files.map(file => file.key));
    return {
      capturedAt:new Date().toISOString(), databaseFile, integrity:db.prepare("PRAGMA integrity_check").all(), foreignKeys:db.prepare("PRAGMA foreign_key_check").all(), tables,
      employees:db.prepare("SELECT active,employmentType,COUNT(*) count FROM Employee GROUP BY active,employmentType ORDER BY active,employmentType").all(),
      officialAppraisals:{ count:officialAppraisals.length, sha256:digest(officialAppraisals) }, publishedSchedules:{count:schedules.length,sha256:digest(schedules)}, competitions,
      historicalUnreviewed:db.prepare("SELECT d.evaluationDate,COUNT(*) count FROM OpsDailyEvaluationDay d JOIN OpsEmployeeDailyEvaluation e ON e.dailyEvaluationDayId=d.id WHERE d.status='CLOSED' AND e.status IN ('DEFAULT_FULL','DEFAULT_ZERO') GROUP BY d.evaluationDate ORDER BY d.evaluationDate").all(),
      futureAppraisals:db.prepare("SELECT a.id,a.year,a.month,a.status,a.totalScore,f.code formula FROM OpsMonthlyAppraisal a LEFT JOIN OpsAppraisalFormulaVersion f ON f.id=a.formulaVersionId WHERE a.year>=2099 ORDER BY a.id").all(),
      files, orphanFiles:files.filter(file => !knownKeys.has(file.key)), missingActiveFiles:documents.filter(doc => doc.status==='ACTIVE'&&!fileKeys.has(doc.storageKey)),
    };
  } finally { db.close(); }
}

if (require.main === module) {
  const output = path.resolve(process.argv[2] || "docs/stabilization-evidence/database-snapshot.json");
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const evidence = snapshot();
  if (process.argv.includes("--backup")) {
    fs.mkdirSync("backups",{recursive:true});
    const backup = path.resolve("backups",`pre-final-stabilization-${new Date().toISOString().replace(/[:.]/g,"-")}.db`);
    const db = new DatabaseSync(evidence.databaseFile,{readOnly:true});
    try { db.exec(`VACUUM INTO '${backup.replaceAll("'","''")}'`); } finally { db.close(); }
    const verified = new DatabaseSync(backup,{readOnly:true});
    try { evidence.backup = {path:backup,integrity:verified.prepare("PRAGMA integrity_check").all()}; } finally { verified.close(); }
  }
  fs.writeFileSync(output,JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({output,backup:evidence.backup,integrity:evidence.integrity,foreignKeyErrors:evidence.foreignKeys.length,employees:evidence.employees,officialAppraisals:evidence.officialAppraisals,publishedSchedules:evidence.publishedSchedules,competitions:evidence.competitions.length,unreviewed:evidence.historicalUnreviewed,futureAppraisals:evidence.futureAppraisals,orphanFiles:evidence.orphanFiles.length,missingActiveFiles:evidence.missingActiveFiles.length},null,2));
}
module.exports = { snapshot };
