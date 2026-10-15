const test = require('node:test'), assert = require('node:assert/strict');
const { rotationEditor, replaceCell, capacityUsed, changeRotationCell } = require('../lib/operations/rotation-manual');
const position = id => ({ id, code:id, label:id, active:true, requiresQualification:false });
function fixture() {
  const positions = ['A','B','DISABLED'].map(position);
  return { date:'2026-10-11', branch:'MOT', schedule:{id:'schedule',status:'PUBLISHED',version:1}, day:{id:'day',status:'OPEN',rotationPlans:[{version:2}]}, plan:{id:'plan',version:2,status:'ACTIVE'}, shifts:{AM:{startTime:'10:00',endTime:'12:00'}}, rotationRules:{slotsPerShift:8}, team:[{employeeId:'employee',shiftCode:'AM',working:true,expectedStart:'10:00',expectedEnd:'12:00',employee:{id:'employee',name:'Operator',active:true,department:'OPERATION'}}], positions, qualifications:[], breaks:[], assignments:[{id:'original',employeeId:'employee',operationalPositionId:'A',startTime:'10:00',endTime:'12:00',source:'AUTO',manualLock:false}], distributions:{schemaVersion:1,branch:'MOT',revision:1,allowDisabledManualAssignments:false,rules:positions.map((p,i)=>({id:p.id,positionId:p.id,shift:'AM',enabled:i<2,rank:i<2?i+1:0,required:false,min:0,target:1,max:1,roles:[],qualificationRequired:false,effectiveFrom:null,effectiveTo:null,weekdays:[]}))} };
}
const request = (data, extra={}) => ({ employeeId:'employee', startTime:'10:00', endTime:'11:00', operationalPositionId:'B', reason:'Manager adjusted coverage', sourceFingerprint:rotationEditor(data).sourceFingerprint, ...extra });
test('manual hourly replacement splits long assignments and leaves unrelated hours unchanged',()=>{
  const data=fixture(), original=JSON.stringify(data);const {assignments}=replaceCell(data,request(data));
  assert.equal(JSON.stringify(data),original);assert.deepEqual(assignments.map(a=>[a.operationalPositionId,a.startTime,a.endTime,a.source]),[['A','11:00','12:00','AUTO'],['B','10:00','11:00','MANUAL']]);
  const clear=replaceCell(data,request(data,{operationalPositionId:''}));assert.equal(clear.assignments.length,1);assert.equal(clear.assignments[0].startTime,'11:00');
});
test('locked, closed, absent, breaks, role, qualification, max coverage and stale edits fail closed',()=>{
  for(const mutate of [d=>d.assignments[0].manualLock=true,d=>d.day.status='CLOSED',d=>d.plan.status='CLOSED',d=>{d.team[0].liveDay=true;d.team[0].attendance={status:'ABSENT'};},d=>d.breaks.push({employeeId:'employee',startTime:'10:00',endTime:'11:00',status:'PLANNED'})]){const d=fixture();mutate(d);assert.throws(()=>replaceCell(d,request(d)),/cannot be edited/);}
  for(const mutate of [d=>d.distributions.rules[1].roles=['Manager'],d=>d.positions[1].requiresQualification=true,d=>d.assignments.push({employeeId:'other',operationalPositionId:'B',startTime:'10:00',endTime:'11:00',source:'AUTO'})]){const d=fixture();mutate(d);assert.throws(()=>replaceCell(d,request(d)),/cannot be assigned/);}
  const d=fixture(), body=request(d);d.distributions.revision++;assert.throws(()=>replaceCell(d,body),{status:409});
  assert.throws(()=>replaceCell(d,request(d,{reason:''})),/reason/);
  assert.throws(()=>replaceCell(d,request(d,{endTime:'11:30'})),/INVALID_SLOT/);
  d.day.status='REOPENED';assert.doesNotThrow(()=>replaceCell(d,request(d)));
});
test('excluded locations require the separate setting and explicit override; qualification still applies',()=>{
  const d=fixture();assert.throws(()=>replaceCell(d,request(d,{operationalPositionId:'DISABLED',allowDisabled:true})),/EXCLUDED/);
  d.distributions.allowDisabledManualAssignments=true;assert.throws(()=>replaceCell(d,request(d,{operationalPositionId:'DISABLED'})),/EXPLICIT_OVERRIDE/);
  assert.doesNotThrow(()=>replaceCell(d,request(d,{operationalPositionId:'DISABLED',allowDisabled:true})));
  d.positions[2].requiresQualification=true;assert.throws(()=>replaceCell(d,request(d,{operationalPositionId:'DISABLED',allowDisabled:true})),/QUALIFICATION/);
});
test('capacity counts simultaneous occupants, not sequential occupants inside the hour',()=>{
  const rows=[{employeeId:'one',operationalPositionId:'A',startTime:'10:00',endTime:'10:30'},{employeeId:'two',operationalPositionId:'A',startTime:'10:30',endTime:'11:00'}];
  assert.equal(capacityUsed(rows,'A','employee',{startTime:'10:00',endTime:'11:00'}),1);
});
test('save creates a new audited plan version, copies breaks, and preserves the previous assignments',async()=>{
  const d=fixture();d.breaks=[{employeeId:'employee',startTime:'11:30',endTime:'12:00',status:'PLANNED',note:'Lunch'}];const original=JSON.stringify(d);let created,audit;
  const tx={opsRotationPlan:{updateMany:async()=>{},create:async args=>{created=args.data;return {id:'new',...args.data};}},auditLog:{create:async args=>{audit=args.data;}}};
  const result=await changeRotationCell({$transaction:callback=>callback(tx)},{user:{id:'manager'},date:d.date,branch:d.branch,body:request(d),loadDaily:async()=>d});
  assert.equal(result.plan.version,3);assert.equal(created.breaks.create[0].note,'Lunch');assert.equal(created.assignments.create[1].source,'MANUAL');assert.equal(audit.action,'OPS_ROTATION_CELL_CHANGED');assert.equal(JSON.stringify(d),original);assert.equal(JSON.parse(audit.metadata).oldPlanId,'plan');
});
