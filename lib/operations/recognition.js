function isFinalizedRecognitionCompetition(competition) {
  return competition?.status === "LOCKED" && Boolean(competition.winnerEmployeeId);
}

function safeJsonObject(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function publicScoreBreakdown(value) {
  const snapshot = safeJsonObject(value);
  const allowed = ["discipline", "appearance", "coreDuties", "facility", "totalGrooming", "totalBonus", "totalPenalty", "finalScore"];
  return Object.fromEntries(allowed.filter((key) => Number.isFinite(Number(snapshot[key]))).map((key) => [key, Number(snapshot[key])]));
}

module.exports = { isFinalizedRecognitionCompetition, publicScoreBreakdown, safeJsonObject };
