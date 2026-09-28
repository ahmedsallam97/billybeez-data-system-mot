const test = require("node:test");
const assert = require("node:assert/strict");
const { manualAppraisalMeta, manualAppraisalSnapshots, normalizeManualAppraisalRows } = require("../lib/operations/manual-appraisal");

test("manual appraisal rows require unique employees and valid scores", () => {
  assert.deepEqual(normalizeManualAppraisalRows([{ employeeId: "employee-1", totalScore: "575" }]), [{ employeeId: "employee-1", totalScore: 575 }]);
  assert.throws(() => normalizeManualAppraisalRows([]), /at least one/);
  assert.throws(() => normalizeManualAppraisalRows([{ employeeId: "employee-1", totalScore: -1 }]), /between 0 and 10000/);
  assert.throws(() => normalizeManualAppraisalRows([{ employeeId: "employee-1", totalScore: 1 }, { employeeId: "employee-1", totalScore: 2 }]), /twice/);
});

test("manual appraisal snapshots retain the prior score and expose their source", () => {
  const snapshot = manualAppraisalSnapshots({ totalScore: 410, reason: "Imported from the signed historical sheet", userId: "manager-1", priorAppraisal: { id: "old", version: 2, totalScore: 390 } });
  const source = JSON.parse(snapshot.sourceSnapshotJson);
  assert.deepEqual({ source: source.source, reason: source.reason, previousAppraisalId: source.previousAppraisalId, previousVersion: source.previousVersion, previousScore: source.previousScore }, { source: "MANUAL_OVERRIDE", reason: "Imported from the signed historical sheet", previousAppraisalId: "old", previousVersion: 2, previousScore: 390 });
  assert.deepEqual(manualAppraisalMeta({ sourceSnapshotJson: snapshot.sourceSnapshotJson }), { entryMode: "MANUAL", manualReason: "Imported from the signed historical sheet" });
  assert.deepEqual(manualAppraisalMeta({ sourceSnapshotJson: "not-json" }), { entryMode: "CALCULATED", manualReason: "" });
});
