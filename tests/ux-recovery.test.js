const test = require('node:test'), assert = require('node:assert/strict');
const {eventLabel, operationalMessage}=require('../lib/operational-copy');
test('operational errors explain permissions, state and recovery in Arabic without losing diagnostic details',()=>{
 for(const message of ['Permission denied','Record revision conflict','Workflow is locked','Failed to fetch']){
  const result=operationalMessage(message,'ar');assert.match(result.message,/[\u0600-\u06ff]/);assert.match(result.recovery,/[\u0600-\u06ff]/);assert.equal(result.technical,message);
 }
});
test('audit codes have human-readable labels in both interface languages',()=>{
 for(const code of ['ACCOUNT_PROFILE_UPDATED','OPS_SCHEDULE_PUBLISHED','OPS_EMPLOYEE_CONVERTED_TO_HRIS']){assert.match(eventLabel(code,'ar'),/[\u0600-\u06ff]/);assert.doesNotMatch(eventLabel(code,'en'),/_/);}
});
