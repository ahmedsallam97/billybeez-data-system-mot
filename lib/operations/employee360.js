function documentExpiryStatus(value, now = new Date()) {
  if (!value) return "NO_EXPIRY";
  const days = Math.ceil((new Date(value).getTime() - now.getTime()) / 86400000);
  return days < 0 ? "EXPIRED" : days <= 30 ? "EXPIRING_SOON" : "VALID";
}

const FILE_SECTIONS = {
  STANDARD: ["Overview", "Employment", "Schedule & Attendance"],
  MANAGEMENT: ["Overview", "Employment", "Schedule & Attendance", "Leaves & Balances", "Performance", "Guest Feedback", "Guidance & Penalties", "Incidents", "Training & Qualifications", "Recognition", "Timeline"],
  FULL_RESTRICTED: ["Overview", "Personal", "Employment", "Documents", "Schedule & Attendance", "Leaves & Balances", "Performance", "Guest Feedback", "Guidance & Penalties", "Incidents", "Training & Qualifications", "Recognition", "Timeline", "Files"],
};

function sectionsForFile(mode, customSections = []) {
  return mode === "CUSTOM" ? customSections : (FILE_SECTIONS[mode] || FILE_SECTIONS.STANDARD);
}

function buildEmployeeTimeline(employee) {
  const items = [
    ...(employee.employmentEvents || []).map((x) => ({ type: "EMPLOYMENT", date: x.effectiveDate, title: x.eventType, detail: x.newValue || x.reason || "" })),
    ...(employee.documents || []).map((x) => ({ type: "DOCUMENT", date: x.uploadedAt, title: x.documentType, detail: x.displayName })),
    ...(employee.trainingRecords || []).map((x) => ({ type: "TRAINING", date: x.completedDate || x.createdAt, title: x.name, detail: x.status })),
    ...(employee.qualifications || []).map((x) => ({ type: "QUALIFICATION", date: x.effectiveDate || x.createdAt, title: x.position?.label || "Qualification", detail: x.status })),
    ...(employee.scheduleAssignments || []).map((x) => ({ type: "SCHEDULE", date: x.workDate, title: x.code, detail: x.shiftCode || x.schedule?.status || "" })),
    ...(employee.attendanceRecords || []).map((x) => ({ type: "ATTENDANCE", date: x.attendanceDay?.workDate || x.createdAt, title: x.status, detail: x.expectedCode })),
    ...(employee.dailyEvaluations || []).map((x) => ({ type: "DAILY_EVALUATION", date: x.dailyEvaluationDay?.evaluationDate || x.createdAt, title: `${x.finalScore}/${x.maxScore}`, detail: x.status })),
    ...(employee.guestFeedback || []).map((x) => ({ type: "GUEST_FEEDBACK", date: x.feedbackDate, title: x.category || x.source, detail: `${x.rating ? `${x.rating}/5 · ` : ""}${x.comment}` })),
    ...(employee.guidanceRecords || []).map((x) => ({ type: x.recordType, date: x.recordDate, title: x.title, detail: x.details || x.actionTaken || x.status })),
    ...(employee.incidents || []).map((x) => ({ type: "INCIDENT", date: x.incidentDate, title: `${x.severity} · ${x.title}`, detail: x.description || x.immediateAction || x.status })),
    ...(employee.monthlyAppraisals || []).map((x) => ({ type: "APPRAISAL", date: new Date(Date.UTC(x.year, x.month - 1, 1)), title: `${x.year}/${x.month}`, detail: `${x.totalScore} · ${x.status}` })),
    ...(employee.eotmWins || []).map((x) => ({ type: "RECOGNITION", date: new Date(Date.UTC(x.year, x.month - 1, 1)), title: "Employee of the Month", detail: `${x.year}/${x.month}` })),
    ...(employee.successionCandidates || []).flatMap((x) => (x.reviews || []).map((r) => ({ type: "SUCCESSION", date: r.reviewDate, title: x.targetRole, detail: `${r.previousReadiness} → ${r.newReadiness}` }))),
  ];
  return items.filter((x) => x.date).sort((a, b) => new Date(b.date) - new Date(a.date));
}

module.exports = { documentExpiryStatus, sectionsForFile, buildEmployeeTimeline, FILE_SECTIONS };
