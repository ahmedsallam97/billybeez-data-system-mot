function normalizeManualAppraisalRows(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error("Enter at least one manual appraisal score");
  const seen = new Set();
  return rows.map((row) => {
    const employeeId = String(row?.employeeId || "").trim();
    const totalScore = Number(row?.totalScore);
    if (!employeeId) throw new Error("Every manual score requires an employee");
    if (seen.has(employeeId)) throw new Error("The same employee cannot be entered twice");
    if (!Number.isFinite(totalScore) || totalScore < 0 || totalScore > 10000) throw new Error("Manual score must be between 0 and 10000");
    seen.add(employeeId);
    return { employeeId, totalScore };
  });
}

function manualAppraisalSnapshots({ totalScore, reason, userId, priorAppraisal }) {
  const enteredAt = new Date().toISOString();
  return {
    componentSnapshotJson: JSON.stringify({ manualScore: totalScore }),
    sourceSnapshotJson: JSON.stringify({
      source: "MANUAL_OVERRIDE",
      reason,
      enteredBy: userId,
      enteredAt,
      previousAppraisalId: priorAppraisal?.id || null,
      previousVersion: priorAppraisal?.version || null,
      previousScore: priorAppraisal?.totalScore ?? null,
    }),
    calculationExplanationJson: JSON.stringify({ mode: "MANUAL_OVERRIDE", explanation: reason }),
  };
}

function manualAppraisalMeta(appraisal) {
  try {
    const source = JSON.parse(appraisal?.sourceSnapshotJson || "{}");
    return source.source === "MANUAL_OVERRIDE" ? { entryMode: "MANUAL", manualReason: source.reason || "" } : { entryMode: "CALCULATED", manualReason: "" };
  } catch {
    return { entryMode: "CALCULATED", manualReason: "" };
  }
}

module.exports = { manualAppraisalMeta, manualAppraisalSnapshots, normalizeManualAppraisalRows };
