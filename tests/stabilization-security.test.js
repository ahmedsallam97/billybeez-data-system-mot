const test = require("node:test");
const assert = require("node:assert/strict");
const { publicSettings, settingAuditValue } = require("../lib/settings-public");
const { evaluationReviewState } = require("../lib/operations/evaluation-review");
const { consumeLoginAttempt } = require("../lib/login-rate-limit");
test("secrets cannot appear in client settings or audit snapshots", () => {
 const rows = [{key:"BUSINESS_DAY_PASSWORD",value:"sensitive"},{key:"API_TOKEN",value:"sensitive"},{key:"OPS_BRANCH_CONFIG",value:"{}"}];
 assert.deepEqual(publicSettings(rows),[rows[2]]);
 assert.deepEqual(settingAuditValue(rows[0]),{key:"BUSINESS_DAY_PASSWORD",configured:true});
});
test("closing is separate from human review and empty days cannot finalize", () => {
 assert.equal(evaluationReviewState({status:"CLOSED",evaluations:[{status:"DEFAULT_FULL"}]}).historicalConflict,true);
 assert.equal(evaluationReviewState({evaluations:[]}).canFinalize,false);
 assert.equal(evaluationReviewState({evaluations:[{status:"REVIEWED"},{status:"EXCEPTION"}]}).canFinalize,true);
});
test("login attempts are bounded across normalized user names and expire", () => {
 for(let i=0;i<10;i++) assert.equal(consumeLoginAttempt("Throttle Test",1000).allowed,true);
 assert.equal(consumeLoginAttempt("throttle test",1001).allowed,false);
 assert.equal(consumeLoginAttempt("Throttle Test",901001).allowed,true);
});
