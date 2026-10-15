const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const { canAssign } = require("../lib/operations/live-daily");
const { tripIdentity } = require("../lib/operations/trip-identity");

test("required qualifications fail closed, respect dates and reject training/restrictions", () => {
  const position = { id: "p", requiresQualification: true };
  const args = { employeeId: "e", position, workDate: "2026-09-29" };
  assert.equal(canAssign({ ...args, qualifications: [] }), false);
  for (const status of ["TRAINING", "RESTRICTED", "NOT_QUALIFIED", "EXPIRED"]) assert.equal(canAssign({ ...args, qualifications: [{ employeeId: "e", operationalPositionId: "p", status }] }), false);
  const qualified = { employeeId: "e", operationalPositionId: "p", status: "QUALIFIED", expiryDate: "2026-09-28" };
  assert.equal(canAssign({ ...args, qualifications: [qualified] }), false);
  assert.equal(canAssign({ ...args, qualifications: [{ ...qualified, expiryDate: "2026-09-29" }] }), true);
});

test("database guards reject overlaps/duplicate trips while preserving historical rows", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE OpsRotationAssignment(id TEXT,rotationPlanId TEXT,employeeId TEXT,operationalPositionId TEXT,startTime TEXT,endTime TEXT); CREATE TABLE OpsDailyTrip(id TEXT,branch TEXT,workDate TEXT,startTime TEXT,name TEXT,status TEXT)");
    const add = db.prepare("INSERT INTO OpsRotationAssignment VALUES (?,?,?,?,?,?)");
    add.run("a", "plan", "employee1", "drop", "10:00", "11:00");
    add.run("historical", "old", "employee1", "drop", "10:00", "11:00");
    add.run("historical2", "old", "employee2", "drop", "10:00", "11:00");
    db.exec(fs.readFileSync("prisma/sqlite-migrations/001_operations_integrity.sql", "utf8"));
    assert.throws(() => add.run("b", "plan", "employee2", "drop", "10:30", "11:30"), /overlaps/);
    assert.throws(() => add.run("b", "plan", "employee1", "tower", "10:30", "11:30"), /overlaps/);
    add.run("b", "plan", "employee2", "drop", "11:00", "12:00");
    assert.throws(() => db.exec("UPDATE OpsRotationAssignment SET startTime='10:30' WHERE id='b'"), /overlaps/);
    assert.equal(db.prepare("SELECT count(*) n FROM OpsRotationAssignment WHERE rotationPlanId='old'").get().n, 2);
    const trip = db.prepare("INSERT INTO OpsDailyTrip VALUES (?,?,?,?,?,?)");
    trip.run("1", "MOT", "2026-09-29", "09:00", "School", "PLANNED");
    assert.throws(() => trip.run("2", "MOT", "2026-09-29", "09:00", " school ", "PLANNED"), /already exists/);
    trip.run("2", "MOT", "2026-09-29", "10:00", "School", "PLANNED");
    trip.run("3", "MOT", "2026-09-29", "09:00", "Different school", "PLANNED");
    assert.throws(() => db.exec("UPDATE OpsDailyTrip SET startTime='09:00' WHERE id='2'"), /already exists/);
    assert.equal(tripIdentity("  Al   Salam "), tripIdentity("al salam"));
  } finally { db.close(); }
});
