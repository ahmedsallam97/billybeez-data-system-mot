const { randomUUID } = require("crypto");
const { defaultPerformanceSettings, validatePerformanceSettings } = require("./performance-settings-config");
const { NORMALIZATION_DEFAULTS } = require('./performance-source-config');

const CONFIG_PREFIX = "OPS_PERFORMANCE_CONFIG:";
const SNAPSHOT_PREFIX = "OPS_PERFORMANCE_SNAPSHOT:";
const LEGACY_BASELINE_KEY = `${SNAPSHOT_PREFIX}BASELINE:LEGACY`;
const GLOBAL_SCOPE = "GLOBAL";
const SCHEMA_VERSION = 1;
const BASELINE_DATE = "2000-01-01";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

// Enrich only an explicitly saved/published configuration. Reading an older
// publication or snapshot never rewrites that historical business policy.
function prepareNewConfiguration(value) {
  const prepared=validatePerformanceSettings(value);
  prepared.monthlyAppraisal.sourceNormalization ||= clone(NORMALIZATION_DEFAULTS);
  prepared.monthlyAppraisal.includedEvaluationStatuses ||= ['REVIEWED','EXCEPTION','MODIFIED','CLOSED'];
  prepared.monthlyAppraisal.employeeOfMonth ||= {minimumDailyEvaluations:0,minimumScore:0,activeEmployeesOnly:false,requireMonthlyApproval:prepared.monthlyAppraisal.workflow.approvalRequired,tieBreakers:['FINAL_SCORE','EMPLOYEE_NAME','EMPLOYEE_ID']};
  prepared.suitability.forEach(profile=>{profile.sourceNormalization ||= clone(NORMALIZATION_DEFAULTS);});
  return prepared;
}

function serviceError(message, code, status = 400, details) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  if (details) error.details = details;
  return error;
}

function validDate(value, label = "Date") {
  const date = String(value || "");
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!ISO_DATE.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw serviceError(`${label} must be a valid YYYY-MM-DD date`, "INVALID_DATE", 422);
  return date;
}

function requestedDate(value) {
  return value ? validDate(value, "Effective date") : new Date().toISOString().slice(0, 10);
}

function normalizeScope(input) {
  const raw = input && typeof input === "object" ? input.scope || input.branch || input.type : input;
  const value = String(raw || GLOBAL_SCOPE).trim();
  if (value.toUpperCase() === GLOBAL_SCOPE) return { type: GLOBAL_SCOPE, branch: null };
  const branch = value.toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,79}$/.test(branch)) throw serviceError("A valid branch scope is required", "INVALID_SCOPE", 422);
  return { type: "BRANCH", branch };
}

function scopeName(scope) {
  return scope.type === GLOBAL_SCOPE ? GLOBAL_SCOPE : scope.branch;
}

function settingKey(scope) {
  return `${CONFIG_PREFIX}${scopeName(scope)}`;
}

function snapshotKey(kind, recordId) {
  const normalizedKind = String(kind || "").trim().toUpperCase();
  const normalizedRecordId = String(recordId || "").trim();
  if (!/^[A-Z0-9][A-Z0-9_-]{0,79}$/.test(normalizedKind) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(normalizedRecordId)) throw serviceError("Snapshot kind and record id are required", "INVALID_SNAPSHOT_KEY", 422);
  return { key: `${SNAPSHOT_PREFIX}${normalizedKind}:${normalizedRecordId}`, kind: normalizedKind, recordId: normalizedRecordId };
}

function baseEnvelope(scope) {
  return { schemaVersion: SCHEMA_VERSION, scope: clone(scope), revision: 0, draft: null, publications: [], resets: [] };
}

function assertEnvelope(value, expectedScope) {
  if (!value || typeof value !== "object" || Array.isArray(value) || value.schemaVersion !== SCHEMA_VERSION) throw serviceError("Stored performance settings are malformed", "MALFORMED_PERFORMANCE_SETTINGS", 500);
  if (!Number.isInteger(value.revision) || value.revision < 0 || !Array.isArray(value.publications) || !Array.isArray(value.resets)) throw serviceError("Stored performance settings history is malformed", "MALFORMED_PERFORMANCE_SETTINGS", 500);
  const storedScope = normalizeScope(value.scope);
  if (scopeName(storedScope) !== scopeName(expectedScope)) throw serviceError("Stored performance settings scope does not match its key", "MALFORMED_PERFORMANCE_SETTINGS", 500);
  const publicationIds = new Set();
  const eventDates = new Set();
  value.publications.forEach((publication) => {
    if (!publication?.id || !Number.isInteger(publication.version) || publication.version < 1) throw serviceError("Stored publication metadata is malformed", "MALFORMED_PERFORMANCE_SETTINGS", 500);
    validDate(publication.effectiveFrom, "Stored publication effective date");
    if (publicationIds.has(publication.id) || eventDates.has(publication.effectiveFrom)) throw serviceError("Stored performance settings contain ambiguous publications", "MALFORMED_PERFORMANCE_SETTINGS", 500);
    publicationIds.add(publication.id);
    eventDates.add(publication.effectiveFrom);
    validatePerformanceSettings(publication.value, { publishing: !publication.systemGenerated });
  });
  value.resets.forEach((reset) => {
    if (!reset?.id) throw serviceError("Stored reset metadata is malformed", "MALFORMED_PERFORMANCE_SETTINGS", 500);
    validDate(reset.effectiveFrom, "Stored reset effective date");
    if (eventDates.has(reset.effectiveFrom)) throw serviceError("Stored performance settings contain ambiguous effective dates", "MALFORMED_PERFORMANCE_SETTINGS", 500);
    eventDates.add(reset.effectiveFrom);
  });
  if (value.draft) {
    if (!Number.isInteger(value.draft.revision) || value.draft.revision < 1) throw serviceError("Stored draft metadata is malformed", "MALFORMED_PERFORMANCE_SETTINGS", 500);
    validatePerformanceSettings(value.draft.value);
  }
  return value;
}

function parseEnvelope(row, scope) {
  if (!row) return baseEnvelope(scope);
  try {
    return assertEnvelope(JSON.parse(row.value), scope);
  } catch (error) {
    if (error?.code) throw error;
    throw serviceError("Stored performance settings are not valid JSON", "MALFORMED_PERFORMANCE_SETTINGS", 500);
  }
}

function effectiveEvent(envelope, date) {
  const events = [
    ...envelope.publications.map((item) => ({ type: "PUBLISHED", effectiveFrom: item.effectiveFrom, item })),
    ...envelope.resets.map((item) => ({ type: "RESET", effectiveFrom: item.effectiveFrom, item })),
  ].filter((event) => event.effectiveFrom <= date);
  events.sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
  return events.at(-1) || null;
}

function publicationRef(publication) {
  return publication ? { id: publication.id, version: publication.version, effectiveFrom: publication.effectiveFrom } : null;
}

function virtualDefaultPublication(defaults) {
  return {
    id: "DEFAULT",
    version: 0,
    effectiveFrom: BASELINE_DATE,
    publishedAt: null,
    publishedBy: null,
    reviewerUserId: null,
    reason: "Built-in defaults",
    baseGlobalRef: null,
    value: defaults,
    systemGenerated: true,
  };
}

function resolveGlobal(envelope, defaults, date) {
  const event = effectiveEvent(envelope, date);
  const publication = event?.type === "PUBLISHED" ? event.item : virtualDefaultPublication(defaults);
  return {
    source: publication.id === "DEFAULT" ? "DEFAULT" : GLOBAL_SCOPE,
    scope: { type: GLOBAL_SCOPE, branch: null },
    publicationId: publication.id,
    version: publication.version,
    effectiveFrom: publication.effectiveFrom,
    baseGlobalRef: null,
    value: clone(publication.value),
  };
}

function resolveBranch(envelope, globalEnvelope, globalEffective, date) {
  const event = effectiveEvent(envelope, date);
  if (!event || event.type === "RESET") return { ...clone(globalEffective), requestedScope: clone(envelope.scope), inherited: true };
  const publication = event.item;
  if (!publication.baseGlobalRef?.id) throw serviceError("Branch publication does not reference a global configuration", "INVALID_GLOBAL_REFERENCE", 500);
  const validGlobalIds = new Set(["DEFAULT", ...globalEnvelope.publications.map((item) => item.id)]);
  if (!validGlobalIds.has(publication.baseGlobalRef.id)) throw serviceError("Branch publication references a missing global configuration", "INVALID_GLOBAL_REFERENCE", 500);
  return {
    source: "BRANCH",
    scope: clone(envelope.scope),
    requestedScope: clone(envelope.scope),
    publicationId: publication.id,
    version: publication.version,
    effectiveFrom: publication.effectiveFrom,
    baseGlobalRef: clone(publication.baseGlobalRef),
    inherited: false,
    value: clone(publication.value),
  };
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function pickEffective(rows, date) {
  return (rows || [])
    .filter((item) => item.active !== false && (!item.effectiveFrom || item.effectiveFrom <= date) && (!item.effectiveTo || item.effectiveTo >= date))
    .sort((left, right) => String(right.effectiveFrom || "").localeCompare(String(left.effectiveFrom || "")) || new Date(right.createdAt || 0) - new Date(left.createdAt || 0))[0] || null;
}

async function loadDefaultInputs(db, date) {
  const criteriaPromise = db.opsEvaluationCriteriaVersion?.findMany
    ? db.opsEvaluationCriteriaVersion.findMany({ where: { active: true }, include: { criteria: { include: { reasons: true }, orderBy: { sortOrder: "asc" } } }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] })
    : Promise.resolve([]);
  const formulaPromise = db.opsAppraisalFormulaVersion?.findMany
    ? db.opsAppraisalFormulaVersion.findMany({ where: { active: true }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] })
    : Promise.resolve([]);
  const rulesPromise = db.systemSetting.findUnique({ where: { key: "OPS_EVALUATION_RULES" } });
  const [criteriaRows, formulaRows, rulesRow] = await Promise.all([criteriaPromise, formulaPromise, rulesPromise]);
  let evaluationRules = {};
  if (rulesRow) {
    try { evaluationRules = JSON.parse(rulesRow.value); }
    catch { throw serviceError("Stored evaluation rules are invalid JSON", "MALFORMED_EVALUATION_RULES", 422); }
    if (!evaluationRules || typeof evaluationRules !== "object" || Array.isArray(evaluationRules)) throw serviceError("Stored evaluation rules must contain an object", "MALFORMED_EVALUATION_RULES", 422);
  }
  return {
    criteria: pickEffective(criteriaRows, date),
    evaluationRules,
    appraisalFormula: pickEffective(formulaRows, date),
  };
}

async function loadRows(db, scope) {
  const globalScope = { type: GLOBAL_SCOPE, branch: null };
  const globalKey = settingKey(globalScope);
  if (scope.type === GLOBAL_SCOPE) {
    const row = await db.systemSetting.findUnique({ where: { key: globalKey } });
    return { globalRow: row, scopeRow: row };
  }
  const [globalRow, scopeRow] = await Promise.all([
    db.systemSetting.findUnique({ where: { key: globalKey } }),
    db.systemSetting.findUnique({ where: { key: settingKey(scope) } }),
  ]);
  return { globalRow, scopeRow };
}

async function getEffectivePerformanceSettings(db, { branch, date } = {}) {
  const effectiveDate = requestedDate(date);
  const scope = branch ? normalizeScope(branch) : { type: GLOBAL_SCOPE, branch: null };
  const [{ globalRow, scopeRow }, inputs] = await Promise.all([loadRows(db, scope), loadDefaultInputs(db, effectiveDate)]);
  const defaults = validatePerformanceSettings(defaultPerformanceSettings(inputs));
  const globalScope = { type: GLOBAL_SCOPE, branch: null };
  const globalEnvelope = parseEnvelope(globalRow, globalScope);
  const globalEffective = resolveGlobal(globalEnvelope, defaults, effectiveDate);
  if (scope.type === GLOBAL_SCOPE) return { ...globalEffective, requestedScope: clone(scope), inherited: globalEffective.source === "DEFAULT" };
  return resolveBranch(parseEnvelope(scopeRow, scope), globalEnvelope, globalEffective, effectiveDate);
}

async function listBranches(db) {
  const [employeeRows, settingRows, branchConfigRow] = await Promise.all([
    db.employee?.findMany ? db.employee.findMany({ where: { branch: { not: null } }, select: { branch: true }, distinct: ["branch"], orderBy: { branch: "asc" } }) : Promise.resolve([]),
    db.systemSetting.findMany ? db.systemSetting.findMany({ where: { key: { startsWith: CONFIG_PREFIX } }, select: { key: true } }) : Promise.resolve([]),
    db.systemSetting.findUnique({ where: { key: "OPS_BRANCH_CONFIG" } }),
  ]);
  const branches = new Set((employeeRows || []).map((item) => String(item.branch || "").trim().toUpperCase()).filter(Boolean));
  (settingRows || []).forEach((row) => { const name = String(row.key || "").slice(CONFIG_PREFIX.length); if (name && name !== GLOBAL_SCOPE) branches.add(name); });
  const configuredBranch = String(parseJsonObject(branchConfigRow?.value).branchCode || "").trim().toUpperCase();
  if (/^[A-Z0-9][A-Z0-9_-]{0,79}$/.test(configuredBranch)) branches.add(configuredBranch);
  return [...branches].sort();
}

function historyFor(envelope) {
  return [
    ...envelope.publications.map((item) => ({ type: "PUBLISHED", ...clone(item) })),
    ...envelope.resets.map((item) => ({ type: "RESET", ...clone(item) })),
  ].sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom) || String(right.publishedAt || right.resetAt || "").localeCompare(String(left.publishedAt || left.resetAt || "")));
}

async function getPerformanceSettingsState(db, scopeInput = GLOBAL_SCOPE) {
  const input = scopeInput && typeof scopeInput === "object" ? scopeInput : { scope: scopeInput };
  const scope = normalizeScope(input.scope || input.branch || GLOBAL_SCOPE);
  const date = requestedDate(input.date);
  const [{ globalRow, scopeRow }, inputs, branches] = await Promise.all([loadRows(db, scope), loadDefaultInputs(db, date), listBranches(db)]);
  const defaults = validatePerformanceSettings(defaultPerformanceSettings(inputs));
  const globalScope = { type: GLOBAL_SCOPE, branch: null };
  const globalEnvelope = parseEnvelope(globalRow, globalScope);
  const envelope = scope.type === GLOBAL_SCOPE ? globalEnvelope : parseEnvelope(scopeRow, scope);
  const globalEffective = resolveGlobal(globalEnvelope, defaults, date);
  const effective = scope.type === GLOBAL_SCOPE ? { ...globalEffective, requestedScope: clone(scope), inherited: globalEffective.source === "DEFAULT" } : resolveBranch(envelope, globalEnvelope, globalEffective, date);
  return {
    scope: clone(scope),
    revision: envelope.revision,
    inherited: Boolean(effective.inherited),
    effective,
    draft: envelope.draft ? clone(envelope.draft) : null,
    history: historyFor(envelope),
    branches,
  };
}

async function loadActor(db, user) {
  const id = String(user?.id || "").trim();
  if (!id) throw serviceError("Login required", "LOGIN_REQUIRED", 401);
  const actor = await db.user.findUnique({ where: { id }, select: { id: true, role: true, active: true, employeeId: true, employee: { select: { id: true, branch: true } } } });
  if (!actor?.active) throw serviceError("Login required", "LOGIN_REQUIRED", 401);
  if (!user.profile && !["ADMIN", "MANAGER"].includes(actor.role)) throw serviceError("Permission denied", "PERMISSION_DENIED", 403);
  return actor;
}

async function configuredDefaultBranch(db) {
  const row = await db.systemSetting.findUnique({ where: { key: "OPS_BRANCH_CONFIG" } });
  const branch = String(parseJsonObject(row?.value).branchCode || "").trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{0,79}$/.test(branch) ? branch : null;
}

async function authorizePerformanceSettingsScope(db, user, scopeInput) {
  const actor = await loadActor(db, user);
  if(user.profile){const scope=scopeInput==null||String(scopeInput).trim()===''?(user.profile.allBranches?{type:GLOBAL_SCOPE,branch:null}:normalizeScope(user.profile.branches[0])):normalizeScope(scopeInput);if(!user.profile.allBranches&&(scope.type===GLOBAL_SCOPE||!user.profile.branches.includes(scope.branch)))throw serviceError('Branch access denied','BRANCH_ACCESS_DENIED',403);return {actor:{...actor,profile:user.profile,permissions:user.permissions},scope,visibleBranches:user.profile.allBranches?null:user.profile.branches};}
  const linkedBranch = String(actor.employee?.branch || "").trim().toUpperCase();
  const allowedManagerBranch = actor.role === "MANAGER" ? (linkedBranch || await configuredDefaultBranch(db)) : null;
  let scope;
  if (scopeInput == null || String(scopeInput).trim() === "") {
    if (actor.role === "ADMIN") scope = { type: GLOBAL_SCOPE, branch: null };
    else {
      if (!allowedManagerBranch) throw serviceError("Manager accounts require a linked employee branch or configured default branch", "BRANCH_ACCESS_REQUIRED", 403);
      scope = normalizeScope(allowedManagerBranch);
    }
  } else scope = normalizeScope(scopeInput);
  if (actor.role === "MANAGER") {
    if (!allowedManagerBranch || scope.type === GLOBAL_SCOPE || scope.branch !== allowedManagerBranch) throw serviceError("Managers may only access their linked employee branch or configured default branch", "BRANCH_ACCESS_DENIED", 403);
  }
  const effective = await getEffectivePerformanceSettings(db, { branch: scope.branch || undefined });
  if (!effective.value.permissions.settingsRoles.includes(actor.role)) throw serviceError("The active performance configuration does not grant this role settings access", "PERFORMANCE_SETTINGS_ROLE_DENIED", 403);
  return { actor, scope, visibleBranches: actor.role === "ADMIN" ? null : [scope.branch] };
}

async function requireIndependentPublisher(tx, actor, draft) {
  if (!draft?.createdBy) throw serviceError("The draft author is missing; save a new auditable draft before publishing", "DRAFT_AUTHOR_REQUIRED", 409);
  const contributorIds = [...new Set([draft.createdBy, draft.updatedBy || draft.createdBy].filter(Boolean))];
  const contributors = await Promise.all(contributorIds.map((id) => tx.user.findUnique({ where: { id }, select: { id: true, employeeId: true } })));
  const linkedContributors = contributorIds.map((id, index) => ({
    id,
    employeeId:
      (id === draft.createdBy ? draft.createdByEmployeeId : null)
      || (id === (draft.updatedBy || draft.createdBy) ? draft.updatedByEmployeeId : null)
      || contributors[index]?.employeeId
      || null,
  })).filter((item) => item.employeeId);
  const actorContributed = linkedContributors.some((item) => item.id === actor.id || (actor.employeeId && item.employeeId === actor.employeeId));
  if (actorContributed) {
    throw serviceError("A linked employee's draft must be published by a different authenticated settings user", "SECOND_REVIEWER_REQUIRED", 403);
  }
  const independentlyReviewed = linkedContributors.length > 0 || contributorIds.some((id) => id !== actor.id);
  return independentlyReviewed ? { id: actor.id, employeeId: actor.employeeId || null } : null;
}

function initialGlobalEnvelope(defaults, userId, now) {
  const envelope = baseEnvelope({ type: GLOBAL_SCOPE, branch: null });
  envelope.publications.push({
    id: "GLOBAL-DEFAULT-V1",
    version: 1,
    effectiveFrom: BASELINE_DATE,
    publishedAt: now,
    publishedBy: userId,
    reviewerUserId: null,
    reason: "Initial defaults materialized on first explicit write",
    baseGlobalRef: null,
    value: clone(defaults),
    systemGenerated: true,
  });
  return envelope;
}

async function writeNewSetting(tx, key, envelope, userId, description) {
  try {
    return await tx.systemSetting.create({ data: { key, value: JSON.stringify(envelope), description, updatedBy: userId } });
  } catch (error) {
    if (error?.code === "P2002") throw serviceError("Performance settings changed in another session; reload and retry", "CONFIG_CONFLICT", 409);
    throw error;
  }
}

async function replaceSetting(tx, row, key, envelope, expectedRevision, userId, description) {
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0) throw serviceError("expectedRevision is required", "EXPECTED_REVISION_REQUIRED", 422);
  if (row) {
    const current = parseEnvelope(row, envelope.scope);
    if (current.revision !== expectedRevision) throw serviceError("Performance settings changed in another session; reload and retry", "CONFIG_CONFLICT", 409);
    const updated = await tx.systemSetting.updateMany({ where: { key, value: row.value }, data: { value: JSON.stringify(envelope), description, updatedBy: userId } });
    if (updated.count !== 1) throw serviceError("Performance settings changed in another session; reload and retry", "CONFIG_CONFLICT", 409);
    return;
  }
  if (expectedRevision !== 0) throw serviceError("Performance settings changed in another session; reload and retry", "CONFIG_CONFLICT", 409);
  await writeNewSetting(tx, key, envelope, userId, description);
}

async function createAudit(tx, { action, actor, scope, reason, before, after, effectiveFrom, version, reviewerUserId }) {
  await tx.auditLog.create({ data: {
    action,
    userId: actor.id,
    summary: `${action.replaceAll("_", " ")} for ${scopeName(scope)}`,
    metadata: JSON.stringify({ scope, reason, effectiveFrom: effectiveFrom || null, version: version ?? null, reviewerUserId: reviewerUserId || null, before: before || null, after: after || null }),
  } });
}

function assertReason(reason) {
  const value = String(reason || "").trim();
  if (value.length < 5) throw serviceError("A reason of at least 5 characters is required", "REASON_REQUIRED", 422);
  return value;
}

function assertRevision(expectedRevision) {
  const revision = Number(expectedRevision);
  if (!Number.isInteger(revision) || revision < 0) throw serviceError("expectedRevision is required", "EXPECTED_REVISION_REQUIRED", 422);
  return revision;
}

function assertUnusedEffectiveDate(envelope, effectiveFrom) {
  if (envelope.publications.some((item) => item.effectiveFrom === effectiveFrom) || envelope.resets.some((item) => item.effectiveFrom === effectiveFrom)) throw serviceError("Another version already uses this effective date", "AMBIGUOUS_EFFECTIVE_DATE", 409);
}

function nextPublicationVersion(envelope) {
  return Math.max(0, ...envelope.publications.map((item) => Number(item.version) || 0)) + 1;
}

function versionCode(prefix, scope, version) {
  const scopeCode = scopeName(scope).replace(/[^A-Z0-9_-]/gi, "_").toUpperCase();
  return `${prefix}-${scopeCode}-V${version}-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

async function createPublishedBusinessVersions(tx, { scope, version, effectiveFrom, value }) {
  const settings = clone(value);
  const globallyActive = scope.type === GLOBAL_SCOPE;
  const criteriaCode = versionCode("PERF-CRITERIA", scope, version);
  const criteriaLabel = `Performance settings ${scopeName(scope)} v${version}`;
  const criteriaVersion = await tx.opsEvaluationCriteriaVersion.create({ data: {
    code: criteriaCode,
    label: criteriaLabel,
    effectiveFrom,
    effectiveTo: null,
    active: globallyActive,
    criteria: { create: settings.evaluation.criteria.map((criterion) => ({
      code: criterion.code,
      label: criterion.label,
      labelAr: criterion.labelAr || null,
      category: criterion.category,
      maxScore: criterion.maxScore,
      active: criterion.active,
      sortOrder: criterion.sortOrder,
      reasons: { create: (criterion.reasons || []).map((reason) => ({ code: reason.code, label: reason.label, labelAr: reason.labelAr || null, active: reason.active, sortOrder: reason.sortOrder })) },
    })) },
  } });

  const formulaCode = versionCode("PERF-APPRAISAL", scope, version);
  const formulaLabel = `Performance settings ${scopeName(scope)} v${version}`;
  const { formulaVersionId: ignoredFormulaId, sourceFormula: ignoredSourceFormula, ...formulaConfig } = settings.monthlyAppraisal;
  const formulaVersion = await tx.opsAppraisalFormulaVersion.create({ data: {
    code: formulaCode,
    label: formulaLabel,
    effectiveFrom,
    effectiveTo: null,
    active: globallyActive,
    configJson: JSON.stringify(formulaConfig),
  } });

  settings.evaluation.criteriaVersionId = criteriaVersion.id;
  settings.monthlyAppraisal.formulaVersionId = formulaVersion.id;
  settings.monthlyAppraisal.sourceFormula = { code: formulaCode, label: formulaLabel, effectiveFrom, effectiveTo: null, config: clone(formulaConfig.formulaParameters || {}) };
  return { settings, criteriaVersionId: criteriaVersion.id, formulaVersionId: formulaVersion.id };
}

function legacyEffective(config, { branch, date, source, criteriaVersionId, formulaVersionId }) {
  return {
    source,
    scope: branch ? { type: "BRANCH", branch } : { type: GLOBAL_SCOPE, branch: null },
    requestedScope: branch ? { type: "BRANCH", branch } : { type: GLOBAL_SCOPE, branch: null },
    publicationId: "LEGACY-BASELINE",
    version: 0,
    effectiveFrom: date,
    baseGlobalRef: null,
    inherited: !branch,
    criteriaVersionId: criteriaVersionId || config.evaluation?.criteriaVersionId || null,
    formulaVersionId: formulaVersionId || config.monthlyAppraisal?.formulaVersionId || null,
    value: config,
  };
}

async function materializeLegacySnapshots(tx, { inputs, now }) {
  const existing = await tx.systemSetting.findUnique({ where: { key: LEGACY_BASELINE_KEY } });
  if (existing) return parseJsonObject(existing.value);
  const evaluationDays = tx.opsDailyEvaluationDay?.findMany
    ? await tx.opsDailyEvaluationDay.findMany({ include: { criteriaVersion: { include: { criteria: { include: { reasons: true }, orderBy: { sortOrder: "asc" } } } } }, orderBy: { evaluationDate: "asc" } })
    : [];
  const appraisals = tx.opsMonthlyAppraisal?.findMany
    ? await tx.opsMonthlyAppraisal.findMany({ include: { formulaVersion: true, employee: { select: { branch: true } } }, orderBy: [{ year: "asc" }, { month: "asc" }, { version: "asc" }] })
    : [];

  for (const day of evaluationDays) {
    const config = validatePerformanceSettings(defaultPerformanceSettings({ criteria: day.criteriaVersion, evaluationRules: inputs.evaluationRules, appraisalFormula: inputs.appraisalFormula }));
    config.evaluation.criteriaVersionId = day.criteriaVersionId;
    await capturePerformanceSettingsSnapshot(tx, {
      kind: "EVALUATION_DAY",
      recordId: day.id,
      date: day.evaluationDate,
      configOverride: legacyEffective(config, { date: day.evaluationDate, source: "LEGACY_EVALUATION_BASELINE", criteriaVersionId: day.criteriaVersionId, formulaVersionId: config.monthlyAppraisal.formulaVersionId }),
    });
  }

  for (const appraisal of appraisals) {
    const branch = String(appraisal.employee?.branch || "").trim().toUpperCase() || null;
    const date = `${String(appraisal.year).padStart(4, "0")}-${String(appraisal.month).padStart(2, "0")}-01`;
    const config = validatePerformanceSettings(defaultPerformanceSettings({ criteria: inputs.criteria, evaluationRules: inputs.evaluationRules, appraisalFormula: appraisal.formulaVersion }));
    config.monthlyAppraisal.formulaVersionId = appraisal.formulaVersionId;
    await capturePerformanceSettingsSnapshot(tx, {
      kind: "MONTHLY_APPRAISAL",
      recordId: appraisal.id,
      branch,
      date,
      configOverride: legacyEffective(config, { branch, date, source: "LEGACY_APPRAISAL_BASELINE", criteriaVersionId: config.evaluation.criteriaVersionId, formulaVersionId: appraisal.formulaVersionId }),
    });
  }

  const plans = tx.opsSuccessionCandidate?.findMany ? await tx.opsSuccessionCandidate.findMany({ include: { employee: { select: { branch: true } } } }) : [];
  for (const plan of plans) {
    const branch = String(plan.employee?.branch || "").trim().toUpperCase() || null;
    const date = new Date(plan.createdAt).toISOString().slice(0, 10);
    const config = validatePerformanceSettings(defaultPerformanceSettings(inputs));
    await capturePerformanceSettingsSnapshot(tx, { kind: "SUCCESSION", recordId: plan.id, branch, date, configOverride: legacyEffective(config, { branch, date, source: "LEGACY_SUCCESSION_BASELINE" }) });
  }
  const marker = { schemaVersion: SCHEMA_VERSION, materializedAt: now, evaluationDays: evaluationDays.length, appraisals: appraisals.length, successionPlans: plans.length };
  await tx.systemSetting.upsert({
    where: { key: LEGACY_BASELINE_KEY },
    create: { key: LEGACY_BASELINE_KEY, value: JSON.stringify(marker), description: "Legacy performance snapshot baseline completion marker" },
    update: {},
  });
  return marker;
}

async function changePerformanceSettings(db, { user, action, scope: scopeInput, value, expectedRevision, effectiveFrom, reason, now = new Date().toISOString() } = {}) {
  const operation = String(action || "");
  if (!["saveDraft", "publish", "resetOverride"].includes(operation)) throw serviceError("Unknown performance settings action", "UNKNOWN_ACTION", 400);
  const requestedReason = assertReason(reason);
  const revision = assertRevision(expectedRevision);
  const access = await authorizePerformanceSettingsScope(db, user, scopeInput);
  const scope = access.scope;
  if (operation === "resetOverride" && scope.type === GLOBAL_SCOPE) throw serviceError("Global settings cannot be reset to an override", "INVALID_RESET", 422);
  const actionDate = operation === "saveDraft" ? null : validDate(effectiveFrom, "effectiveFrom");
  const defaultDate = actionDate || new Date(now).toISOString().slice(0, 10);
  const inputs = await loadDefaultInputs(db, defaultDate);
  const defaults = validatePerformanceSettings(defaultPerformanceSettings(inputs));

  const change = await db.$transaction(async (tx) => {
    const actorAccess = await authorizePerformanceSettingsScope(tx, user, scopeName(scope));
    const actor = actorAccess.actor;
    const globalScope = { type: GLOBAL_SCOPE, branch: null };
    let globalRow = await tx.systemSetting.findUnique({ where: { key: settingKey(globalScope) } });
    let globalEnvelope;
    if (globalRow) globalEnvelope = parseEnvelope(globalRow, globalScope);
    else {
      globalEnvelope = initialGlobalEnvelope(defaults, actor.id, now);
      globalEnvelope.revision = 1;
      globalRow = await writeNewSetting(tx, settingKey(globalScope), globalEnvelope, actor.id, "Versioned global Operations Performance & Reports configuration");
      await createAudit(tx, { action: "OPS_PERFORMANCE_DEFAULTS_MATERIALIZED", actor, scope: globalScope, reason: "Initial defaults materialized on first explicit write", before: null, after: { publicationId: globalEnvelope.publications[0].id }, effectiveFrom: BASELINE_DATE, version: 1 });
    }

    let row = scope.type === GLOBAL_SCOPE ? globalRow : await tx.systemSetting.findUnique({ where: { key: settingKey(scope) } });
    let envelope = scope.type === GLOBAL_SCOPE ? clone(globalEnvelope) : parseEnvelope(row, scope);
    if (scope.type === GLOBAL_SCOPE && !row) throw serviceError("Global settings could not be materialized", "CONFIG_CONFLICT", 409);

    const actualExpectedRevision = scope.type === GLOBAL_SCOPE && revision === 0 && globalEnvelope.revision === 1 && globalEnvelope.publications.length === 1 && globalEnvelope.publications[0].systemGenerated ? 1 : revision;
    if (envelope.revision !== actualExpectedRevision) throw serviceError("Performance settings changed in another session; reload and retry", "CONFIG_CONFLICT", 409);
    const before = { revision: envelope.revision, draft: envelope.draft ? clone(envelope.draft) : null, effective: effectiveEvent(envelope, defaultDate)?.item || null };
    let auditAction;
    let publishedVersion = null;
    let reviewer = null;

    if (operation === "saveDraft") {
      const validated = prepareNewConfiguration(value);
      const globalAtDraft = resolveGlobal(globalEnvelope, defaults, defaultDate);
      const existingDraft = envelope.draft;
      envelope.draft = {
        revision: (existingDraft?.revision || 0) + 1,
        basedOnRevision: envelope.revision,
        baseGlobalRevision: globalEnvelope.revision,
        baseGlobalRef: scope.type === GLOBAL_SCOPE ? null : { id: globalAtDraft.publicationId, version: globalAtDraft.version, effectiveFrom: globalAtDraft.effectiveFrom },
        createdBy: existingDraft?.createdBy || actor.id,
        createdByEmployeeId: existingDraft ? (existingDraft.createdByEmployeeId || null) : (actor.employeeId || null),
        updatedAt: now,
        updatedBy: actor.id,
        updatedByEmployeeId: actor.employeeId || null,
        reason: requestedReason,
        value: validated,
      };
      auditAction = "OPS_PERFORMANCE_DRAFT_SAVED";
    } else if (operation === "publish") {
      if (!envelope.draft) throw serviceError("Save a draft before publishing", "DRAFT_REQUIRED", 422);
      if (scope.type === "BRANCH" && envelope.draft.baseGlobalRevision !== globalEnvelope.revision) throw serviceError("Global settings changed after this branch draft was saved; reload and save the draft again", "GLOBAL_BASE_CHANGED", 409);
      reviewer = await requireIndependentPublisher(tx, actor, envelope.draft);
      assertUnusedEffectiveDate(envelope, actionDate);
      const validated = validatePerformanceSettings(prepareNewConfiguration(envelope.draft.value), { publishing: true });
      const legacyBaseline = await materializeLegacySnapshots(tx, { inputs, now });
      publishedVersion = nextPublicationVersion(envelope);
      const createdVersions = await createPublishedBusinessVersions(tx, { scope, version: publishedVersion, effectiveFrom: actionDate, value: validated });
      const globalAtPublication = resolveGlobal(globalEnvelope, defaults, actionDate);
      const publication = {
        id: randomUUID(),
        version: publishedVersion,
        effectiveFrom: actionDate,
        publishedAt: now,
        publishedBy: actor.id,
        reviewerUserId: reviewer?.id || null,
        draftCreatedBy: envelope.draft.createdBy,
        draftCreatedByEmployeeId: envelope.draft.createdByEmployeeId || null,
        draftUpdatedBy: envelope.draft.updatedBy || envelope.draft.createdBy,
        draftUpdatedByEmployeeId: envelope.draft.updatedByEmployeeId || null,
        reason: requestedReason,
        baseGlobalRef: scope.type === GLOBAL_SCOPE ? null : { id: globalAtPublication.publicationId, version: globalAtPublication.version, effectiveFrom: globalAtPublication.effectiveFrom },
        criteriaVersionId: createdVersions.criteriaVersionId,
        formulaVersionId: createdVersions.formulaVersionId,
        value: createdVersions.settings,
        legacyBaseline,
      };
      envelope.publications.push(publication);
      envelope.draft = null;
      auditAction = "OPS_PERFORMANCE_CONFIG_PUBLISHED";
    } else {
      if (actor.employeeId) throw serviceError("A linked employee cannot reset a scoring override without an independent approval workflow; use an unlinked settings administrator", "RESET_REVIEW_REQUIRED", 403);
      assertUnusedEffectiveDate(envelope, actionDate);
      const branchEvent = effectiveEvent(envelope, actionDate);
      if (!branchEvent || branchEvent.type !== "PUBLISHED") throw serviceError("There is no active branch override to reset on this date", "NO_ACTIVE_OVERRIDE", 422);
      const globalAtReset = resolveGlobal(globalEnvelope, defaults, actionDate);
      envelope.resets.push({
        id: randomUUID(),
        effectiveFrom: actionDate,
        resetAt: now,
        resetBy: actor.id,
        reviewerUserId: null,
        reason: requestedReason,
        baseGlobalRef: { id: globalAtReset.publicationId, version: globalAtReset.version, effectiveFrom: globalAtReset.effectiveFrom },
      });
      envelope.draft = null;
      auditAction = "OPS_PERFORMANCE_BRANCH_RESET";
    }

    envelope.revision += 1;
    const key = settingKey(scope);
    await replaceSetting(tx, row, key, envelope, actualExpectedRevision, actor.id, scope.type === GLOBAL_SCOPE ? "Versioned global Operations Performance & Reports configuration" : `Versioned ${scope.branch} Operations Performance & Reports override`);
    await createAudit(tx, {
      action: auditAction,
      actor,
      scope,
      reason: requestedReason,
      before,
      after: { revision: envelope.revision, draftRevision: envelope.draft?.revision || null, publication: envelope.publications.at(-1) || null, reset: operation === "resetOverride" ? envelope.resets.at(-1) : null },
      effectiveFrom: actionDate,
      version: publishedVersion,
      reviewerUserId: reviewer?.id,
    });
    return { action: operation, scope: clone(scope), revision: envelope.revision, version: publishedVersion };
  });

  const state = await getPerformanceSettingsState(db, { scope: scopeName(scope), date: defaultDate });
  if (access.visibleBranches) state.branches = state.branches.filter((branch) => access.visibleBranches.includes(branch));
  return { change, state };
}

function parseSnapshot(row, expected) {
  let snapshot;
  try { snapshot = JSON.parse(row.value); } catch { throw serviceError("Stored performance settings snapshot is malformed", "MALFORMED_PERFORMANCE_SNAPSHOT", 500); }
  if (!snapshot || snapshot.schemaVersion !== SCHEMA_VERSION || snapshot.kind !== expected.kind || snapshot.recordId !== expected.recordId || !snapshot.effective?.value) throw serviceError("Stored performance settings snapshot is malformed", "MALFORMED_PERFORMANCE_SNAPSHOT", 500);
  validatePerformanceSettings(snapshot.effective.value);
  return snapshot;
}

async function capturePerformanceSettingsSnapshot(tx, { kind, recordId, branch, date, configOverride } = {}) {
  const identity = snapshotKey(kind, recordId);
  const snapshotDate = requestedDate(date);
  const normalizedBranch = branch ? normalizeScope(branch).branch : null;
  let effective;
  if (configOverride) {
    if (configOverride.value) {
      validatePerformanceSettings(configOverride.value);
      effective = clone(configOverride);
    } else {
      const value = validatePerformanceSettings(configOverride);
      effective = legacyEffective(value, { branch: normalizedBranch, date: snapshotDate, source: "EXPLICIT_SNAPSHOT_OVERRIDE", criteriaVersionId: value.evaluation?.criteriaVersionId, formulaVersionId: value.monthlyAppraisal?.formulaVersionId });
    }
  } else effective = await getEffectivePerformanceSettings(tx, { branch: normalizedBranch, date: snapshotDate });
  const snapshot = {
    schemaVersion: SCHEMA_VERSION,
    kind: identity.kind,
    recordId: identity.recordId,
    branch: normalizedBranch,
    date: snapshotDate,
    capturedAt: new Date().toISOString(),
    effective,
  };
  const row = await tx.systemSetting.upsert({
    where: { key: identity.key },
    create: { key: identity.key, value: JSON.stringify(snapshot), description: `Immutable performance configuration snapshot for ${identity.kind} ${identity.recordId}` },
    update: {},
  });
  return parseSnapshot(row, identity);
}

async function readPerformanceSettingsSnapshot(db, { kind, recordId, branch, date } = {}) {
  const identity = snapshotKey(kind, recordId);
  const row = await db.systemSetting.findUnique({ where: { key: identity.key } });
  if (!row) {
    const baseline = await db.systemSetting.findUnique({ where: { key: LEGACY_BASELINE_KEY } });
    if (!baseline) return null;
    throw serviceError("This historical record has no performance configuration snapshot; run the explicit legacy snapshot migration before processing it", "PERFORMANCE_SNAPSHOT_MISSING", 409);
  }
  const snapshot = parseSnapshot(row, identity);
  if (branch && snapshot.branch !== normalizeScope(branch).branch) throw serviceError("Performance snapshot branch does not match the record", "PERFORMANCE_SNAPSHOT_MISMATCH", 409);
  if (date && snapshot.date !== validDate(date, "Snapshot date")) throw serviceError("Performance snapshot date does not match the record", "PERFORMANCE_SNAPSHOT_MISMATCH", 409);
  return snapshot;
}

module.exports = {
  CONFIG_PREFIX,
  GLOBAL_SCOPE,
  LEGACY_BASELINE_KEY,
  SNAPSHOT_PREFIX,
  authorizePerformanceSettingsScope,
  capturePerformanceSettingsSnapshot,
  changePerformanceSettings,
  getEffectivePerformanceSettings,
  getPerformanceSettingsState,
  readPerformanceSettingsSnapshot,
};
