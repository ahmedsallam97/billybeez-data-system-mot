const test=require('node:test'),assert=require('node:assert/strict');
const {rotationOptionGroups}=require('../lib/operations/rotation-option-groups');
test('available locations come first without reordering backend priorities or mutating option eligibility',()=>{
 const options=[{id:'excluded',reason:'EXCLUDED'},{id:'override',requiresOverride:true},{id:'drop',code:'DROP'},{id:'locker',code:'LOCKER'},{id:'conflict',reason:'COMPONENT_CONFLICT'}],before=JSON.stringify(options);
 const groups=rotationOptionGroups(options);assert.deepEqual(groups.available.map(o=>o.id),['drop','locker']);assert.deepEqual(groups.unavailable.map(o=>o.id),['excluded','override','conflict']);assert.equal(groups.unavailable[1].displayReason,'OVERRIDE_REQUIRED');assert.equal(JSON.stringify(options),before);
});
test('explicit override only changes presentation for override-only options; real exclusions remain unavailable',()=>{
 const options=[{id:'override',requiresOverride:true,reason:''},{id:'handover',requiresOverride:true,reason:'PM_HANDOVER_SUPPORT_ONLY'},{id:'qualify',reason:'QUALIFICATION'}];
 const groups=rotationOptionGroups(options,true);assert.deepEqual(groups.available.map(o=>o.id),['override']);assert.equal(groups.available[0].requiresOverride,true);assert.deepEqual(groups.unavailable.map(o=>o.displayReason),['PM_HANDOVER_SUPPORT_ONLY','QUALIFICATION']);
});
