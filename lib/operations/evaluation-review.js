const REVIEWED = new Set(["REVIEWED", "EXCEPTION", "MODIFIED"]);
function evaluationReviewState(day) {
  const rows = day?.evaluations || [];
  const unreviewed = rows.filter(row => !REVIEWED.has(row.status)).length;
  return { reviewed: rows.length - unreviewed, unreviewed, canFinalize: rows.length > 0 && unreviewed === 0, historicalConflict: day?.status === "CLOSED" && unreviewed > 0 };
}
module.exports = { evaluationReviewState };
