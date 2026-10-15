const { NORMALIZATION_DEFAULTS } = require('./performance-source-config');
const REPORT_TYPES = Object.freeze(["TRIP", "BIRTHDAY", "SHIFT_LEADERSHIP"]);
const SUITABILITY_PROFILES = Object.freeze(["TRIP_STAFF", "TRIP_TEAM_LEADER", "BIRTHDAY_HOST", "SHIFT_TEAM_LEADER"]);
const MANAGEMENT_ROLES = Object.freeze(["ADMIN", "MANAGER"]);
const READINESS_LEVELS = Object.freeze(["NOT_ASSESSED", "DEVELOPING", "READY_SOON", "READY_NOW", "ON_HOLD", "PROMOTED", "COMPLETED", "CLOSED"]);
const DEVELOPMENT_STATUSES = Object.freeze(["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "NOT_REQUIRED"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const CODE = /^[A-Z0-9][A-Z0-9_-]{0,79}$/;

function isValidIsoDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeCriteria(criteria) {
  const source = Array.isArray(criteria) ? criteria : Array.isArray(criteria?.criteria) ? criteria.criteria : [];
  return source.map((item, index) => ({
    code: String(item?.code || "").trim().toUpperCase(),
    label: String(item?.label || item?.code || "").trim(),
    labelAr: String(item?.labelAr || "").trim(),
    category: String(item?.category || "DAILY_EVALUATION").trim(),
    maxScore: Number(item?.maxScore || 0),
    active: item?.active !== false,
    sortOrder: Number.isInteger(Number(item?.sortOrder)) ? Number(item.sortOrder) : (index + 1) * 10,
    reasons: (Array.isArray(item?.reasons) ? item.reasons : []).map((reason, reasonIndex) => ({
      code: String(reason?.code || "").trim().toUpperCase(),
      label: String(reason?.label || reason?.code || "").trim(),
      labelAr: String(reason?.labelAr || "").trim(),
      active: reason?.active !== false,
      sortOrder: Number.isInteger(Number(reason?.sortOrder)) ? Number(reason.sortOrder) : (reasonIndex + 1) * 10,
    })),
  }));
}

function reportDefaults(fastFlow) {
  return {
    active: true,
    branches: ["*"],
    required: false,
    completionDeadlineMinutes: null,
    approvalRole: "MANAGER",
    requiredFields: [],
    attachments: { required: false, minimumCount: 0, allowedTypes: [] },
    fastEverythingPlannedEnabled: fastFlow,
    surveyRequired: false,
    unresolvedIssuesBlockApproval: true,
    reopen: { allowed: true, reasonRequired: true, roles: ["ADMIN", "MANAGER"] },
    locking: { lockOnApproval: true, manualLockAllowed: true, roles: ["ADMIN", "MANAGER"] },
  };
}

function suitabilityProfile(code, label) {
  return {
    code,
    label,
    active: true,
    sourceNormalization: { ...NORMALIZATION_DEFAULTS },
    rollingWindowDays: 365,
    maximumRecentEvents: 50,
    minimumEvents: 1,
    weightingMode: "PERCENTAGE",
    weights: {
      punctuality: 50,
      performance: 50,
      guestFeedback: 0,
      processReliability: 0,
      leadershipProblemResolution: 0,
    },
    thresholds: [
      { status: "RECOMMENDED", minimum: 85, maximum: 100, active: true },
      { status: "CAUTION", minimum: 70, maximum: 84.999, active: true },
      { status: "NOT_RECOMMENDED", minimum: 0, maximum: 69.999, active: true },
    ],
    cautionRules: [],
    notRecommendedRules: [],
    decay: { mode: "NONE", halfLifeDays: null },
    override: { allowed: true, reasonRequired: true, roles: ["ADMIN", "MANAGER"] },
    recalculation: { trigger: "ON_SOURCE_CHANGE", schedule: null },
  };
}

function defaultPerformanceSettings({ criteria, evaluationRules, appraisalFormula } = {}) {
  const rules = {
    defaultScoreMode: "FULL_UNREVIEWED",
    penaltyDeduction: 25,
    guidanceDeduction: 15,
    requireReasonForDeduction: true,
    requireReviewBeforeClose: true,
    ...parseObject(evaluationRules),
  };
  const formulaConfig = parseObject(appraisalFormula?.configJson ?? appraisalFormula?.config ?? appraisalFormula);
  // Older formulas also store descriptive metadata beside their numeric weights.
  // Keep that metadata in sourceFormula; only weights belong in the editor.
  const formulaParameters = formulaConfig.formulaParameters != null
    ? parseObject(formulaConfig.formulaParameters)
    : Object.fromEntries(Object.entries(formulaConfig).filter(([name, value]) =>
      typeof value === "number" && !["finalScoreMinimum", "finalScoreMaximum"].includes(name)));

  return {
    reports: {
      TRIP: reportDefaults(true),
      BIRTHDAY: reportDefaults(true),
      SHIFT_LEADERSHIP: reportDefaults(false),
    },
    processTemplates: REPORT_TYPES.map((reportType) => ({
      code: `${reportType}_PROCESS`, reportType, version: 1, active: true,
      label: `${reportType.replaceAll("_", " ")} report`, labelAr: reportType === "TRIP" ? "تقرير الرحلة" : reportType === "BIRTHDAY" ? "تقرير عيد الميلاد" : "تقرير قيادة الشيفت",
      instructions: "Editable initial checklist. Configure the approved operational steps before requiring this report.",
      instructionsAr: "قائمة أولية قابلة للتعديل. اضبط خطوات التشغيل المعتمدة قبل جعل التقرير إلزامياً.",
      branches: ["*"], effectiveFrom: "2000-01-01", effectiveTo: null,
      steps: [{ code: "REPORT_REVIEW", order: 1, active: true, label: "Review the report summary", labelAr: "مراجعة ملخص التقرير", instructions: "", instructionsAr: "", required: true, responsibleEmployeeRequired: false, evidenceRequired: false, branches: ["*"] }],
    })),
    surveyTemplates: [
      {
        code: "TRIP_SURVEY",
        reportType: "TRIP",
        version: 1,
        active: false,
        label: "Trip survey",
        labelAr: "استبيان الرحلة",
        paperImageRequired: false,
        branches: ["*"],
        effectiveFrom: "2000-01-01",
        effectiveTo: null,
        questions: [],
      },
      {
        code: "BIRTHDAY_SURVEY",
        reportType: "BIRTHDAY",
        version: 1,
        active: false,
        label: "Birthday survey",
        labelAr: "استبيان عيد الميلاد",
        paperImageRequired: false,
        branches: ["*"],
        effectiveFrom: "2000-01-01",
        effectiveTo: null,
        questions: [],
      },
    ],
    rewards: {
      active: true,
      attendanceScoringEnabled: false,
      onTimeBonus: 0,
      latenessBands: [
        {code:'LATE_1_15',active:true,minimumMinutes:1,maximumMinutes:15,points:-1},
        {code:'LATE_16_30',active:true,minimumMinutes:16,maximumMinutes:30,points:-2},
        {code:'LATE_31_PLUS',active:true,minimumMinutes:31,maximumMinutes:10080,points:-3},
      ],
      absenceDeduction: 0,
      performanceLevels: [3, 2, 1, 0, -1, -2, -3].map((points) => ({
        code: points > 0 ? `PLUS_${points}` : points < 0 ? `MINUS_${Math.abs(points)}` : "ZERO",
        label: points > 0 ? `+${points}` : String(points),
        labelAr: points > 0 ? `+${points}` : String(points),
        points,
        active: true,
        evidenceRequired: false,
        commentRequired: points !== 0,
        approvalRequired: points !== 0,
      })),
      maximumPositivePointsPerEvent: 3,
      maximumNegativePointsPerEvent: 3,
      maximumMonthlyEventBonus: null,
      maximumMonthlyEventPenalty: null,
      useReportTypeValues: false,
      reportTypeValues: { TRIP: 1, BIRTHDAY: 1, SHIFT_LEADERSHIP: 1 },
      teamLeaderValues: { enabled: false, multiplier: 1 },
      attendanceMayCreateAdditionalEventImpact: false,
      roles: {
        propose: ["ADMIN", "MANAGER"],
        approve: ["ADMIN", "MANAGER"],
        reject: ["ADMIN", "MANAGER"],
        reopen: ["ADMIN", "MANAGER"],
      },
    },
    evaluation: {
      rules,
      criteriaVersionId: criteria?.id || null,
      criteria: normalizeCriteria(criteria),
    },
    monthlyAppraisal: {
      active: true,
      aggregationMethod: "AVERAGE_PERCENTAGE",
      eventAdjustmentTreatment: "ADD_TO_AGGREGATE",
      monthlyPositiveCap: null,
      monthlyNegativeCap: null,
      finalScoreMinimum: formulaConfig.finalScoreMinimum ?? 0,
      finalScoreMaximum: formulaConfig.finalScoreMaximum ?? 10000,
      performanceBands: [],
      minimumDataCoverage: { unit: "PERCENTAGE", value: 0 },
      includedEvaluationStatuses: ["REVIEWED", "EXCEPTION", "MODIFIED", "CLOSED"],
      employeeOfMonth: { minimumDailyEvaluations: 0, minimumScore: 0, activeEmployeesOnly: false, requireMonthlyApproval: true, tieBreakers: ["FINAL_SCORE", "EMPLOYEE_NAME", "EMPLOYEE_ID"] },
      workflow: {
        provisionalAllowed: true,
        reviewRequired: true,
        approvalRequired: true,
        lockOnApproval: true,
        reopenReasonRequired: true,
        reviewRoles: ["ADMIN", "MANAGER"],
        approvalRoles: ["ADMIN", "MANAGER"],
        reopenRoles: ["ADMIN", "MANAGER"],
      },
      recalculation: { onSourceChange: "DRAFT_ONLY", approvedRecordBehavior: "CREATE_NEW_VERSION" },
      sourceNormalization: { ...NORMALIZATION_DEFAULTS },
      formulaParameters,
      formulaVersionId: appraisalFormula?.id || null,
      sourceFormula: {
        code: appraisalFormula?.code || null,
        label: appraisalFormula?.label || null,
        effectiveFrom: appraisalFormula?.effectiveFrom || null,
        effectiveTo: appraisalFormula?.effectiveTo || null,
        config: formulaConfig,
      },
    },
    suitability: [
      suitabilityProfile("TRIP_STAFF", "Trip Staff"),
      suitabilityProfile("TRIP_TEAM_LEADER", "Trip Team Leader"),
      suitabilityProfile("BIRTHDAY_HOST", "Birthday Host"),
      suitabilityProfile("SHIFT_TEAM_LEADER", "Shift Team Leader"),
    ],
    shiftLeadership: {
      active: false,
      enabledBranches: [],
      requiredWeekdays: [],
      selectedDates: [],
      busyPeriods: [],
      holidays: [],
      shiftCodes: ["AM", "PM"],
      teamLeaderRequired: true,
      primaryLeaderCount: 1,
      deputyAllowed: true,
      requiredReadyTimeOffsetMinutes: 15,
      automaticReportCreation: false,
      reportDueTime: null,
      approvalRole: "MANAGER",
      replacement: { allowed: true, reasonRequired: true, roles: ["ADMIN", "MANAGER"] },
      preventSelfApproval: true,
      assignmentQualifiesAsSuccessionEvidence: false,
    },
    staffing: {
      active: true,
      maximumResponsibleBirthdayHosts: 2,
      primaryTripTeamLeaders: 1,
      backupStaffAllowed: true,
      suggestedTripShiftCodes: ["AM", "BW", "PM"],
      timeOverlap: { allowed: false, toleranceMinutes: 0 },
      requireAvailability: true,
      conflictWarningsEnabled: true,
      override: { allowed: true, roles: ["ADMIN", "MANAGER"], reasonRequired: true },
    },
    succession: {
      paths: [
        { code: "RIDE_OPERATOR_TO_FRONT_CASHIER", fromRole: "Ride Operator", toRole: "Front Cashier", enabled: true, cumulativeTemplateGroups: ["Ride Operator", "Front Cashier"] },
        { code: "RIDE_OPERATOR_TO_OPERATION_SUPERVISOR", fromRole: "Ride Operator", toRole: "Operation Supervisor", enabled: true, cumulativeTemplateGroups: ["Ride Operator", "Front Cashier", "Operation Supervisor"] },
        { code: "FRONT_CASHIER_TO_OPERATION_SUPERVISOR", fromRole: "Front Cashier", toRole: "Operation Supervisor", enabled: true, cumulativeTemplateGroups: ["Ride Operator", "Front Cashier", "Operation Supervisor"] },
      ],
      competencies: [],
      readinessLevels: READINESS_LEVELS.map((code, index) => ({ code, label: code.replaceAll("_", " "), active: true, sortOrder: (index + 1) * 10 })),
      reviewFrequencyOptions: [
        { code: "MONTHLY", label: "Monthly", months: 1, active: true },
        { code: "QUARTERLY", label: "Quarterly", months: 3, active: true },
        { code: "SEMI_ANNUAL", label: "Every six months", months: 6, active: true },
        { code: "ANNUAL", label: "Annual", months: 12, active: true },
      ],
      developmentActionTypes: ["TRAINING", "SHADOWING", "PRACTICAL_ASSIGNMENT", "COACHING"].map((code) => ({ code, label: code.replaceAll("_", " "), active: true })),
      developmentStatuses: DEVELOPMENT_STATUSES.map((code) => ({ code, label: code.replaceAll("_", " "), active: true })),
    },
    permissions: {
      settingsRoles: ["ADMIN", "MANAGER"],
      reportProposeRoles: ["ADMIN", "MANAGER"],
      reportApproveRoles: ["ADMIN", "MANAGER"],
      adjustmentProposeRoles: ["ADMIN", "MANAGER"],
      adjustmentApproveRoles: ["ADMIN", "MANAGER"],
      adjustmentRejectRoles: ["ADMIN", "MANAGER"],
      adjustmentReopenRoles: ["ADMIN", "MANAGER"],
      suitabilityOverrideRoles: ["ADMIN", "MANAGER"],
      staffingOverrideRoles: ["ADMIN", "MANAGER"],
      requireSecondReviewerForLinkedPublisher: true,
    },
  };
}

function validatePerformanceSettings(value, { publishing = false } = {}) {
  const issues = [];
  const issue = (path, message) => issues.push(`${path}: ${message}`);
  const object = (item, path) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issue(path, "must be an object");
      return false;
    }
    return true;
  };
  const array = (item, path) => {
    if (!Array.isArray(item)) {
      issue(path, "must be an array");
      return false;
    }
    return true;
  };
  const bool = (item, path) => { if (typeof item !== "boolean") issue(path, "must be true or false"); };
  const text = (item, path, required = true) => {
    if (typeof item !== "string" || (required && !item.trim())) issue(path, required ? "is required" : "must be text");
  };
  const finite = (item, path, minimum = -Infinity, maximum = Infinity, nullable = false) => {
    if (nullable && item == null) return;
    if (typeof item !== "number" || !Number.isFinite(item) || item < minimum || item > maximum) issue(path, `must be a number from ${minimum} to ${maximum}`);
  };
  const integer = (item, path, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => {
    if (!Number.isInteger(item) || item < minimum || item > maximum) issue(path, `must be a whole number from ${minimum} to ${maximum}`);
  };
  const choice = (item, choices, path) => { if (!choices.includes(item)) issue(path, `must be one of ${choices.join(", ")}`); };
  const date = (item, path, nullable = false) => {
    if (nullable && item == null) return;
    if (!isValidIsoDate(item)) issue(path, "must be a valid YYYY-MM-DD date");
  };
  const roles = (items, path) => {
    if (!array(items, path)) return;
    if (!items.length) issue(path, "must contain at least one management role");
    if (new Set(items).size !== items.length) issue(path, "must not contain duplicate roles");
    items.forEach((role, index) => { if (!MANAGEMENT_ROLES.includes(role)) issue(`${path}[${index}]`, "exceeds the ADMIN/MANAGER role ceiling"); });
  };
  const branches = (items, path, allowEmpty = false) => {
    if (!array(items, path)) return;
    if (!allowEmpty && !items.length) issue(path, "must include all branches (*) or at least one branch");
    if (new Set(items).size !== items.length) issue(path, "must not contain duplicates");
    if (items.includes("*") && items.length > 1) issue(path, "cannot combine * with named branches");
    items.forEach((branch, index) => { if (branch !== "*" && (typeof branch !== "string" || !CODE.test(branch))) issue(`${path}[${index}]`, "must be * or a valid branch code"); });
  };
  const code = (item, path) => { if (typeof item !== "string" || !CODE.test(item)) issue(path, "must be an uppercase code using letters, numbers, _ or -"); };
  const unique = (items, getKey, path) => {
    const seen = new Set();
    items.forEach((item, index) => { const key = getKey(item); if (seen.has(key)) issue(`${path}[${index}]`, `duplicates ${key}`); seen.add(key); });
  };
  const ranges = (items, path, minimumKey = "minimum", maximumKey = "maximum") => {
    const active = items.filter((item) => item && typeof item === "object" && !Array.isArray(item) && item.active !== false).sort((a, b) => Number(a?.[minimumKey]) - Number(b?.[minimumKey]));
    for (let index = 1; index < active.length; index += 1) {
      if (Number(active[index][minimumKey]) <= Number(active[index - 1][maximumKey])) issue(path, "contains overlapping active ranges");
    }
  };
  const periodsOverlap = (left, right) => {
    const leftEnd = left.effectiveTo || "9999-12-31";
    const rightEnd = right.effectiveTo || "9999-12-31";
    return left.effectiveFrom <= rightEnd && right.effectiveFrom <= leftEnd;
  };
  const branchesOverlap = (left, right) => {
    const leftBranches = Array.isArray(left) ? left : [];
    const rightBranches = Array.isArray(right) ? right : [];
    return leftBranches.includes("*") || rightBranches.includes("*") || leftBranches.some((branch) => rightBranches.includes(branch));
  };
  const validateVersionOverlap = (items, path) => {
    const active = items.filter((item) => item?.active);
    for (let left = 0; left < active.length; left += 1) for (let right = left + 1; right < active.length; right += 1) {
      if (active[left].code === active[right].code && branchesOverlap(active[left].branches || [], active[right].branches || []) && periodsOverlap(active[left], active[right])) issue(path, `active versions of ${active[left].code} overlap`);
    }
  };

  if (!object(value, "settings")) throw Object.assign(new Error("Invalid performance settings: settings must be an object"), { issues: ["settings: must be an object"] });
  const validateNormalization = (item,path) => {
    if(item==null)return;
    if(!object(item,path))return;
    for(const key of ['lateGraceMinutes','earlyLeaveGraceMinutes'])integer(item[key],path+'.'+key,0,1440);
    for(const key of ['onTimeScore','lateScore','absenceScore'])finite(item[key],path+'.'+key,0,100);
    finite(item.guestRatingMinimum,path+'.guestRatingMinimum',0,100);
    finite(item.guestRatingMaximum,path+'.guestRatingMaximum',0,100);
    if(item.guestRatingMinimum>=item.guestRatingMaximum)issue(path+'.guestRatingMaximum','must exceed the minimum rating');
  };
  validateNormalization(value.monthlyAppraisal?.sourceNormalization,'monthlyAppraisal.sourceNormalization');
  require('./performance-source-config').validateMonthlySources(value.monthlyAppraisal?.sources,issue);
  (Array.isArray(value.suitability)?value.suitability:[]).forEach((profile,index)=>validateNormalization(profile.sourceNormalization,'suitability['+index+'].sourceNormalization'));
  const requiredKeys = ["reports", "processTemplates", "surveyTemplates", "rewards", "evaluation", "monthlyAppraisal", "suitability", "shiftLeadership", "staffing", "succession", "permissions"];
  requiredKeys.forEach((key) => { if (!(key in value)) issue(`settings.${key}`, "is required"); });
  Object.keys(value).filter((key) => !requiredKeys.includes(key)).forEach((key) => issue(`settings.${key}`, "is not a supported top-level setting"));

  if (object(value.reports, "reports")) {
    REPORT_TYPES.forEach((type) => {
      const item = value.reports[type];
      const path = `reports.${type}`;
      if (!object(item, path)) return;
      bool(item.active, `${path}.active`);
      branches(item.branches, `${path}.branches`);
      bool(item.required, `${path}.required`);
      finite(item.completionDeadlineMinutes, `${path}.completionDeadlineMinutes`, 0, 525600, true);
      if (item.approvalRole != null) choice(item.approvalRole, MANAGEMENT_ROLES, `${path}.approvalRole`);
      if (publishing && item.active && !item.approvalRole) issue(`${path}.approvalRole`, "is required for an active report");
      if (array(item.requiredFields, `${path}.requiredFields`)) item.requiredFields.forEach((field, index) => text(field, `${path}.requiredFields[${index}]`));
      if (object(item.attachments, `${path}.attachments`)) {
        bool(item.attachments.required, `${path}.attachments.required`);
        integer(item.attachments.minimumCount, `${path}.attachments.minimumCount`, 0, 100);
        if (array(item.attachments.allowedTypes, `${path}.attachments.allowedTypes`)) item.attachments.allowedTypes.forEach((typeName, index) => text(typeName, `${path}.attachments.allowedTypes[${index}]`));
        if (item.attachments.required && item.attachments.minimumCount < 1) issue(`${path}.attachments.minimumCount`, "must be at least 1 when attachments are required");
      }
      bool(item.fastEverythingPlannedEnabled, `${path}.fastEverythingPlannedEnabled`);
      bool(item.surveyRequired, `${path}.surveyRequired`);
      bool(item.unresolvedIssuesBlockApproval, `${path}.unresolvedIssuesBlockApproval`);
      if (object(item.reopen, `${path}.reopen`)) { bool(item.reopen.allowed, `${path}.reopen.allowed`); bool(item.reopen.reasonRequired, `${path}.reopen.reasonRequired`); roles(item.reopen.roles, `${path}.reopen.roles`); }
      if (object(item.locking, `${path}.locking`)) { bool(item.locking.lockOnApproval, `${path}.locking.lockOnApproval`); bool(item.locking.manualLockAllowed, `${path}.locking.manualLockAllowed`); roles(item.locking.roles, `${path}.locking.roles`); }
    });
    Object.keys(value.reports).filter((key) => !REPORT_TYPES.includes(key)).forEach((key) => issue(`reports.${key}`, "is not a supported report type"));
  }

  if (array(value.processTemplates, "processTemplates")) {
    unique(value.processTemplates, (item) => `${item?.code}:${item?.version}`, "processTemplates");
    value.processTemplates.forEach((template, index) => {
      const path = `processTemplates[${index}]`;
      if (!object(template, path)) return;
      code(template.code, `${path}.code`); choice(template.reportType, REPORT_TYPES, `${path}.reportType`); integer(template.version, `${path}.version`, 1, 100000); bool(template.active, `${path}.active`);
      text(template.label, `${path}.label`); text(template.labelAr, `${path}.labelAr`); text(template.instructions || "", `${path}.instructions`, false); text(template.instructionsAr || "", `${path}.instructionsAr`, false);
      branches(template.branches, `${path}.branches`); date(template.effectiveFrom, `${path}.effectiveFrom`); date(template.effectiveTo, `${path}.effectiveTo`, true);
      if (template.effectiveTo && template.effectiveFrom > template.effectiveTo) issue(`${path}.effectiveTo`, "cannot be before effectiveFrom");
      if (array(template.steps, `${path}.steps`)) {
        unique(template.steps, (step) => step?.code, `${path}.steps`); unique(template.steps, (step) => step?.order, `${path}.steps order`);
        template.steps.forEach((step, stepIndex) => {
          const stepPath = `${path}.steps[${stepIndex}]`;
          if (!object(step, stepPath)) return;
          code(step.code, `${stepPath}.code`); integer(step.order, `${stepPath}.order`, 1, 10000); bool(step.active, `${stepPath}.active`); text(step.label, `${stepPath}.label`); text(step.labelAr, `${stepPath}.labelAr`);
          text(step.instructions || "", `${stepPath}.instructions`, false); text(step.instructionsAr || "", `${stepPath}.instructionsAr`, false); bool(step.required, `${stepPath}.required`); bool(step.responsibleEmployeeRequired, `${stepPath}.responsibleEmployeeRequired`); bool(step.evidenceRequired, `${stepPath}.evidenceRequired`);
          branches(step.branches, `${stepPath}.branches`);
        });
        if (publishing && template.active && !template.steps.some((step) => step?.active)) issue(`${path}.steps`, "must contain at least one active step before publishing");
      }
    });
    if (publishing) validateVersionOverlap(value.processTemplates, "processTemplates");
  }

  if (array(value.surveyTemplates, "surveyTemplates")) {
    unique(value.surveyTemplates, (item) => `${item?.code}:${item?.version}`, "surveyTemplates");
    value.surveyTemplates.forEach((template, index) => {
      const path = `surveyTemplates[${index}]`;
      if (!object(template, path)) return;
      code(template.code, `${path}.code`); choice(template.reportType, ["TRIP", "BIRTHDAY"], `${path}.reportType`); integer(template.version, `${path}.version`, 1, 100000); bool(template.active, `${path}.active`); text(template.label, `${path}.label`); text(template.labelAr, `${path}.labelAr`); bool(template.paperImageRequired, `${path}.paperImageRequired`); branches(template.branches, `${path}.branches`); date(template.effectiveFrom, `${path}.effectiveFrom`); date(template.effectiveTo, `${path}.effectiveTo`, true);
      if (template.effectiveTo && template.effectiveFrom > template.effectiveTo) issue(`${path}.effectiveTo`, "cannot be before effectiveFrom");
      if (array(template.questions, `${path}.questions`)) {
        unique(template.questions, (question) => question?.code, `${path}.questions`); unique(template.questions, (question) => question?.order, `${path}.question order`);
        template.questions.forEach((question, questionIndex) => {
          const questionPath = `${path}.questions[${questionIndex}]`;
          if (!object(question, questionPath)) return;
          code(question.code, `${questionPath}.code`); integer(question.order, `${questionPath}.order`, 1, 10000); bool(question.active, `${questionPath}.active`); bool(question.required, `${questionPath}.required`); text(question.text, `${questionPath}.text`); text(question.textAr, `${questionPath}.textAr`);
          if (array(question.choices, `${questionPath}.choices`)) {
            unique(question.choices, (choiceItem) => choiceItem?.code, `${questionPath}.choices`);
            question.choices.forEach((choiceItem, choiceIndex) => {
              const choicePath = `${questionPath}.choices[${choiceIndex}]`;
              if (!object(choiceItem, choicePath)) return;
              code(choiceItem.code, `${choicePath}.code`); text(choiceItem.label, `${choicePath}.label`); text(choiceItem.labelAr, `${choicePath}.labelAr`); finite(choiceItem.numericValue, `${choicePath}.numericValue`, -100000, 100000); bool(choiceItem.active, `${choicePath}.active`); bool(choiceItem.commentRequired, `${choicePath}.commentRequired`); bool(choiceItem.followUpSuggested, `${choicePath}.followUpSuggested`);
            });
            if (publishing && template.active && question.active && question.choices.filter((choiceItem) => choiceItem?.active).length < 2) issue(`${questionPath}.choices`, "must contain at least two active choices before publishing");
          }
        });
        if (publishing && template.active && !template.questions.some((question) => question?.active)) issue(`${path}.questions`, "must contain at least one active question before publishing");
      }
    });
    if (publishing) {
      validateVersionOverlap(value.surveyTemplates, "surveyTemplates");
      ["TRIP", "BIRTHDAY"].forEach((type) => { if (value.reports?.[type]?.active && value.reports[type].surveyRequired && !value.surveyTemplates.some((template) => template?.active && template.reportType === type)) issue(`reports.${type}.surveyRequired`, "requires an active survey template"); });
    }
  }

  if (object(value.rewards, "rewards")) {
    const item = value.rewards;
    bool(item.active, "rewards.active"); bool(item.attendanceScoringEnabled, "rewards.attendanceScoringEnabled"); finite(item.onTimeBonus, "rewards.onTimeBonus", 0, 100000); finite(item.absenceDeduction, "rewards.absenceDeduction", 0, 100000); finite(item.maximumPositivePointsPerEvent, "rewards.maximumPositivePointsPerEvent", 0, 100000); finite(item.maximumNegativePointsPerEvent, "rewards.maximumNegativePointsPerEvent", 0, 100000); finite(item.maximumMonthlyEventBonus, "rewards.maximumMonthlyEventBonus", 0, 1000000, true); finite(item.maximumMonthlyEventPenalty, "rewards.maximumMonthlyEventPenalty", 0, 1000000, true);
    if (array(item.latenessBands, "rewards.latenessBands")) {
      item.latenessBands.forEach((band, index) => { const path = `rewards.latenessBands[${index}]`; if (!object(band, path)) return; code(band.code, `${path}.code`); bool(band.active, `${path}.active`); integer(band.minimumMinutes, `${path}.minimumMinutes`, 0, 10080); integer(band.maximumMinutes, `${path}.maximumMinutes`, 0, 10080); finite(band.points, `${path}.points`, -100000, 100000); if (band.maximumMinutes < band.minimumMinutes) issue(`${path}.maximumMinutes`, "cannot be below minimumMinutes"); });
      ranges(item.latenessBands, "rewards.latenessBands", "minimumMinutes", "maximumMinutes");
      if (publishing && item.attendanceScoringEnabled && !item.latenessBands.some((band) => band?.active)) issue("rewards.latenessBands", "must contain an active band when attendance scoring is enabled");
    }
    if (array(item.performanceLevels, "rewards.performanceLevels")) {
      unique(item.performanceLevels, (level) => level?.code, "rewards.performanceLevels");
      item.performanceLevels.forEach((level, index) => { const path = `rewards.performanceLevels[${index}]`; if (!object(level, path)) return; code(level.code, `${path}.code`); text(level.label, `${path}.label`); text(level.labelAr, `${path}.labelAr`); finite(level.points, `${path}.points`, -100000, 100000); bool(level.active, `${path}.active`); bool(level.evidenceRequired, `${path}.evidenceRequired`); bool(level.commentRequired, `${path}.commentRequired`); bool(level.approvalRequired, `${path}.approvalRequired`); if (level.points > item.maximumPositivePointsPerEvent || level.points < -item.maximumNegativePointsPerEvent) issue(`${path}.points`, "exceeds the configured per-event cap"); });
      if (publishing && item.active && !item.performanceLevels.some((level) => level?.active)) issue("rewards.performanceLevels", "must contain at least one active level");
    }
    bool(item.useReportTypeValues, "rewards.useReportTypeValues");
    if (object(item.reportTypeValues, "rewards.reportTypeValues")) REPORT_TYPES.forEach((type) => finite(item.reportTypeValues[type], `rewards.reportTypeValues.${type}`, 0, 1000));
    if (object(item.teamLeaderValues, "rewards.teamLeaderValues")) { bool(item.teamLeaderValues.enabled, "rewards.teamLeaderValues.enabled"); finite(item.teamLeaderValues.multiplier, "rewards.teamLeaderValues.multiplier", 0, 100); }
    bool(item.attendanceMayCreateAdditionalEventImpact, "rewards.attendanceMayCreateAdditionalEventImpact");
    if (object(item.roles, "rewards.roles")) ["propose", "approve", "reject", "reopen"].forEach((name) => roles(item.roles[name], `rewards.roles.${name}`));
  }

  if (object(value.evaluation, "evaluation")) {
    const rulesValue = value.evaluation.rules;
    if (object(rulesValue, "evaluation.rules")) {
      choice(rulesValue.defaultScoreMode, ["FULL_UNREVIEWED", "ZERO_UNREVIEWED"], "evaluation.rules.defaultScoreMode"); finite(rulesValue.penaltyDeduction, "evaluation.rules.penaltyDeduction", 0, 100000); finite(rulesValue.guidanceDeduction, "evaluation.rules.guidanceDeduction", 0, 100000); bool(rulesValue.requireReasonForDeduction, "evaluation.rules.requireReasonForDeduction"); bool(rulesValue.requireReviewBeforeClose, "evaluation.rules.requireReviewBeforeClose");
    }
    if (value.evaluation.criteriaVersionId != null) text(value.evaluation.criteriaVersionId, "evaluation.criteriaVersionId");
    if (array(value.evaluation.criteria, "evaluation.criteria")) {
      unique(value.evaluation.criteria, (criterion) => criterion?.code, "evaluation.criteria");
      value.evaluation.criteria.forEach((criterion, index) => { const path = `evaluation.criteria[${index}]`; if (!object(criterion, path)) return; code(criterion.code, `${path}.code`); text(criterion.label, `${path}.label`); text(criterion.labelAr || "", `${path}.labelAr`, false); text(criterion.category, `${path}.category`); finite(criterion.maxScore, `${path}.maxScore`, 0, 100000); bool(criterion.active, `${path}.active`); integer(criterion.sortOrder, `${path}.sortOrder`, 0, 100000); if (criterion.active && criterion.maxScore <= 0) issue(`${path}.maxScore`, "must be greater than zero for an active criterion"); if (array(criterion.reasons, `${path}.reasons`)) { unique(criterion.reasons, (reason) => reason?.code, `${path}.reasons`); criterion.reasons.forEach((reason, reasonIndex) => { const reasonPath = `${path}.reasons[${reasonIndex}]`; if (!object(reason, reasonPath)) return; code(reason.code, `${reasonPath}.code`); text(reason.label, `${reasonPath}.label`); text(reason.labelAr || "", `${reasonPath}.labelAr`, false); bool(reason.active, `${reasonPath}.active`); integer(reason.sortOrder, `${reasonPath}.sortOrder`, 0, 100000); }); } });
      if (publishing && !value.evaluation.criteria.some((criterion) => criterion?.active)) issue("evaluation.criteria", "must contain at least one active criterion before publishing");
    }
  }

  if (object(value.monthlyAppraisal, "monthlyAppraisal")) {
    const item = value.monthlyAppraisal;
    if(item.includedEvaluationStatuses!=null){if(array(item.includedEvaluationStatuses,'monthlyAppraisal.includedEvaluationStatuses')){if(!item.includedEvaluationStatuses.length)issue('monthlyAppraisal.includedEvaluationStatuses','requires at least one completed status');item.includedEvaluationStatuses.forEach(status=>choice(status,['REVIEWED','EXCEPTION','MODIFIED','CLOSED'],'monthlyAppraisal.includedEvaluationStatuses'));}}
    if(item.employeeOfMonth!=null&&object(item.employeeOfMonth,'monthlyAppraisal.employeeOfMonth')){const r=item.employeeOfMonth;integer(r.minimumDailyEvaluations,'monthlyAppraisal.employeeOfMonth.minimumDailyEvaluations',0,366);finite(r.minimumScore,'monthlyAppraisal.employeeOfMonth.minimumScore',-1000000,1000000);bool(r.activeEmployeesOnly,'monthlyAppraisal.employeeOfMonth.activeEmployeesOnly');bool(r.requireMonthlyApproval,'monthlyAppraisal.employeeOfMonth.requireMonthlyApproval');if(array(r.tieBreakers,'monthlyAppraisal.employeeOfMonth.tieBreakers')){if(r.tieBreakers[0]!=='FINAL_SCORE'||!r.tieBreakers.includes('EMPLOYEE_ID'))issue('monthlyAppraisal.employeeOfMonth.tieBreakers','must start with FINAL_SCORE and include EMPLOYEE_ID as a stable final key');if(new Set(r.tieBreakers).size!==r.tieBreakers.length)issue('monthlyAppraisal.employeeOfMonth.tieBreakers','contains duplicate rules');r.tieBreakers.forEach(key=>choice(key,['FINAL_SCORE','COMPLETED_DAYS','ATTENDANCE_SCORE','EMPLOYEE_NAME','EMPLOYEE_ID'],'monthlyAppraisal.employeeOfMonth.tieBreakers'));}}
    bool(item.active, "monthlyAppraisal.active"); choice(item.aggregationMethod, ["AVERAGE_PERCENTAGE", "WEIGHTED_AVERAGE", "SUM"], "monthlyAppraisal.aggregationMethod"); choice(item.eventAdjustmentTreatment, ["ADD_TO_AGGREGATE", "SEPARATE_COMPONENT", "IGNORE"], "monthlyAppraisal.eventAdjustmentTreatment"); finite(item.monthlyPositiveCap, "monthlyAppraisal.monthlyPositiveCap", 0, 1000000, true); finite(item.monthlyNegativeCap, "monthlyAppraisal.monthlyNegativeCap", 0, 1000000, true); finite(item.finalScoreMinimum, "monthlyAppraisal.finalScoreMinimum", -1000000, 1000000); finite(item.finalScoreMaximum, "monthlyAppraisal.finalScoreMaximum", -1000000, 1000000); if (item.finalScoreMaximum <= item.finalScoreMinimum) issue("monthlyAppraisal.finalScoreMaximum", "must be greater than finalScoreMinimum");
    if (array(item.performanceBands, "monthlyAppraisal.performanceBands")) { item.performanceBands.forEach((band, index) => { const path = `monthlyAppraisal.performanceBands[${index}]`; if (!object(band, path)) return; code(band.code, `${path}.code`); text(band.label, `${path}.label`); bool(band.active, `${path}.active`); finite(band.minimum, `${path}.minimum`, item.finalScoreMinimum, item.finalScoreMaximum); finite(band.maximum, `${path}.maximum`, item.finalScoreMinimum, item.finalScoreMaximum); if (band.maximum < band.minimum) issue(`${path}.maximum`, "cannot be below minimum"); }); ranges(item.performanceBands, "monthlyAppraisal.performanceBands"); }
    if (object(item.minimumDataCoverage, "monthlyAppraisal.minimumDataCoverage")) { choice(item.minimumDataCoverage.unit, ["PERCENTAGE", "DAYS"], "monthlyAppraisal.minimumDataCoverage.unit"); finite(item.minimumDataCoverage.value, "monthlyAppraisal.minimumDataCoverage.value", 0, item.minimumDataCoverage.unit === "PERCENTAGE" ? 100 : 366); }
    if (object(item.workflow, "monthlyAppraisal.workflow")) { ["provisionalAllowed", "reviewRequired", "approvalRequired", "lockOnApproval", "reopenReasonRequired"].forEach((name) => bool(item.workflow[name], `monthlyAppraisal.workflow.${name}`)); roles(item.workflow.reviewRoles, "monthlyAppraisal.workflow.reviewRoles"); roles(item.workflow.approvalRoles, "monthlyAppraisal.workflow.approvalRoles"); roles(item.workflow.reopenRoles, "monthlyAppraisal.workflow.reopenRoles"); }
    if (object(item.recalculation, "monthlyAppraisal.recalculation")) { choice(item.recalculation.onSourceChange, ["NEVER", "DRAFT_ONLY", "ALWAYS_NEW_VERSION"], "monthlyAppraisal.recalculation.onSourceChange"); choice(item.recalculation.approvedRecordBehavior, ["PRESERVE", "CREATE_NEW_VERSION"], "monthlyAppraisal.recalculation.approvedRecordBehavior"); }
    if (object(item.formulaParameters, "monthlyAppraisal.formulaParameters")) Object.entries(item.formulaParameters).forEach(([name, parameter]) => finite(parameter, `monthlyAppraisal.formulaParameters.${name}`, 0, 1000000));
    if (item.formulaVersionId != null) text(item.formulaVersionId, "monthlyAppraisal.formulaVersionId");
    if (object(item.sourceFormula, "monthlyAppraisal.sourceFormula")) { if (item.sourceFormula.code != null) text(item.sourceFormula.code, "monthlyAppraisal.sourceFormula.code"); if (item.sourceFormula.label != null) text(item.sourceFormula.label, "monthlyAppraisal.sourceFormula.label"); date(item.sourceFormula.effectiveFrom, "monthlyAppraisal.sourceFormula.effectiveFrom", true); date(item.sourceFormula.effectiveTo, "monthlyAppraisal.sourceFormula.effectiveTo", true); object(item.sourceFormula.config, "monthlyAppraisal.sourceFormula.config"); }
  }

  if (array(value.suitability, "suitability")) {
    unique(value.suitability, (profile) => profile?.code, "suitability");
    const codes = value.suitability.map((profile) => profile?.code);
    if (value.suitability.length !== SUITABILITY_PROFILES.length || SUITABILITY_PROFILES.some((profileCode) => !codes.includes(profileCode))) issue("suitability", `must contain exactly ${SUITABILITY_PROFILES.join(", ")}`);
    value.suitability.forEach((profile, index) => {
      const path = `suitability[${index}]`;
      if (!object(profile, path)) return;
      choice(profile.code, SUITABILITY_PROFILES, `${path}.code`); text(profile.label, `${path}.label`); bool(profile.active, `${path}.active`); integer(profile.rollingWindowDays, `${path}.rollingWindowDays`, 1, 3650); integer(profile.maximumRecentEvents, `${path}.maximumRecentEvents`, 1, 10000); integer(profile.minimumEvents, `${path}.minimumEvents`, 0, profile.maximumRecentEvents); choice(profile.weightingMode, ["PERCENTAGE", "POINTS"], `${path}.weightingMode`);
      if (object(profile.weights, `${path}.weights`)) { const weightNames = ["punctuality", "performance", "guestFeedback", "processReliability", "leadershipProblemResolution"]; weightNames.forEach((name) => finite(profile.weights[name], `${path}.weights.${name}`, 0, 100)); if (profile.weightingMode === "PERCENTAGE") { const total = weightNames.reduce((sum, name) => sum + Number(profile.weights[name] || 0), 0); if (Math.abs(total - 100) > 0.0001) issue(`${path}.weights`, "must total 100 for percentage weighting"); } }
      if (array(profile.thresholds, `${path}.thresholds`)) { unique(profile.thresholds, (threshold) => threshold?.status, `${path}.thresholds`); profile.thresholds.forEach((threshold, thresholdIndex) => { const thresholdPath = `${path}.thresholds[${thresholdIndex}]`; if (!object(threshold, thresholdPath)) return; code(threshold.status, `${thresholdPath}.status`); finite(threshold.minimum, `${thresholdPath}.minimum`, 0, 100); finite(threshold.maximum, `${thresholdPath}.maximum`, 0, 100); bool(threshold.active, `${thresholdPath}.active`); if (threshold.maximum < threshold.minimum) issue(`${thresholdPath}.maximum`, "cannot be below minimum"); }); ranges(profile.thresholds, `${path}.thresholds`); if (publishing && profile.active && !profile.thresholds.some((threshold) => threshold?.active)) issue(`${path}.thresholds`, "must contain at least one active threshold"); }
      if (array(profile.cautionRules, `${path}.cautionRules`)) profile.cautionRules.forEach((rule, ruleIndex) => text(rule, `${path}.cautionRules[${ruleIndex}]`));
      if (array(profile.notRecommendedRules, `${path}.notRecommendedRules`)) profile.notRecommendedRules.forEach((rule, ruleIndex) => text(rule, `${path}.notRecommendedRules[${ruleIndex}]`));
      if (object(profile.decay, `${path}.decay`)) { choice(profile.decay.mode, ["NONE", "LINEAR", "EXPONENTIAL"], `${path}.decay.mode`); finite(profile.decay.halfLifeDays, `${path}.decay.halfLifeDays`, 1, 3650, profile.decay.mode === "NONE"); if (profile.decay.mode !== "NONE" && profile.decay.halfLifeDays == null) issue(`${path}.decay.halfLifeDays`, "is required when decay is enabled"); }
      if (object(profile.override, `${path}.override`)) { bool(profile.override.allowed, `${path}.override.allowed`); bool(profile.override.reasonRequired, `${path}.override.reasonRequired`); roles(profile.override.roles, `${path}.override.roles`); }
      if (object(profile.recalculation, `${path}.recalculation`)) { choice(profile.recalculation.trigger, ["ON_SOURCE_CHANGE", "SCHEDULED", "MANUAL"], `${path}.recalculation.trigger`); if (profile.recalculation.schedule != null) text(profile.recalculation.schedule, `${path}.recalculation.schedule`); if (profile.recalculation.trigger === "SCHEDULED" && !["DAILY", "WEEKLY", "MONTHLY"].includes(profile.recalculation.schedule)) issue(`${path}.recalculation.schedule`, "must be DAILY, WEEKLY, or MONTHLY for scheduled recalculation"); }
    });
  }

  if (object(value.shiftLeadership, "shiftLeadership")) {
    const item = value.shiftLeadership;
    bool(item.active, "shiftLeadership.active"); branches(item.enabledBranches, "shiftLeadership.enabledBranches", !item.active);
    if (array(item.requiredWeekdays, "shiftLeadership.requiredWeekdays")) { if (new Set(item.requiredWeekdays).size !== item.requiredWeekdays.length) issue("shiftLeadership.requiredWeekdays", "must not contain duplicates"); item.requiredWeekdays.forEach((dayValue, index) => integer(dayValue, `shiftLeadership.requiredWeekdays[${index}]`, 0, 6)); }
    if (array(item.selectedDates, "shiftLeadership.selectedDates")) item.selectedDates.forEach((dateValue, index) => date(dateValue, `shiftLeadership.selectedDates[${index}]`));
    for (const field of ["busyPeriods", "holidays"]) if (array(item[field], `shiftLeadership.${field}`)) item[field].forEach((period, index) => { const path = `shiftLeadership.${field}[${index}]`; if (!object(period, path)) return; text(period.label, `${path}.label`); date(period.startDate, `${path}.startDate`); date(period.endDate, `${path}.endDate`); if (period.endDate < period.startDate) issue(`${path}.endDate`, "cannot be before startDate"); });
    if (array(item.shiftCodes, "shiftLeadership.shiftCodes")) { if (item.active && !item.shiftCodes.length) issue("shiftLeadership.shiftCodes", "must contain a shift when active"); item.shiftCodes.forEach((shiftCode, index) => code(shiftCode, `shiftLeadership.shiftCodes[${index}]`)); }
    bool(item.teamLeaderRequired, "shiftLeadership.teamLeaderRequired"); integer(item.primaryLeaderCount, "shiftLeadership.primaryLeaderCount", 0, 100); if (item.teamLeaderRequired && item.primaryLeaderCount < 1) issue("shiftLeadership.primaryLeaderCount", "must be at least 1 when a leader is required"); bool(item.deputyAllowed, "shiftLeadership.deputyAllowed"); integer(item.requiredReadyTimeOffsetMinutes, "shiftLeadership.requiredReadyTimeOffsetMinutes", 0, 1440); bool(item.automaticReportCreation, "shiftLeadership.automaticReportCreation"); if (item.reportDueTime != null && !TIME.test(item.reportDueTime)) issue("shiftLeadership.reportDueTime", "must be HH:mm"); choice(item.approvalRole, MANAGEMENT_ROLES, "shiftLeadership.approvalRole"); if (object(item.replacement, "shiftLeadership.replacement")) { bool(item.replacement.allowed, "shiftLeadership.replacement.allowed"); bool(item.replacement.reasonRequired, "shiftLeadership.replacement.reasonRequired"); roles(item.replacement.roles, "shiftLeadership.replacement.roles"); } bool(item.preventSelfApproval, "shiftLeadership.preventSelfApproval"); bool(item.assignmentQualifiesAsSuccessionEvidence, "shiftLeadership.assignmentQualifiesAsSuccessionEvidence");
  }

  if (object(value.staffing, "staffing")) {
    const item = value.staffing;
    bool(item.active, "staffing.active"); integer(item.maximumResponsibleBirthdayHosts, "staffing.maximumResponsibleBirthdayHosts", 0, 100); integer(item.primaryTripTeamLeaders, "staffing.primaryTripTeamLeaders", 0, 100); bool(item.backupStaffAllowed, "staffing.backupStaffAllowed"); if (array(item.suggestedTripShiftCodes, "staffing.suggestedTripShiftCodes")) item.suggestedTripShiftCodes.forEach((shiftCode, index) => code(shiftCode, `staffing.suggestedTripShiftCodes[${index}]`)); if (object(item.timeOverlap, "staffing.timeOverlap")) { bool(item.timeOverlap.allowed, "staffing.timeOverlap.allowed"); integer(item.timeOverlap.toleranceMinutes, "staffing.timeOverlap.toleranceMinutes", 0, 1440); } bool(item.requireAvailability, "staffing.requireAvailability"); bool(item.conflictWarningsEnabled, "staffing.conflictWarningsEnabled"); if (object(item.override, "staffing.override")) { bool(item.override.allowed, "staffing.override.allowed"); roles(item.override.roles, "staffing.override.roles"); bool(item.override.reasonRequired, "staffing.override.reasonRequired"); }
  }

  if (object(value.succession, "succession")) {
    const item = value.succession;
    if (array(item.paths, "succession.paths")) { const roleKey = (role) => String(role === "Cashier - Front" ? "Front Cashier" : role || "").trim().toLowerCase(); unique(item.paths, (pathItem) => pathItem?.code, "succession.paths"); unique(item.paths.filter((pathItem) => pathItem?.enabled), (pathItem) => `${roleKey(pathItem?.fromRole)}:${roleKey(pathItem?.toRole)}`, "succession.paths transitions"); item.paths.forEach((pathItem, index) => { const path = `succession.paths[${index}]`; if (!object(pathItem, path)) return; code(pathItem.code, `${path}.code`); text(pathItem.fromRole, `${path}.fromRole`); text(pathItem.toRole, `${path}.toRole`); bool(pathItem.enabled, `${path}.enabled`); if (roleKey(pathItem.fromRole) === roleKey(pathItem.toRole)) issue(`${path}.toRole`, "must differ from fromRole"); if (array(pathItem.cumulativeTemplateGroups, `${path}.cumulativeTemplateGroups`)) { if (pathItem.enabled && !pathItem.cumulativeTemplateGroups.length) issue(`${path}.cumulativeTemplateGroups`, "is required for an enabled path"); pathItem.cumulativeTemplateGroups.forEach((group, groupIndex) => text(group, `${path}.cumulativeTemplateGroups[${groupIndex}]`)); } }); }
    if (array(item.competencies, "succession.competencies")) { unique(item.competencies, (competency) => `${competency?.templateCode}:${competency?.code}`, "succession.competencies"); item.competencies.forEach((competency, index) => { const path = `succession.competencies[${index}]`; if (!object(competency, path)) return; code(competency.templateCode, `${path}.templateCode`); code(competency.code, `${path}.code`); text(competency.group, `${path}.group`); text(competency.label, `${path}.label`); text(competency.labelAr || "", `${path}.labelAr`, false); finite(competency.requiredLevel, `${path}.requiredLevel`, 0, 100); integer(competency.order, `${path}.order`, 1, 10000); bool(competency.active, `${path}.active`); bool(competency.evidenceRequired, `${path}.evidenceRequired`); bool(competency.operationalReportsQualifyAsEvidence, `${path}.operationalReportsQualifyAsEvidence`); if (array(competency.practicalAssignmentTypes, `${path}.practicalAssignmentTypes`)) competency.practicalAssignmentTypes.forEach((typeName, typeIndex) => text(typeName, `${path}.practicalAssignmentTypes[${typeIndex}]`)); }); }
    const validateOptions = (options, path, allowedCodes) => { if (!array(options, path)) return; unique(options, (option) => option?.code, path); options.forEach((option, index) => { const optionPath = `${path}[${index}]`; if (!object(option, optionPath)) return; code(option.code, `${optionPath}.code`); if (allowedCodes && !allowedCodes.includes(option.code)) issue(`${optionPath}.code`, "is not supported by the current data model"); text(option.label, `${optionPath}.label`); bool(option.active, `${optionPath}.active`); }); };
    validateOptions(item.readinessLevels, "succession.readinessLevels", READINESS_LEVELS);
    if (array(item.reviewFrequencyOptions, "succession.reviewFrequencyOptions")) item.reviewFrequencyOptions.forEach((option, index) => { const path = `succession.reviewFrequencyOptions[${index}]`; if (!object(option, path)) return; code(option.code, `${path}.code`); text(option.label, `${path}.label`); integer(option.months, `${path}.months`, 1, 120); bool(option.active, `${path}.active`); });
    validateOptions(item.developmentActionTypes, "succession.developmentActionTypes");
    validateOptions(item.developmentStatuses, "succession.developmentStatuses", DEVELOPMENT_STATUSES);
  }

  if (object(value.permissions, "permissions")) {
    const roleFields = ["settingsRoles", "reportProposeRoles", "reportApproveRoles", "adjustmentProposeRoles", "adjustmentApproveRoles", "adjustmentRejectRoles", "adjustmentReopenRoles", "suitabilityOverrideRoles", "staffingOverrideRoles"];
    roleFields.forEach((field) => roles(value.permissions[field], `permissions.${field}`));
    if (Array.isArray(value.permissions.settingsRoles) && !value.permissions.settingsRoles.includes("ADMIN")) issue("permissions.settingsRoles", "must include ADMIN to prevent settings lockout");
    bool(value.permissions.requireSecondReviewerForLinkedPublisher, "permissions.requireSecondReviewerForLinkedPublisher");
    if (value.permissions.requireSecondReviewerForLinkedPublisher === false) issue("permissions.requireSecondReviewerForLinkedPublisher", "must remain enabled to protect linked employee scores");
  }

  if (issues.length) {
    const error = new Error(`Invalid performance settings: ${issues.join("; ")}`);
    error.code = "INVALID_PERFORMANCE_SETTINGS";
    error.status = 422;
    error.issues = issues;
    throw error;
  }
  return clone(value);
}

module.exports = {
  isValidIsoDate,
  DEVELOPMENT_STATUSES,
  MANAGEMENT_ROLES,
  READINESS_LEVELS,
  REPORT_TYPES,
  SUITABILITY_PROFILES,
  defaultPerformanceSettings,
  validatePerformanceSettings,
};
