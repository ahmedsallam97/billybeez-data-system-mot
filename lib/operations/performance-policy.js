const REPORT_TYPES = new Set(["TRIP", "BIRTHDAY", "SHIFT_LEADERSHIP"]);
const { normalizeSuccessionRole } = require("./succession");

function policyError(message, code = "INVALID_PERFORMANCE_POLICY_INPUT", details) {
  const error = new Error(message);
  error.code = code;
  error.status = 422;
  if (details) error.details = details;
  return error;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function settingsValue(settings) {
  const value = settings?.value || settings?.effective?.value || settings;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw policyError("A performance settings snapshot is required", "PERFORMANCE_SETTINGS_REQUIRED");
  return value;
}

function settingsIdentity(settings) {
  const source = settings?.effective || settings || {};
  return {
    publicationId: source.publicationId || null,
    version: source.version ?? null,
    effectiveFrom: source.effectiveFrom || null,
    scope: clone(source.scope || source.requestedScope || null),
  };
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

function evidenceCount(value) {
  if (Array.isArray(value)) return value.filter(Boolean).length;
  return value ? 1 : 0;
}

function dateOnly(value, label = "date") {
  const text = String(value || "");
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw policyError(`${label} must be a valid YYYY-MM-DD date`, "INVALID_DATE");
  return text;
}

function scoreOperationalEvent(settings, input = {}) {
  const value = settingsValue(settings);
  const rewards = value.rewards;
  if (!rewards || typeof rewards !== "object") throw policyError("Rewards settings are required", "REWARDS_SETTINGS_REQUIRED");
  const reportType = String(input.reportType || "").toUpperCase();
  if (!REPORT_TYPES.has(reportType)) throw policyError("A supported report type is required", "INVALID_REPORT_TYPE");
  if (!value.reports?.[reportType]?.active) throw policyError(`${reportType} reports are inactive`, "REPORT_TYPE_INACTIVE");
  if (input.branch && !value.reports[reportType].branches?.includes("*") && !value.reports[reportType].branches?.includes(String(input.branch).trim().toUpperCase())) throw policyError(`${reportType} reporting is inactive for this branch`, "REPORT_BRANCH_INACTIVE");
  if (!rewards.active) throw policyError("Rewards and penalties are inactive", "REWARDS_INACTIVE");

  const levelCode = String(input.levelCode || "").trim().toUpperCase();
  const level = levelCode ? rewards.performanceLevels?.find((item) => item?.active && item.code === levelCode) : null;
  if (levelCode && !level) throw policyError("The selected performance level is not active", "PERFORMANCE_LEVEL_INACTIVE");
  const attendanceStatus = String(input.attendance?.status || input.attendanceStatus || (input.absent ? "ABSENT" : Number(input.lateMinutes) > 0 ? "LATE" : "")).trim().toUpperCase();
  const lateMinutes = Number(input.attendance?.lateMinutes ?? input.lateMinutes ?? 0);
  if (!Number.isInteger(lateMinutes) || lateMinutes < 0) throw policyError("lateMinutes must be a non-negative whole number", "INVALID_LATE_MINUTES");

  let attendancePoints = 0;
  let attendanceRule = "DISABLED";
  if (rewards.attendanceScoringEnabled) {
    if (attendanceStatus === "ABSENT") {
      attendancePoints = -finite(rewards.absenceDeduction);
      attendanceRule = "ABSENCE";
    } else if (attendanceStatus === "LATE") {
      if (lateMinutes <= 0) throw policyError("Late attendance requires positive lateMinutes", "INVALID_LATE_MINUTES");
      const band = (rewards.latenessBands || []).find((item) => item?.active && lateMinutes >= item.minimumMinutes && lateMinutes <= item.maximumMinutes);
      if (!band) throw policyError("No active lateness band covers the attendance record", "LATE_BAND_NOT_CONFIGURED");
      attendancePoints = finite(band.points);
      attendanceRule = band.code;
    } else if (["PRESENT", "ON_TIME"].includes(attendanceStatus)) {
      attendancePoints = finite(rewards.onTimeBonus);
      attendanceRule = "ON_TIME";
    } else if (attendanceStatus && !["LEAVE", "OFF", "MISSING", "NOT_EXPECTED"].includes(attendanceStatus)) {
      throw policyError("Unsupported attendance status", "INVALID_ATTENDANCE_STATUS");
    }
  }

  const levelPoints = level ? finite(level.points) : 0;
  const combineAttendance = Boolean(rewards.attendanceMayCreateAdditionalEventImpact);
  const unscaledPoints = combineAttendance || !level ? levelPoints + attendancePoints : levelPoints;
  const reportTypeMultiplier = rewards.useReportTypeValues ? finite(rewards.reportTypeValues?.[reportType], 1) : 1;
  const teamLeaderMultiplier = input.isTeamLeader && rewards.teamLeaderValues?.enabled ? finite(rewards.teamLeaderValues.multiplier, 1) : 1;
  const scaledPoints = unscaledPoints * reportTypeMultiplier * teamLeaderMultiplier;
  const eventCappedPoints = clamp(scaledPoints, -finite(rewards.maximumNegativePointsPerEvent), finite(rewards.maximumPositivePointsPerEvent));

  const points = round(eventCappedPoints);

  const requirements = {
    evidenceRequired: Boolean(level?.evidenceRequired),
    commentRequired: Boolean(level?.commentRequired),
    approvalRequired: Boolean(level?.approvalRequired),
  };
  if (requirements.evidenceRequired && evidenceCount(input.evidence) === 0) throw policyError("Evidence is required for this performance level", "EVENT_EVIDENCE_REQUIRED");
  if (requirements.commentRequired && !String(input.comment || "").trim()) throw policyError("A comment is required for this performance level", "EVENT_COMMENT_REQUIRED");

  const approvalStatus = String(input.approvalStatus || "PROPOSED").toUpperCase();
  if (!["PROPOSED", "APPROVED", "REJECTED"].includes(approvalStatus)) throw policyError("Invalid event approval status", "INVALID_EVENT_APPROVAL_STATUS");
  const approved = approvalStatus === "APPROVED" || (approvalStatus === "PROPOSED" && !requirements.approvalRequired);
  const effectiveApprovalStatus = approvalStatus === "REJECTED" ? "REJECTED" : approved ? "APPROVED" : "PROPOSED";
  const approvedPoints = effectiveApprovalStatus === "APPROVED" ? points : 0;
  return {
    settingsVersion: settingsIdentity(settings),
    reportType,
    levelCode: level?.code || null,
    active: true,
    components: { levelPoints, attendancePoints, attendanceRule, combinedAttendance: combineAttendance },
    multipliers: { reportType: reportTypeMultiplier, teamLeader: teamLeaderMultiplier },
    caps: {
      eventPositive: rewards.maximumPositivePointsPerEvent,
      eventNegative: rewards.maximumNegativePointsPerEvent,
      monthlyPositive: rewards.maximumMonthlyEventBonus,
      monthlyNegative: rewards.maximumMonthlyEventPenalty,
    },
    pointsBeforeCaps: round(scaledPoints),
    points,
    proposedPoints: points,
    appliedPoints: approvedPoints,
    approvedPoints,
    approvalStatus,
    effectiveApprovalStatus,
    approved,
    requirements,
  };
}

function dailyPercentage(row) {
  if (Number.isFinite(Number(row?.percentage))) return finite(row.percentage);
  const maximum = finite(row?.maxScore);
  return maximum > 0 ? (finite(row?.score ?? row?.finalScore) / maximum) * 100 : null;
}

function calculateMonthlyAppraisal(settings, input = {}) {
  const value = settingsValue(settings);
  const config = value.monthlyAppraisal;
  if (!config || typeof config !== "object") throw policyError("Monthly appraisal settings are required", "MONTHLY_SETTINGS_REQUIRED");
  if (!config.active) throw policyError("Monthly appraisals are inactive", "MONTHLY_APPRAISAL_INACTIVE");
  const previous = input.previous || null;
  const sourceChanged = Boolean(input.sourceChanged);
  const previousApproved = previous && ["APPROVED", "LOCKED"].includes(String(previous.status || "").toUpperCase());
  const recalcMode = config.recalculation?.onSourceChange || "DRAFT_ONLY";
  const approvedBehavior = config.recalculation?.approvedRecordBehavior || "PRESERVE";
  const mustPreserve = previous && ((!sourceChanged && previousApproved) || (sourceChanged && (recalcMode === "NEVER" || (previousApproved && approvedBehavior === "PRESERVE"))));
  if (mustPreserve) {
    const preserved = clone(previous.result || previous);
    return {
      recalculated: false,
      preservedPrevious: true,
      requiresNewVersion: false,
      persistenceAction: "PRESERVE",
      ...preserved,
      result: preserved,
    };
  }

  const rawDailyRows = Array.isArray(input.dailyEvaluations) ? input.dailyEvaluations : [];
  const seenDaily = new Set();
  const dailyRows = [];
  for (const row of rawDailyRows) {
    const evaluationStatus = String(row?.evaluationStatus || row?.status || "").toUpperCase();
    const dayStatus = String(row?.dayStatus || "CLOSED").toUpperCase();
    if (["DEFAULT_FULL", "DEFAULT_ZERO", ""].includes(evaluationStatus) || dayStatus !== "CLOSED") continue;
    if (!["REVIEWED", "EXCEPTION", "MODIFIED", "CLOSED"].includes(evaluationStatus)) throw policyError(`Unsupported daily evaluation status ${evaluationStatus}`, "INVALID_DAILY_EVALUATION_STATUS");
    const key = String(row.id || row.date || row.evaluationDate || "");
    if (!key || seenDaily.has(key)) throw policyError("Daily evaluations require unique ids or dates", "DUPLICATE_DAILY_EVALUATION");
    seenDaily.add(key);
    const maximum = Number(row.maxScore);
    const score = Number(row.finalScore ?? row.score);
    if (!Number.isFinite(maximum) || maximum <= 0 || !Number.isFinite(score) || score < 0 || score > maximum) throw policyError("Daily evaluation scores must be between zero and maxScore", "INVALID_DAILY_EVALUATION_SCORE");
    dailyRows.push({ ...row, percentage: dailyPercentage(row) });
  }
  let dailyAggregate = 0;
  if (dailyRows.length) {
    if (config.aggregationMethod === "SUM") dailyAggregate = dailyRows.reduce((sum, row) => sum + Number(row.finalScore ?? row.score), 0);
    else if (config.aggregationMethod === "WEIGHTED_AVERAGE") {
      const maximum = dailyRows.reduce((sum, row) => sum + Number(row.maxScore), 0);
      dailyAggregate = maximum ? dailyRows.reduce((sum, row) => sum + Number(row.finalScore ?? row.score), 0) / maximum * 100 : 0;
    } else dailyAggregate = dailyRows.reduce((sum, row) => sum + row.percentage, 0) / dailyRows.length;
  }

  const expectedDays = Math.max(0, finite(input.coverage?.expectedDays ?? input.expectedDays));
  const suppliedActualDays = input.coverage?.actualDays ?? input.actualDays;
  const actualDays = suppliedActualDays == null ? dailyRows.length : Math.max(0, finite(suppliedActualDays));
  const coveragePercentage = expectedDays > 0 ? Math.min(100, (actualDays / expectedDays) * 100) : (actualDays > 0 ? 100 : 0);
  const coverageValue = config.minimumDataCoverage?.unit === "DAYS" ? actualDays : coveragePercentage;
  const coverageMet = coverageValue >= finite(config.minimumDataCoverage?.value);

  const componentScores = { dailyPerformance: dailyAggregate, ...(input.componentScores || {}) };
  for (const [name, score] of Object.entries(componentScores)) {
    const sumOfDailyScores = name === "dailyPerformance" && config.aggregationMethod === "SUM";
    if (!Number.isFinite(Number(score)) || Number(score) < 0 || (!sumOfDailyScores && Number(score) > 100)) throw policyError(`Component ${name} must be from 0 to 100`, "INVALID_APPRAISAL_COMPONENT");
  }
  const formulaWeights = Object.entries(config.formulaParameters || {}).filter(([name]) => name !== "approvedPenaltyDeduction");
  for (const [name, weight] of formulaWeights) if (!Number.isFinite(Number(weight)) || Number(weight) < 0) throw policyError(`Formula weight ${name} must be non-negative`, "INVALID_APPRAISAL_WEIGHT");
  const missingComponents = formulaWeights.filter(([name, weight]) => Number(weight) > 0 && !Object.prototype.hasOwnProperty.call(componentScores, name)).map(([name]) => name);
  const weights = formulaWeights.filter(([name, weight]) => Number(weight) > 0 && Object.prototype.hasOwnProperty.call(componentScores, name));
  let aggregate = dailyAggregate;
  if (weights.length && !missingComponents.length) aggregate = weights.reduce((sum, [name, weight]) => sum + finite(componentScores[name]) * Number(weight), 0) / 100;

  const adjustmentKeys=new Set();
  const approvedAdjustments = (Array.isArray(input.eventAdjustments) ? input.eventAdjustments : []).filter((item) => {
    if(String(item?.effectiveApprovalStatus || item?.approvalStatus || item?.status || '').toUpperCase()!=='APPROVED')return false;
    if(item.id){const key=`${item.sourceReportId||item.reportId||''}:${item.id}`;if(adjustmentKeys.has(key))return false;adjustmentKeys.add(key);}return true;
  });
  const positiveAdjustment = approvedAdjustments.reduce((sum, item) => sum + Math.max(0, finite(item.approvedPoints ?? item.points)), 0);
  const negativeAdjustment = approvedAdjustments.reduce((sum, item) => sum + Math.min(0, finite(item.approvedPoints ?? item.points)), 0);
  const positiveCaps = [value.rewards?.maximumMonthlyEventBonus, config.monthlyPositiveCap].filter((item) => item != null).map(Number);
  const negativeCaps = [value.rewards?.maximumMonthlyEventPenalty, config.monthlyNegativeCap].filter((item) => item != null).map(Number);
  const cappedPositive = positiveCaps.length ? Math.min(positiveAdjustment, ...positiveCaps) : positiveAdjustment;
  const cappedNegative = negativeCaps.length ? -Math.min(Math.abs(negativeAdjustment), ...negativeCaps) : negativeAdjustment;
  const rawAdjustment = positiveAdjustment + negativeAdjustment;
  const adjustment = config.eventAdjustmentTreatment === "IGNORE" ? 0 : cappedPositive + cappedNegative;
  const finalScore = round(clamp(aggregate + adjustment, finite(config.finalScoreMinimum), finite(config.finalScoreMaximum)));
  const band = (config.performanceBands || []).find((item) => item?.active && finalScore >= item.minimum && finalScore <= item.maximum) || null;
  const formulaComplete = missingComponents.length === 0;
  const provisional = !coverageMet || !formulaComplete;
  const coverage = { expectedDays, actualDays, percentage: round(coveragePercentage), required: clone(config.minimumDataCoverage), met: coverageMet };
  const components = {
    dailyAggregate: round(dailyAggregate),
    componentScores: clone(componentScores),
    aggregateBeforeAdjustments: round(aggregate),
    rawEventAdjustment: round(rawAdjustment),
    eventAdjustment: round(adjustment),
    sourceCounts: { dailyEvaluations: dailyRows.length, approvedEventAdjustments: approvedAdjustments.length },
  };
  const sourceSnapshot = {
    dailyEvaluations: dailyRows.map((row) => ({ id: row.id || null, date: row.date || row.evaluationDate || null, finalScore: finite(row.finalScore ?? row.score), maxScore: finite(row.maxScore), percentage: round(row.percentage), weight: finite(row.weight, 1) })),
    eventAdjustments: approvedAdjustments.map((item) => ({ id: item.id || null, sourceReportId: item.sourceReportId || item.reportId || null, points: round(finite(item.approvedPoints ?? item.points)) })),
  };
  const status = coverageMet && formulaComplete ? "CALCULATED" : (config.workflow?.provisionalAllowed && formulaComplete ? "PROVISIONAL" : "INSUFFICIENT_DATA");
  const result = {
    settingsVersion: settingsIdentity(settings),
    active: Boolean(config.active),
    eligible: formulaComplete && (coverageMet || Boolean(config.workflow?.provisionalAllowed)),
    provisional,
    status,
    coverage,
    components,
    totalScore: finalScore,
    band: band ? { code: band.code, label: band.label } : null,
    formulaVersionId: config.formulaVersionId || null,
    sourceSnapshot,
    explanation: {
      aggregationMethod: config.aggregationMethod,
      eventAdjustmentTreatment: config.eventAdjustmentTreatment,
      finalScoreRange: [config.finalScoreMinimum, config.finalScoreMaximum],
      positiveCap: config.monthlyPositiveCap,
      negativeCap: config.monthlyNegativeCap,
      workflow: clone(config.workflow),
      missingComponents,
    },
  };
  const createVersion = Boolean(previousApproved && sourceChanged && approvedBehavior === "CREATE_NEW_VERSION");
  return { recalculated: true, preservedPrevious: false, requiresNewVersion: createVersion, persistenceAction: createVersion ? "CREATE_VERSION" : previous ? "REPLACE_DRAFT" : "CREATE", ...result, result: clone(result) };
}

function eventDate(value) {
  return String(value?.date || value?.workDate || value?.eventDate || "");
}

function metricAverage(events, name) {
  let numerator = 0;
  let denominator = 0;
  for (const event of events) {
    const metric = Number(event?.metrics?.[name] ?? event?.[name]);
    if (!Number.isFinite(metric)) continue;
    const weight = Math.max(0, finite(event.decayWeight, 1));
    numerator += metric * weight;
    denominator += weight;
  }
  return denominator ? numerator / denominator : null;
}

function calculateSuitability(settings, input = {}) {
  const value = settingsValue(settings);
  const profileCode = String(input.profileCode || "").trim().toUpperCase();
  const profile = value.suitability?.find((item) => item?.code === profileCode);
  if (!profile) throw policyError("A valid suitability profile is required", "SUITABILITY_PROFILE_REQUIRED");
  if (!profile.active) throw policyError("The suitability profile is inactive", "SUITABILITY_PROFILE_INACTIVE");
  const asOfDate = dateOnly(input.asOfDate, "asOfDate");
  const asOfTime = Date.parse(`${asOfDate}T00:00:00.000Z`);
  const seenEvents = new Set();
  const validatedEvents = (Array.isArray(input.events) ? input.events : []).map((event) => {
    const id = String(event?.id || event?.sourceId || "").trim();
    if (!id || seenEvents.has(id)) throw policyError("Suitability events require unique stable ids", "INVALID_SUITABILITY_EVENT_ID");
    seenEvents.add(id);
    const date = dateOnly(eventDate(event), "event date");
    const metrics = { ...(event.metrics || {}) };
    for (const name of ["punctuality", "performance", "guestFeedback", "processReliability", "leadershipProblemResolution"]) {
      const metric = metrics[name] ?? event[name];
      if (metric == null) continue;
      if (!Number.isFinite(Number(metric)) || Number(metric) < 0 || Number(metric) > 100) throw policyError(`Suitability metric ${name} must be from 0 to 100`, "INVALID_SUITABILITY_METRIC");
      metrics[name] = Number(metric);
    }
    return { ...clone(event), id, date, metrics };
  });
  const recent = validatedEvents.filter((event) => {
    const time = Date.parse(`${event.date}T00:00:00.000Z`);
    const ageDays = (asOfTime - time) / 86400000;
    return ageDays >= 0 && ageDays < profile.rollingWindowDays;
  }).sort((left, right) => right.date.localeCompare(left.date) || left.id.localeCompare(right.id)).slice(0, profile.maximumRecentEvents).map((event) => {
    const ageDays = Math.max(0, (asOfTime - Date.parse(`${eventDate(event)}T00:00:00.000Z`)) / 86400000);
    let decayWeight = 1;
    if (profile.decay?.mode === "EXPONENTIAL") decayWeight = 0.5 ** (ageDays / profile.decay.halfLifeDays);
    if (profile.decay?.mode === "LINEAR") decayWeight = Math.max(0, 1 - ageDays / (profile.decay.halfLifeDays * 2));
    return { ...clone(event), decayWeight };
  });

  const metricNames = ["punctuality", "performance", "guestFeedback", "processReliability", "leadershipProblemResolution"];
  const metrics = Object.fromEntries(metricNames.map((name) => [name, metricAverage(recent, name)]));
  const requiredMetrics = metricNames.filter((name) => finite(profile.weights?.[name]) > 0);
  const missingMetrics = requiredMetrics.filter((name) => metrics[name] == null);
  const score = missingMetrics.length ? null : (profile.weightingMode === "POINTS"
    ? requiredMetrics.reduce((sum, name) => sum + (metrics[name] / 100) * finite(profile.weights[name]), 0)
    : requiredMetrics.reduce((sum, name) => sum + metrics[name] * finite(profile.weights[name]), 0) / 100);
  const triggeredRules = new Set((input.triggeredRules || recent.flatMap((event) => event.triggeredRules || [])).map((item) => String(item)));
  const forceNotRecommended = (profile.notRecommendedRules || []).some((rule) => triggeredRules.has(rule));
  const forceCaution = (profile.cautionRules || []).some((rule) => triggeredRules.has(rule));
  let threshold = score == null ? null : (profile.thresholds || []).find((item) => item?.active && score >= item.minimum && score <= item.maximum) || null;
  if (score != null && !threshold) throw policyError("Suitability thresholds do not classify the calculated score", "SUITABILITY_THRESHOLD_GAP");
  if (forceNotRecommended) threshold = { status: "NOT_RECOMMENDED", minimum: null, maximum: null };
  else if (forceCaution && threshold?.status === "RECOMMENDED") threshold = { status: "CAUTION", minimum: null, maximum: null };
  let status = forceNotRecommended ? "NOT_RECOMMENDED" : forceCaution ? "CAUTION" : (recent.length < profile.minimumEvents || score == null ? "INSUFFICIENT_DATA" : threshold.status);

  let override = null;
  if (input.override) {
    if (!profile.override?.allowed) throw policyError("Suitability overrides are disabled", "SUITABILITY_OVERRIDE_DISABLED");
    const role = String(input.override.role || "").toUpperCase();
    if (!profile.override.roles?.includes(role)) throw policyError("This role cannot override suitability", "SUITABILITY_OVERRIDE_DENIED");
    const reason = String(input.override.reason || "").trim();
    if (profile.override.reasonRequired && reason.length < 5) throw policyError("A clear suitability override reason is required", "SUITABILITY_OVERRIDE_REASON_REQUIRED");
    const requestedStatus = String(input.override.status || "").trim().toUpperCase();
    const allowedStatuses = new Set((profile.thresholds || []).filter((item) => item?.active).map((item) => item.status));
    if (!allowedStatuses.has(requestedStatus)) throw policyError("Override status must be an active configured recommendation status", "SUITABILITY_OVERRIDE_STATUS_REQUIRED");
    const computedStatus = status;
    status = requestedStatus;
    override = { status, computedStatus, reason, role };
  }
  return {
    settingsVersion: settingsIdentity(settings),
    profileCode,
    asOfDate,
    status,
    score: score == null ? null : round(score),
    metrics: Object.fromEntries(Object.entries(metrics).map(([name, metric]) => [name, metric == null ? null : round(metric)])),
    eventCount: recent.length,
    minimumEvents: profile.minimumEvents,
    missingMetrics,
    threshold: threshold ? clone(threshold) : null,
    triggeredRules: [...triggeredRules],
    override,
    profileSnapshot: clone(profile),
    sourceEvents: recent,
  };
}

function timeMinutes(value, label) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || ""));
  if (!match) throw policyError(`${label} must be HH:mm`, "INVALID_TIME");
  return Number(match[1]) * 60 + Number(match[2]);
}

function overlapMinutes(left, right) {
  const leftStart = timeMinutes(left.startTime, "startTime");
  let leftEnd = timeMinutes(left.endTime, "endTime");
  const rightStart = timeMinutes(right.startTime, "startTime");
  let rightEnd = timeMinutes(right.endTime, "endTime");
  if (leftEnd <= leftStart) leftEnd += 1440;
  if (rightEnd <= rightStart) rightEnd += 1440;
  return Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart));
}

function validateStaffing(settings, input = {}) {
  const value = settingsValue(settings);
  const config = value.staffing;
  if (!config || typeof config !== "object") throw policyError("Staffing settings are required", "STAFFING_SETTINGS_REQUIRED");
  if (!config.active) throw policyError("Staffing rules are inactive", "STAFFING_RULES_INACTIVE");
  const reportType = String(input.reportType || "").toUpperCase();
  if (!REPORT_TYPES.has(reportType)) throw policyError("A supported report type is required", "INVALID_REPORT_TYPE");
  const assignments = Array.isArray(input.assignments) ? input.assignments : [];
  const seenAssignments = new Set();
  for (const item of assignments) {
    const employeeId = String(item?.employeeId || "").trim();
    if (!employeeId) throw policyError("Every staffing assignment requires an employeeId", "INVALID_STAFFING_ASSIGNMENT");
    const key = `${employeeId}:${String(item.role || "")}:${String(item.startTime || "")}:${String(item.endTime || "")}`;
    if (seenAssignments.has(key)) throw policyError("Duplicate staffing assignments are not allowed", "DUPLICATE_STAFFING_ASSIGNMENT");
    seenAssignments.add(key);
    if (item.startTime || item.endTime) { timeMinutes(item.startTime, "startTime"); timeMinutes(item.endTime, "endTime"); }
  }
  const errors = [];
  const warnings = [];
  const responsibleHosts = new Set(assignments.filter((item) => item?.responsibleHost || String(item?.role || "").toUpperCase() === "BIRTHDAY_HOST").map((item) => item.employeeId));
  const primaryLeaders = new Set(assignments.filter((item) => item?.primaryLeader || String(item?.role || "").toUpperCase() === "TRIP_TEAM_LEADER").map((item) => item.employeeId));
  if (reportType === "BIRTHDAY" && responsibleHosts.size > config.maximumResponsibleBirthdayHosts) errors.push(`Birthday Hosts exceed the configured maximum of ${config.maximumResponsibleBirthdayHosts}`);
  if (reportType === "TRIP" && primaryLeaders.size !== config.primaryTripTeamLeaders) errors.push(`Trip Team Leaders must equal the configured count of ${config.primaryTripTeamLeaders}`);
  if (!config.backupStaffAllowed && assignments.some((item) => item?.backup)) errors.push("Backup staff are disabled");

  if (config.requireAvailability && !Array.isArray(input.availableEmployeeIds)) throw policyError("Availability evidence is required", "STAFFING_AVAILABILITY_REQUIRED");
  const available = new Set(input.availableEmployeeIds || []);
  if (config.requireAvailability) assignments.forEach((item) => { if (!available.has(item.employeeId)) errors.push(`Employee ${item.employeeId} is not available`); });
  const externalConflicts = new Set(input.conflictingEmployeeIds || []);
  if (!config.timeOverlap?.allowed) assignments.forEach((item) => { if (externalConflicts.has(item.employeeId)) errors.push(`Employee ${item.employeeId} has an overlapping operational assignment`); });
  if (config.conflictWarningsEnabled) assignments.forEach((item) => { if (externalConflicts.has(item.employeeId)) warnings.push(`Employee ${item.employeeId} has a staffing conflict`); });
  if (!config.timeOverlap?.allowed) {
    for (let left = 0; left < assignments.length; left += 1) for (let right = left + 1; right < assignments.length; right += 1) {
      if (assignments[left]?.employeeId && assignments[left].employeeId === assignments[right]?.employeeId && overlapMinutes(assignments[left], assignments[right]) > finite(config.timeOverlap?.toleranceMinutes)) errors.push(`Employee ${assignments[left].employeeId} has overlapping assignments`);
    }
  }
  if (reportType === "TRIP") for (const item of assignments) if (item.shiftCode && !(config.suggestedTripShiftCodes || []).includes(item.shiftCode)) warnings.push(`Shift ${item.shiftCode} is outside the configured Trip suggestions`);

  let overridden = false;
  if (errors.length && input.override) {
    const role = String(input.override.role || "").toUpperCase();
    const reason = String(input.override.reason || "").trim();
    if (!config.override?.allowed || !config.override.roles?.includes(role)) throw policyError("This role cannot override staffing conflicts", "STAFFING_OVERRIDE_DENIED");
    if (config.override.reasonRequired && reason.length < 5) throw policyError("A clear staffing override reason is required", "STAFFING_OVERRIDE_REASON_REQUIRED");
    overridden = true;
  }
  return { settingsVersion: settingsIdentity(settings), valid: errors.length === 0 || overridden, overridden, errors, warnings, configSnapshot: clone(config) };
}

function resolveShiftLeadershipRequirement(settings, input = {}) {
  const value = settingsValue(settings);
  const config = value.shiftLeadership;
  if (!config || typeof config !== "object") throw policyError("Shift Leadership settings are required", "SHIFT_LEADERSHIP_SETTINGS_REQUIRED");
  const date = dateOnly(input.date, "date");
  const branch = String(input.branch || "").trim().toUpperCase();
  const shiftCode = String(input.shiftCode || "").trim().toUpperCase();
  if (!branch) throw policyError("branch is required", "SHIFT_BRANCH_REQUIRED");
  if (!shiftCode) throw policyError("shiftCode is required", "SHIFT_CODE_REQUIRED");
  const branchEnabled = config.enabledBranches?.includes("*") || config.enabledBranches?.includes(branch);
  const shiftEnabled = !shiftCode || config.shiftCodes?.includes(shiftCode);
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  const reasons = [];
  if (config.requiredWeekdays?.includes(weekday)) reasons.push("WEEKDAY");
  if (config.selectedDates?.includes(date)) reasons.push("SELECTED_DATE");
  for (const period of config.busyPeriods || []) if (date >= period.startDate && date <= period.endDate) reasons.push(`BUSY_PERIOD:${period.label}`);
  for (const period of config.holidays || []) if (date >= period.startDate && date <= period.endDate) reasons.push(`HOLIDAY:${period.label}`);
  const applies = Boolean(config.active && branchEnabled && shiftEnabled && reasons.length);
  let requiredReadyTime = null;
  if (applies && input.shiftStartTime) {
    const minutes = (timeMinutes(input.shiftStartTime, "shiftStartTime") - config.requiredReadyTimeOffsetMinutes + 1440) % 1440;
    requiredReadyTime = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }
  return {
    settingsVersion: settingsIdentity(settings),
    applies,
    required: applies,
    leaderRequired: Boolean(applies && config.teamLeaderRequired),
    requiredPrimaryLeaders: applies && config.teamLeaderRequired ? config.primaryLeaderCount : 0,
    active: Boolean(config.active),
    branchEnabled,
    shiftEnabled,
    branch,
    date,
    shiftCode,
    reasons,
    deputyAllowed: Boolean(config.deputyAllowed),
    requiredReadyTimeOffsetMinutes: config.requiredReadyTimeOffsetMinutes,
    requiredReadyTime,
    approvalRole: config.approvalRole,
    replacement: clone(config.replacement),
    preventSelfApproval: Boolean(config.preventSelfApproval),
    assignmentQualifiesAsSuccessionEvidence: Boolean(config.assignmentQualifiesAsSuccessionEvidence),
    automaticReportCreation: Boolean(applies && config.automaticReportCreation),
    shouldCreateReport: Boolean(applies && config.automaticReportCreation),
    dueTime: config.reportDueTime,
    configSnapshot: clone(config),
  };
}

function resolveSuccessionPath(settings, input = {}) {
  const value = settingsValue(settings);
  const normalizeRole = (role) => normalizeSuccessionRole(role).toLocaleLowerCase("en");
  const fromRole = normalizeRole(input.fromRole);
  const toRole = normalizeRole(input.toRole);
  const matches = (value.succession?.paths || []).filter((item) => normalizeRole(item?.fromRole) === fromRole && normalizeRole(item?.toRole) === toRole);
  if (!matches.length) throw policyError("The requested succession path is not configured", "SUCCESSION_PATH_NOT_CONFIGURED");
  if (matches.length > 1) throw policyError("The requested succession path is configured more than once", "SUCCESSION_PATH_AMBIGUOUS");
  const path = matches[0];
  if (!path.enabled) throw policyError("The requested succession path is disabled", "SUCCESSION_PATH_DISABLED");
  const groups = new Set(path.cumulativeTemplateGroups || []);
  const normalizedGroups = new Set([...groups].flatMap((group) => [String(group), String(group).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "")]));
  const competencies = (value.succession.competencies || []).filter((item) => item?.active && (normalizedGroups.has(item.templateCode) || normalizedGroups.has(item.group))).sort((left, right) => left.order - right.order || String(left.code).localeCompare(String(right.code)));
  return {
    settingsVersion: settingsIdentity(settings),
    path: clone(path),
    cumulativeTemplateGroups: [...groups],
    competencies: clone(competencies),
    readinessLevels: clone((value.succession.readinessLevels || []).filter((item) => item?.active).sort((left, right) => left.sortOrder - right.sortOrder)),
    reviewFrequencyOptions: clone((value.succession.reviewFrequencyOptions || []).filter((item) => item?.active)),
    developmentActionTypes: clone((value.succession.developmentActionTypes || []).filter((item) => item?.active)),
    developmentStatuses: clone((value.succession.developmentStatuses || []).filter((item) => item?.active)),
  };
}

module.exports = {
  calculateMonthlyAppraisal,
  calculateSuitability,
  resolveShiftLeadershipRequirement,
  overlapMinutes,
  resolveSuccessionPath,
  scoreOperationalEvent,
  validateStaffing,
};
