const test=require('node:test'),assert=require('node:assert/strict');
const {appendProcessSuggestions}=require('../lib/operations/report-process-suggestions');
test('requested event process steps are editable proposals, preserve existing fields and do not duplicate on repeat',()=>{
 const original=[{code:'CUSTOM',label:'Existing procedure',order:1,required:false}],snapshot=structuredClone(original);
 const trip=appendProcessSuggestions('TRIP',original),birthday=appendProcessSuggestions('BIRTHDAY',original);
 assert.equal(trip.length,9);assert.equal(birthday.length,10);assert.deepEqual(original,snapshot);assert.deepEqual(trip[0],snapshot[0]);assert.deepEqual(appendProcessSuggestions('TRIP',trip),trip);assert.equal(birthday.find(step=>step.code==='BALLOON_ARCH').responsibleEmployeeRequired,true);assert.ok([...trip,...birthday].every(step=>step.label&&(!step.active||step.labelAr)));assert.deepEqual(appendProcessSuggestions('SHIFT_LEADERSHIP',original),original);
});
