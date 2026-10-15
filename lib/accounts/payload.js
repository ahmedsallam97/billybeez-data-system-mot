const { resolveScope } = require("./enforcement");
// Composite workspaces share endpoints, but grants and record scopes do not.
async function filterWorkspacePayload(db, user, path, payload) {
  const scopeFor = (key) =>
    user.permissions[key] ? resolveScope(db, user, key) : null;
  const filter = async (items, key) => {
    const scope = await scopeFor(key);
    if (!scope) return [];
    if (scope.unrestricted) return items || [];
    return (items || []).filter(
      (item) =>
        (!item.branch || scope.branches.includes(item.branch)) &&
        (!item.employeeId || scope.employeeIds.includes(item.employeeId)) &&
        (!item.employee?.id || scope.employeeIds.includes(item.employee.id)),
    );
  };
  if (path === "/api/operations/daily") {
    const suppliedKeys=new Set(Object.keys(payload));
    payload.trips = await filter(payload.trips, "trips.view");
    payload.events = await filter(payload.events, "birthdays.view");
    payload.offers = await filter(payload.offers, "offers.view");
    payload.offerCatalog = await filter(payload.offerCatalog, "offers.view");
    payload.wristbands = await filter(payload.wristbands, "stock.view");
    payload.notices = await filter(payload.notices, "notifications.view");
    payload.tripPartners = await filter(payload.tripPartners, "trips.details");
    payload.birthdayCustomers = await filter(
      payload.birthdayCustomers,
      "birthdays.details",
    );
    if (!user.permissions["trips.details"])
      payload.trips = payload.trips.map(
        ({ supervisorPhone, supervisorName, notes, ...item }) => item,
      );
    if (!user.permissions["birthdays.details"])
      payload.events = payload.events.map(
        ({ parentPhone, parentName, notes, ...item }) => item,
      );
    if (!user.permissions["attendance.view"]) {
      payload.attendanceDay = null;
      payload.team = (payload.team || []).map(
        ({
          actualIn,
          actualOut,
          lateMinutes,
          earlyLeaveMinutes,
          note,
          ...item
        }) => item,
      );
    }
    if (!user.permissions["rotations.view"]) {
      payload.rotation = null;
      payload.qualifications = [];
      payload.coverage = [];
    }
    if (!user.permissions["breaks.view"] && payload.rotation)
      payload.rotation = { ...payload.rotation, breaks: [] };
    if (!user.permissions["audit.view"]) payload.timeline = [];
    // Module-specific responses must stay narrow after scope filtering.
    for(const key of Object.keys(payload))if(!suppliedKeys.has(key))delete payload[key];
  }
  if (path === "/api/operations/performance") {
    payload.appraisals = await filter(payload.appraisals, "appraisals.view");
    if(payload.dailySummaries)payload.dailySummaries=await filter(payload.dailySummaries,'appraisals.view');
    payload.previousAppraisals = await filter(
      payload.previousAppraisals,
      "appraisals.view",
    );
    payload.succession = await filter(payload.succession, "succession.view");
    const scope = await scopeFor("eom.view");
    payload.competitions = scope
      ? (payload.competitions || [])
          .map((c) => {
            if (scope.unrestricted) return c;
            const candidates = (c.candidates || []).filter((candidate) =>
              scope.employeeIds.includes(candidate.employeeId),
            );
            return {
              ...c,
              candidates,
              winner: scope.employeeIds.includes(c.winnerEmployeeId)
                ? c.winner
                : null,
              winnerEmployeeId: scope.employeeIds.includes(c.winnerEmployeeId)
                ? c.winnerEmployeeId
                : null,
            };
          })
          .filter((c) => scope.unrestricted || c.candidates.length)
      : [];
  }
  if (path === "/api/operations/leave-time") {
    if (!user.permissions["overtime.view"])
      payload.employees = (payload.employees || []).map(
        ({ overtime, overtimeTransactions, ...item }) => ({
          ...item,
          overtime: {
            totalHours: null,
            availableDays: null,
            remainingHours: null,
          },
          overtimeTransactions: [],
        }),
      );
    if (!user.permissions["holidays.view"]) payload.holidays = [];
  }
  if (/\/employees\/[^/]+(?:\/360)?$/.test(path) && payload.employee) {
    let employee = payload.employee;
    const sensitiveScope = await scopeFor("employees.sensitive");
    const sensitiveAllowed = Boolean(
      sensitiveScope &&
        (sensitiveScope.unrestricted ||
          sensitiveScope.employeeIds.includes(employee.id)),
    );
    if (!sensitiveAllowed) {
      const safe = [
        "id",
        "name",
        "nameAr",
        "nameEn",
        "operationalName",
        "hrisNumber",
        "localEmployeeCode",
        "branch",
        "department",
        "jobTitle",
        "employmentType",
        "employmentStatus",
        "active",
        "gender",
        "hireDate",
        "joinDate",
      ];
      const collections = [
        "documents",
        "trainingRecords",
        "qualifications",
        "scheduleAssignments",
        "attendanceRecords",
        "dailyEvaluations",
        "monthlyAppraisals",
        "recognition",
        "succession",
        "leaveAccounts",
        "overtimeTransactions",
        "operationalPositions",
        "photo",
        "timeline",
        "sectionPermissions",
        "operationalEvidence",
      ];
      employee = Object.fromEntries(
        Object.entries(employee).filter(
          ([key]) => safe.includes(key) || collections.includes(key),
        ),
      );
      for (const field of [
        "employmentPeriods",
        "employmentEvents",
        "assignments",
        "weeklyOffPatterns",
        "guestFeedback",
        "guidanceRecords",
        "incidents",
      ])
        employee[field] = [];
    }
    const sections = {
      documents: "files.view",
      photo: "files.download",
      trainingRecords: "competencies.view",
      qualifications: "competencies.view",
      scheduleAssignments: "schedules.view",
      attendanceRecords: "attendance.view",
      dailyEvaluations: "evaluations.view",
      monthlyAppraisals: "appraisals.view",
      recognition: "eom.view",
      succession: "succession.view",
      leaveAccounts: "leave.view",
      overtimeTransactions: "overtime.view",
      operationalEvidence: "reports.view",
    };
    let all = sensitiveAllowed;
    for (const [field, key] of Object.entries(sections)) {
      const scope = await scopeFor(key);
      const allowed =
        scope &&
        (scope.unrestricted || scope.employeeIds.includes(employee.id));
      if (!allowed) {
        employee[field] = field === "photo" ? null : [];
        all = false;
      }
    }
    if (!all) employee.timeline = [];
    const overtimeScope = await scopeFor("overtime.view");
    if (
      !overtimeScope ||
      (!overtimeScope.unrestricted &&
        !overtimeScope.employeeIds.includes(employee.id))
    )
      delete employee.overtimeMinutes;
    payload.employee = employee;
  }
  if (path === "/api/operations/employees") {
    const sensitiveScope=await scopeFor('employees.sensitive');
    payload.employees=(payload.employees||[]).map(row=>{
      if(sensitiveScope&&(sensitiveScope.unrestricted||sensitiveScope.employeeIds.includes(row.id)))return row;
      const {nationalIdMasked,counts,...employee}=row;return employee;
    });
  }
  return payload;
}
module.exports = { filterWorkspacePayload };
