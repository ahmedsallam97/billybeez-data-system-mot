function inYear(value, year, endDate) {
  if (!value || new Date(value).getUTCFullYear() !== Number(year)) return false;
  return !endDate || new Date(value) <= new Date(`${endDate}T23:59:59.999Z`);
}

function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  return clean.length ? Math.round(clean.reduce((sum, value) => sum + value, 0) / clean.length) : null;
}

function annualEmployeeInsights(employee, year, endDate) {
  const attendance = (employee.attendanceRecords || []).filter((item) => inYear(item.attendanceDay?.workDate || item.createdAt, year, endDate));
  const dailyEvaluations = (employee.dailyEvaluations || []).filter((item) => inYear(item.dailyEvaluationDay?.evaluationDate || item.createdAt, year, endDate));
  const endMonth = endDate ? new Date(`${endDate}T00:00:00Z`).getUTCMonth() + 1 : 12;
  const appraisals = (employee.monthlyAppraisals || []).filter((item) => Number(item.year) === Number(year) && Number(item.month) <= endMonth);
  const recognition = (employee.recognition || employee.eotmWins || []).filter((item) => Number(item.year) === Number(year) && (!endDate || Number(item.month || 12) <= new Date(`${endDate}T00:00:00Z`).getUTCMonth() + 1));
  const trainings = (employee.trainingRecords || []).filter((item) => inYear(item.completedDate || item.createdAt, year, endDate));
  const documents = employee.documents || [];
  const appraisalScores = appraisals.map((item) => Number(item.totalScore));
  const dailyScores = dailyEvaluations.map((item) => Number(item.maxScore) ? (Number(item.finalScore) / Number(item.maxScore)) * 100 : null);
  const performanceScore = average(appraisalScores.length ? appraisalScores : dailyScores);
  const late = attendance.filter((item) => item.status === "LATE").length;
  const absences = attendance.filter((item) => item.status === "ABSENT").length;
  const earlyLeave = attendance.filter((item) => item.status === "EARLY_LEAVE").length;
  const present = attendance.filter((item) => ["PRESENT", "LATE", "EARLY_LEAVE", "UNEXPECTED_PRESENT"].includes(item.status)).length;
  const expected = attendance.filter((item) => item.expectedCode && !["OFF", "ANNUAL", "NOT_APPLICABLE"].includes(item.expectedCode)).length;
  const attendanceRate = expected ? Math.round((present / expected) * 100) : null;
  const expiringDocuments = documents.filter((item) => item.expiryStatus === "EXPIRING_SOON" || item.expiryStatus === "EXPIRED");
  const missingQualifications = (employee.operationalPositions || []).filter((position) => position.requiresQualification).filter((position) => !employee.qualifications?.some((item) => item.operationalPositionId === position.id && item.status === "QUALIFIED"));
  const signals = [];
  if (absences) signals.push({ severity: "HIGH", code: "ABSENCE", evidence: `${absences} absence record(s) in ${year}` });
  if (late >= 3) signals.push({ severity: "MEDIUM", code: "LATE", evidence: `${late} late record(s) in ${year}` });
  if (expiringDocuments.length) signals.push({ severity: "HIGH", code: "DOCUMENT", evidence: `${expiringDocuments.length} document(s) expired or expiring soon` });
  if (missingQualifications.length) signals.push({ severity: "MEDIUM", code: "QUALIFICATION", evidence: `${missingQualifications.length} required operational qualification(s) not recorded` });
  if (performanceScore !== null && performanceScore < 70) signals.push({ severity: "HIGH", code: "PERFORMANCE", evidence: `Average performance is ${performanceScore}%` });
  const strengths = [];
  if (performanceScore !== null && performanceScore >= 85) strengths.push(`Performance average ${performanceScore}%`);
  if (attendanceRate !== null && attendanceRate >= 95) strengths.push(`Attendance rate ${attendanceRate}%`);
  if (recognition.length) strengths.push(`${recognition.length} recognition record(s)`);
  if (trainings.length) strengths.push(`${trainings.length} completed training record(s)`);
  const recommendation = signals.some((item) => item.severity === "HIGH") ? "FOLLOW_UP" : missingQualifications.length ? "TRAINING" : performanceScore !== null && performanceScore >= 85 && (attendanceRate === null || attendanceRate >= 95) ? "READY_FOR_MORE" : "STABLE";
  return { year: Number(year), endDate: endDate || null, performanceScore, attendanceRate, present, expected, late, absences, earlyLeave, appraisals, dailyEvaluations, recognition, trainings, expiringDocuments, missingQualifications, signals, strengths, recommendation };
}

module.exports = { annualEmployeeInsights };
