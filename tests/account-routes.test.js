const test = require("node:test"),
  assert = require("node:assert/strict");
const { routePermission } = require("../lib/accounts/routes");
const { OPERATIONS_PERMISSIONS } = require("../lib/accounts/registry");
const { filterWorkspacePayload } = require("../lib/accounts/payload");
const { sameOriginRequest } = require("../lib/accounts/http");
const { verifyData } = require("../lib/accounts/enforcement");
const { reportPermission } = require("../lib/accounts/registry");
test("canonical permissions distinguish meaningful API actions and deny unknown Operations actions", () => {
  const cases = [
    ["/api/operations/daily", "POST", {action:"changeRotationCell"}, "rotations.assign"],
    [
      "/api/operations/daily",
      "POST",
      { action: "generateRotation" },
      "rotations.create",
    ],
    ["/api/operations/daily", "POST", { action: "unknown" }, null],
    [
      "/api/operations/config",
      "POST",
      { action: "saveCustomer" },
      "birthdays.create",
    ],
    [
      "/api/operations/config",
      "POST",
      { action: "saveCustomer", customerId: "a" },
      "birthdays.edit",
    ],
    [
      "/api/operations/config",
      "POST",
      { action: "deletePartner" },
      "trips.archive",
    ],
    ["/api/operations/config", "POST", { action: "unknown" }, null],
    [
      "/api/operations/config",
      "POST",
      { action: "deleteNotice" },
      "notifications.archive",
    ],
    [
      "/api/operations/config",
      "POST",
      { action: "restoreNotice" },
      "notifications.restore",
    ],
    [
      "/api/operations/schedules",
      "POST",
      { action: "deleteDraft" },
      "schedules.archive",
    ],
    ["/api/operations/reports", "POST", { action: "lock" }, "reports.lock"],
    ["/api/operations/reports", "POST", { action: "reopen" }, "reports.unlock"],
    [
      "/api/operations/leave-time",
      "POST",
      { action: "createHoliday" },
      "holidays.create",
    ],
    [
      "/api/operations/leave-time",
      "POST",
      { action: "reconcileHoliday" },
      "holidays.edit",
    ],
    [
      "/api/operations/daily",
      "POST",
      { action: "updateBreak", status: "CANCELLED" },
      "breaks.archive",
    ],
    [
      "/api/operations/employees/id/360",
      "POST",
      { action: "employmentEvent", eventType: "BRANCH_TRANSFER" },
      "employees.assign",
    ],
    [
      "/api/operations/employees/id/360",
      "POST",
      { action: "training" },
      "competencies.create",
    ],
    ["/api/operations/employees/id/360", "GET", {}, "employees.details"],
    [
      "/api/operations/attendance",
      "POST",
      { action: "save" },
      "attendance.edit",
    ],
    [
      "/api/operations/attendance",
      "POST",
      { action: "finalize" },
      "attendance.approve",
    ],
    [
      "/api/operations/evaluations",
      "POST",
      { action: "correct" },
      "evaluations.unlock",
    ],
    [
      "/api/operations/schedules",
      "POST",
      { multipartImport: true },
      "schedules.import",
    ],
  ];
  for (const [path, method, body, expected] of cases) {
    const key = routePermission(path, method, body);
    assert.equal(key, expected);
    if (key) assert(OPERATIONS_PERMISSIONS.some((p) => p.key === key));
  }
  assert.equal(
    routePermission(
      "/api/operations/schedules/export",
      "GET",
      {},
      new URLSearchParams("format=pdf"),
    ),
    "schedules.pdf",
  );
  assert.equal(
    routePermission(
      "/api/operations/performance",
      "GET",
      {},
      new URLSearchParams("section=eotm"),
    ),
    "eom.view",
  );
});
test("nested relation arrays and both upsert branches cannot bypass employee scope", async () => {
  const scope = {
    unrestricted: false,
    employeeIds: ["inside"],
    branches: ["MOT"],
    scheduleIds: [],
  };
  const db = {
    employee: {
      findFirst: async ({ where }) => {
        const id = (where.AND?.[0] || where).id;
        return id === "inside" ? { id } : where.AND ? null : { id };
      },
    },
  };
  await assert.rejects(
    verifyData(
      db,
      "User",
      { employee: { connect: [{ id: "inside" }, { id: "outside" }] } },
      scope,
    ),
    /Related record access/,
  );
  await assert.rejects(
    verifyData(
      db,
      "User",
      {
        employee: {
          upsert: {
            where: { id: "inside" },
            create: { branch: "MOT" },
            update: { branch: "OUTSIDE" },
          },
        },
      },
      scope,
    ),
    /Branch access/,
  );
  await assert.rejects(
    verifyData(
      db,
      "User",
      {
        employee: {
          update: [{ where: { id: "outside" }, data: { name: "Forbidden" } }],
        },
      },
      scope,
    ),
    /Related record access/,
  );
  await verifyData(
    db,
    "User",
    { employee: { connect: [{ id: "inside" }] } },
    scope,
  );
});
test('report module grants are required even when shared report permission is present',async()=>{
 const {assertReportModuleAccess}=require('../lib/operations/operational-report-service');
 const actor={profile:{allBranches:true,dataScope:'ALL'},permissions:{'reports.create':'ALL','reports.view':'ALL'}};
 await assert.rejects(assertReportModuleAccess({},actor,{reportType:'TRIP'},'create'),/Permission denied/);
 await assert.rejects(assertReportModuleAccess({},actor,{reportType:'SHIFT_LEADERSHIP'},'view'),/Permission denied/);
});
test("report-type actions map to the actual Trip, Birthday and Shift Leadership modules", () => {
  assert.equal(reportPermission("TRIP", "approve"), "trips.approve");
  assert.equal(reportPermission("BIRTHDAY", "upload"), "birthdays.upload");
  assert.equal(
    reportPermission("SHIFT_LEADERSHIP", "download"),
    "leadership.download",
  );
  assert.equal(reportPermission("TRIP", "print"), null);
  assert(
    !OPERATIONS_PERMISSIONS.some((p) =>
      ["backups.restore", "appraisals.export", "operations.approve"].includes(
        p.key,
      ),
    ),
  );
});
test("composite workspaces redact denied modules and sensitive Employee 360 fields while retaining usable arrays", async () => {
  const user = {
    permissions: {
      "employees.details": "ALL",
      "competencies.view": "ALL",
      "trips.view": "ALL",
    },
    profile: { dataScope: "ALL", allBranches: true },
  };
  const payload = await filterWorkspacePayload(
    {},
    user,
    "/api/operations/daily",
    {
      trips: [
        {
          name: "Trip",
          supervisorPhone: "secret",
          supervisorName: "secret",
          notes: "private",
        },
      ],
      events: [{ parentPhone: "secret" }],
      wristbands: [{ quantity: 4 }],
      rotation: { breaks: [] },
      timeline: [{}],
    },
  );
  assert.equal(payload.trips[0].name, "Trip");
  assert.equal(payload.trips[0].supervisorPhone, undefined);
  assert.deepEqual(payload.events, []);
  assert.deepEqual(payload.wristbands, []);
  assert.equal(payload.rotation, null);
  const employee = (
    await filterWorkspacePayload(
      {},
      user,
      "/api/operations/employees/one/360",
      {
        employee: {
          id: "one",
          name: "Employee",
          nationalId: "secret",
          phone: "secret",
          documents: [{}],
          trainingRecords: [{ name: "Safety" }],
          qualifications: [],
          attendanceRecords: [{}],
          monthlyAppraisals: [{}],
          photo: { id: "photo" },
          recognition: [{}],
          incidents: [{}],
          timeline: [{}],
          overtimeMinutes: 60,
        },
      },
    )
  ).employee;
  assert.equal(employee.name, "Employee");
  assert.equal(employee.nationalId, undefined);
  assert.equal(employee.phone, undefined);
  assert.deepEqual(employee.trainingRecords, [{ name: "Safety" }]);
  assert.deepEqual(employee.documents, []);
  assert.deepEqual(employee.monthlyAppraisals, []);
  assert.deepEqual(employee.incidents, []);
  assert.equal(employee.photo, null);
  assert.deepEqual(employee.timeline, []);
  assert.equal(employee.overtimeMinutes, undefined);
  const list = await filterWorkspacePayload(
    {},
    user,
    "/api/operations/employees",
    {
      employees: [
        {
          id: "one",
          name: "Employee",
          nationalIdMasked: "secret",
          counts: { monthlyAppraisals: 1 },
        },
      ],
    },
  );
  assert.deepEqual(list.employees, [{ id: "one", name: "Employee" }]);
});
test("mutation origin validation accepts the actual browser host and rejects foreign origins", () => {
  const req = (origin) =>
    new Request("http://localhost:3008/api/account", {
      method: "PATCH",
      headers: { Host: "127.0.0.1:3008", Origin: origin },
    });
  assert(sameOriginRequest(req("http://127.0.0.1:3008")));
  assert(!sameOriginRequest(req("https://evil.invalid")));
  assert(!sameOriginRequest(req("null")));
});

test("permission controls are imported in every Operations workspace that renders them", () => {
  const fs = require("node:fs"),
    B = require("next/dist/compiled/babel/bundle"),
    parser = B.parser(),
    traverse = B.traverse().default;
  const files = require("node:child_process")
    .execFileSync("rg", ["--files", "app", "-g", "*.jsx"], { encoding: "utf8" })
    .trim()
    .split(/\r?\n/);
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    if (!source.includes("PermissionButton")) continue;
    traverse(parser.parse(source, { sourceType: "module", plugins: ["jsx"] }), {
      JSXIdentifier(path) {
        if (
          [
            "PermissionButton",
            "PermissionSection",
            "PermissionFieldset",
          ].includes(path.node.name)
        )
          assert(
            path.scope.hasBinding(path.node.name),
            file +
              ":" +
              path.node.loc.start.line +
              " missing " +
              path.node.name,
          );
      },
    });
  }
});
test("every Operations API method is wrapped by the canonical account guard",()=>{
 const fs=require('node:fs'),parser=require('next/dist/compiled/babel/bundle').parser();
 const files=require('node:child_process').execFileSync('rg',['--files','app/api/operations','-g','route.js'],{encoding:'utf8'}).trim().split(/\r?\n/);
 assert(files.length>=26);
 for(const file of files){
  const ast=parser.parse(fs.readFileSync(file,'utf8'),{sourceType:'module'});
  for(const entry of ast.program.body.filter(node=>node.type==='ExportNamedDeclaration')){
   const declaration=entry.declaration;
   if(declaration?.type==='FunctionDeclaration'&&/^(GET|POST|PUT|PATCH|DELETE)$/.test(declaration.id?.name))assert.fail(file+': unwrapped '+declaration.id.name);
   for(const item of declaration?.declarations||[])if(/^(GET|POST|PUT|PATCH|DELETE)$/.test(item.id?.name)){
    assert.equal(item.init?.type,'CallExpression',file+': '+item.id.name);
    assert.equal(item.init?.callee?.name,'withAccountAccess',file+': '+item.id.name);
   }
  }
 }
});
test('employee deletion and restoration have separate canonical grants', () => {
  assert.equal(routePermission('/api/operations/employees/employee-id', 'DELETE'), 'employees.archive');
  assert.equal(routePermission('/api/operations/employees/employee-id', 'PATCH', { action: 'restoreEmployee' }), 'employees.restore');
});
