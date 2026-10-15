const { NextResponse } = require("next/server");
const { context } = require("./context");
const { hasPermission } = require("./registry");
const { resolveScope } = require("./enforcement");
const DAILY = {
  open: "operations.create",
  generateRotation: "rotations.create",
  previewRotation: "rotations.create",
  manualAssignment: "rotations.assign",
  changeRotationCell: "rotations.assign",
  addBreak: "breaks.create",
  updateBreak: "breaks.edit",
  createTrip: "trips.create",
  updateTrip: "trips.edit",
  deleteTrip: "trips.archive",
  createEvent: "birthdays.create",
  updateEvent: "birthdays.edit",
  deleteEvent: "birthdays.archive",
  createOffer: "offers.create",
  updateOffer: "offers.edit",
  deleteOffer: "offers.archive",
  setStock: "stock.create",
  setWristband: "stock.create",
  updateStock: "stock.edit",
  setRosterBracelets: "stock.edit",
  issueStock: "stock.issue",
  deleteStock: "stock.archive",
  createNotice: "notifications.create",
  close: "operations.lock",
  reopen: "operations.unlock",
};
// Module workspaces may read these public catalogues without opening Settings.
const CATALOG_READERS = {
  OPS_PLANNING_CATALOGS: ["trips.view", "birthdays.view", "stock.view", "roster.view"],
  DAILY_OPERATIONS_TEMPLATE_CONFIG:['roster.view'],
  OPS_MOTIVATION_PHRASES:['roster.view'],
  OPS_SCHEDULE_CODE_CONFIG:['roster.view','schedules.view'],
  OPS_ROTATION_RULES:['roster.view'],
  OPS_BRANCH_CONFIG:['roster.view'],
};
function routePermission(
  path,
  method,
  body = {},
  params = new URLSearchParams(),
) {
  const read = method === "GET",
    action = String(body.action || "");
  if(path === '/api/operations/planning')return read ? {succession:'succession.view',development:'development.view',reports:'performance_reports.view'}[params.get('mode')||'succession'] || null : {createSuccession:'succession.create',createDevelopment:'development.create',updateAssignment:'development.edit',decideReadiness:'succession.edit',changeLifecycle:body.developmentId?'development.edit':'succession.edit'}[action] || null;
  if (path === "/api/employees")
    return read
      ? "employees.view"
      : method === "POST"
        ? "employees.create"
        : body.active === false
          ? "employees.archive"
          : body.active === true
            ? "employees.restore"
            : "employees.edit";
  if (path === "/api/reports/audit") return "audit.view";
  if (
    path === "/api/settings" &&
    !read &&
    !require("../operations/settings-scope").isOperationsWorkspaceSetting(
      body.key,
    )
  )
    return null;
  if (path === "/api/operations/daily")
    return read
      ? {
          trips: "trips.view",
          birthdays: "birthdays.view",
          offers: "offers.view",
          stock: "stock.view",
          reports: "reports.view",
          attendance: 'attendance.view',
          evaluation: 'evaluations.view',
          rotationEditor: 'rotations.assign',
        }[params.get("view")] || "operations.view"
      : action === "updateBreak" && body.status === "CANCELLED"
        ? "breaks.archive"
        : DAILY[action] || null;
  if (path === "/api/operations/roster") return "roster.view";
  if (path === "/api/operations/responsibilities") return read ? ["roster.view", "schedules.view"] : "rotations.assign";
  if (path.startsWith("/api/operations/schedules/imports"))
    return read ? "schedules.view" : "schedules.import";
  if (path === "/api/operations/schedules/export")
    return params.get("format") === "pdf"
      ? "schedules.pdf"
      : params.get("format") === "template"
        ? "schedules.import"
        : "schedules.export";
  if (path === "/api/operations/schedules")
    return read
      ? "schedules.view"
      : action === "deleteDraft"
        ? "schedules.archive"
        : action === "publish"
          ? "schedules.publish"
          : [
                "import",
                "previewImport",
                "applyImport",
                "restoreImport",
              ].includes(action) || body.multipartImport
            ? "schedules.import"
            : ["createBlankDraft", "createRevision"].includes(action)
              ? "schedules.create"
              : "schedules.edit";
  if (path === "/api/operations/attendance")
    return read
      ? "attendance.view"
      : /finalize|close/i.test(action)
        ? "attendance.approve"
        : /reopen|correct/i.test(action)
          ? "attendance.unlock"
          : action === "open"
            ? "attendance.create"
            : "attendance.edit";
  if (path === "/api/operations/evaluations")
    return read
      ? "evaluations.view"
      : /finalize|close/i.test(action)
        ? "evaluations.approve"
        : /reopen|correct/i.test(action)
          ? "evaluations.unlock"
          : action === "open"
            ? "evaluations.create"
            : "evaluations.edit";
  if (path === "/api/operations/leave-time")
    return read
      ? "leave.view"
      : /approve/i.test(action)
        ? "leave.approve"
        : /cancel/i.test(action)
          ? "leave.archive"
          : /reverse/i.test(action)
            ? action.includes("Overtime")
              ? "overtime.restore"
              : "leave.restore"
            : /Overtime|overtime/i.test(action + body.kind)
              ? "overtime.edit"
              : /Holiday|holiday/i.test(action + body.kind)
                ? action === "createHoliday" || body.kind === "holiday"
                  ? "holidays.create"
                  : "holidays.edit"
                : action === "createBooking"
                  ? "leave.create"
                  : "leave.edit";
  if (path === "/api/operations/performance") {
    if (read)
      return (
        {
          eotm: "eom.view",
          succession: "succession.view",
          reports: "reports.view",
          hall: "hall.view",
        }[params.get("section")] || "appraisals.view"
      );
    if(action === "successionDevelopment")return "development.edit";
    if (action.startsWith("succession"))
      return action === "successionCreate"
        ? "succession.create"
        : "succession.edit";
    if (action.startsWith("appraisal"))
      return ['appraisalCalculate','appraisalRefresh'].includes(action)
        ? "appraisals.create"
        : /Approve/.test(action)
          ? "appraisals.approve"
          : "appraisals.edit";
    return action === "eotmLock"
      ? "eom.lock"
      : action === "eotmReopen"
        ? "eom.unlock"
        : action === "eotmCreate"
          ? "eom.create"
          : "eom.edit";
  }
  if (path === "/api/operations/performance-jobs")
    return read ? "appraisals.view" : "appraisals.approve";
  if (path === "/api/operations/recognition")
    return params.get("kind") === "hall" ? "hall.view" : "eom.view";
  if (path.includes("/employees/") && path.endsWith("/complete-file"))
    return params.get("inline") === "1"
      ? ["employees.pdf", "employees.print"]
      : "employees.pdf";
  if (path.includes("/employees/") && path.includes("/documents/"))
    return read ? "files.download" : "files.archive";
  if (path.includes("/employees/") && path.endsWith("/documents"))
    return "files.upload";
  if (path.includes("/employees/"))
    return read
      ? "employees.details"
      : method === "DELETE"
        ? "employees.archive"
        : action === "restoreEmployee"
          ? "employees.restore"
      : action === "training"
        ? "competencies.create"
        : action === "qualification"
          ? "competencies.edit"
          : action === "addQualification"
            ? "competencies.create"
            : action === "setQualification"
              ? "competencies.edit"
              : action === "employmentEvent" &&
                  ["BRANCH_TRANSFER", "SUPERVISOR_CHANGE"].includes(
                    body.eventType,
                  )
                ? "employees.assign"
                : "employees.edit";
  if (path === "/api/operations/employees") return "employees.view";
  if (path.startsWith("/api/operations/reports/files"))
    return read ? "reports.download" : "reports.upload";
  if (path === "/api/operations/reports")
    return read
      ? "reports.view"
      : /approve|reject|^review$/i.test(action)
        ? "reports.approve"
        : action === "lock"
          ? "reports.lock"
          : action === "reopen"
            ? "reports.unlock"
            : action === "create"
              ? "reports.create"
              : action === "calculateSuitability"
                ? "succession.edit"
                : "reports.edit";
  if (path === "/api/operations/performance-settings")
    return read
      ? "settings.view"
      : action === "publish"
        ? "settings.configure"
        : "settings.configure";
  if (path === "/api/operations/config" && !read) {
    const actions = {
      savePartner: body.partnerId ? "trips.edit" : "trips.create",
      deletePartner: "trips.archive",
      saveCustomer: body.customerId ? "birthdays.edit" : "birthdays.create",
      deleteCustomer: "birthdays.archive",
      saveOperationalName: "employees.edit",
      saveNotice: body.noticeId ? "notifications.edit" : "notifications.create",
      deleteNotice: "notifications.archive",
      restoreNotice: "notifications.restore",
      saveShift: "settings.configure",
      savePosition: "settings.configure",
      saveRequirement: "settings.configure",
      saveDistributions: "settings.configure",
    };
    return actions[action] || null;
  }
  if (path === "/api/operations/settings" && read) {
    const keys = (params.get("keys") || "").split(",").filter(Boolean);
    if(keys.length&&keys.every(key=>CATALOG_READERS[key])){
      const permissions=CATALOG_READERS[keys[0]].filter(permission=>keys.every(key=>CATALOG_READERS[key].includes(permission)));
      if(permissions.length)return permissions;
    }
  }
  if (
    path === "/api/settings" ||
    path === "/api/operations/settings" ||
    path === "/api/operations/config"
  )
    return read
      ? "settings.view"
      : body.key?.includes("TEMPLATE") || body.key?.includes("ARTWORK")
        ? "editors.templates"
        : body.key === "OPS_DASHBOARD_UI_CONFIG"
          ? "appearance.configure"
          : body.key === "OPS_BRANCH_CONFIG"
            ? "branches.configure"
            : "settings.configure";
  if (path === "/api/operations/summary") return "dashboard.view";
  if (path === "/api/operations/health") return "backups.view";
  if (path === "/api/operations/recommendations") return "succession.view";
  return null;
}
function withAccountAccess(handler, { legacyShared = false } = {}) {
  return async (request, ...rest) => {
    const { getCurrentUser } = require("../auth");
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json(
        { success: false, error: "Login required" },
        { status: 401 },
      );
    if (user.profile.forcePasswordChange)
      return NextResponse.json(
        { success: false, error: "Change your password before continuing" },
        { status: 428 },
      );
    if (legacyShared && !["ADMIN", "MANAGER"].includes(user.role))
      return handler(request, ...rest);
    const url = new URL(request.url);
    if (
      request.method !== "GET" &&
      !require("./http").sameOriginRequest(request)
    )
      return NextResponse.json(
        { success: false, error: "Cross-origin changes are not allowed" },
        { status: 403 },
      );
    let body = {};
    if (
      request.method !== "GET" &&
      request.headers.get("content-type")?.includes("application/json")
    )
      try {
        body = await request.clone().json();
        if (!body || typeof body !== "object" || Array.isArray(body))
          return NextResponse.json(
            { success: false, error: "A JSON object is required" },
            { status: 400 },
          );
      } catch {
        return NextResponse.json(
          { success: false, error: "Invalid JSON body" },
          { status: 400 },
        );
      }
    if (
      request.headers.get("content-type")?.includes("multipart/form-data") &&
      url.pathname === "/api/operations/schedules"
    )
      body = { multipartImport: true };
    const requestedPermission = routePermission(
      url.pathname,
      request.method,
      body,
      url.searchParams,
    );
    const permission = Array.isArray(requestedPermission)
      ? requestedPermission.find((key) => hasPermission(user, key))
      : requestedPermission;
    if (!permission || !hasPermission(user, permission))
      return NextResponse.json(
        { success: false, error: "Permission denied", permission },
        { status: 403 },
      );
    try {
      const { basePrisma } = require("../db");
      const scope = await resolveScope(basePrisma, user, permission);
      const employeeId = url.pathname.match(/\/employees\/([^/]+)/)?.[1];
      const needsSensitive =
        employeeId &&
        (url.pathname.endsWith("/complete-file") ||
          ["guestFeedback", "guidance", "incident", "incidentUpdate"].includes(
            body.action,
          ) ||
          [
            "nationalId",
            "phone",
            "address",
            "dateOfBirth",
            "emergencyName",
            "emergencyPhone",
            "emergencyRelation",
            "personalNotes",
          ].some((key) => Object.hasOwn(body, key)));
      if (needsSensitive) {
        if (!hasPermission(user, "employees.sensitive"))
          return NextResponse.json(
            {
              success: false,
              error: "Sensitive employee permission is required",
            },
            { status: 403 },
          );
        const sensitiveScope = await resolveScope(
          basePrisma,
          user,
          "employees.sensitive",
        );
        if (
          !sensitiveScope.unrestricted &&
          !sensitiveScope.employeeIds.includes(employeeId)
        )
          return NextResponse.json(
            {
              success: false,
              error:
                "Sensitive employee information is outside your access scope",
            },
            { status: 403 },
          );
      }
      if (url.pathname.includes("/employees/") && request.method === "PATCH") {
        if (
          [
            "nationalId",
            "phone",
            "address",
            "dateOfBirth",
            "emergencyName",
            "emergencyPhone",
            "emergencyRelation",
            "personalNotes",
          ].some((key) => Object.hasOwn(body, key)) &&
          !hasPermission(user, "employees.sensitive")
        )
          return NextResponse.json(
            {
              success: false,
              error: "Sensitive employee permission is required",
            },
            { status: 403 },
          );
        if (
          ["branch", "supervisorId"].some((key) => Object.hasOwn(body, key)) &&
          !hasPermission(user, "employees.assign")
        )
          return NextResponse.json(
            {
              success: false,
              error: "Employee assignment permission is required",
            },
            { status: 403 },
          );
      }
      if (
        url.pathname.includes("/employees/") &&
        url.pathname.endsWith("/complete-file") &&
        !hasPermission(user, "employees.sensitive")
      )
        return NextResponse.json(
          {
            success: false,
            error: "Sensitive employee file permission is required",
          },
          { status: 403 },
        );
      if (!scope.unrestricted) {
        const requested = String(
          body.branch || url.searchParams.get("branch") || "",
        ).toUpperCase();
        if (requested && !scope.branches.includes(requested))
          return NextResponse.json(
            { success: false, error: "Branch access denied" },
            { status: 403 },
          );
        if (
          ["OWN", "TEAM"].includes(scope.recordScope) &&
          request.method !== "GET" &&
          !(permission === 'rotations.assign' && body.action === 'changeRotationCell') &&
          ["operations", "schedules", "rotations", "eom"].includes(
            permission.split(".")[0],
          )
        )
          return NextResponse.json(
            {
              success: false,
              error: "This shared action requires branch scope",
            },
            { status: 403 },
          );
        if (
          ["attendance.approve", "evaluations.approve"].includes(permission) &&
          body.dayId
        ) {
          const records = await (
            permission === "attendance.approve"
              ? basePrisma.opsAttendanceRecord
              : basePrisma.opsEmployeeDailyEvaluation
          ).findMany({
            where:
              permission === "attendance.approve"
                ? { attendanceDayId: body.dayId }
                : { dailyEvaluationDayId: body.dayId },
            select: { employeeId: true },
          });
          if (
            records.some(
              (record) => !scope.employeeIds.includes(record.employeeId),
            )
          )
            return NextResponse.json(
              {
                success: false,
                error:
                  "This shared day contains records outside your access scope",
              },
              { status: 403 },
            );
        }
      }
      const response = await context.run(scope, () =>
        handler(request, ...rest),
      );
      const needsReportEvidenceFilter = ["/api/operations/evaluations", "/api/operations/performance", "/api/operations/recommendations"].includes(url.pathname) || (url.pathname === '/api/operations/reports' && body.action === 'calculateSuitability') || /\/employees\/[^/]+\/360$/.test(url.pathname);
      const needsWorkspaceFilter = (request.method === "GET" &&
          [
            "/api/operations/daily",
            "/api/operations/performance",
            "/api/operations/leave-time",
            "/api/operations/employees",
          ].includes(url.pathname)) || /\/employees\/[^/]+(?:\/360)?$/.test(url.pathname);
      if (response.ok && (needsWorkspaceFilter || needsReportEvidenceFilter)) {
        const payload = await response.json();
        const filtered = await context.run(scope, async () => {
          const workspace = needsWorkspaceFilter ? await require("./payload").filterWorkspacePayload(basePrisma, user, url.pathname, payload) : payload;
          const branch = typeof payload.branch === 'string' ? payload.branch : payload.branch?.branchCode || payload.employee?.branch || body.branch || url.searchParams.get('branch') || undefined;
          return needsReportEvidenceFilter ? require('../operations/report-evidence-access').redactReportEvidence(basePrisma, user, workspace, { branch }) : workspace;
        });
        return NextResponse.json(filtered, {
          status: response.status,
          headers: { "Cache-Control": "private, no-store" },
        });
      }
      return response;
    } catch (error) {
      if (error.status)
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status },
        );
      throw error;
    }
  };
}
module.exports = { routePermission, withAccountAccess, DAILY };
