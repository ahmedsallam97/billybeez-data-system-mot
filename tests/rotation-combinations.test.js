const test=require('node:test'),assert=require('node:assert/strict');
const {COMBINATIONS,components,physicalConflict,coversPosition}=require('../lib/operations/rotation-locations');
const {generateRotation,canAssign,coverageFor}=require('../lib/operations/live-daily');
const {rotationEditor,replaceCell}=require('../lib/operations/rotation-manual');
const {rotationPreview,applyRotation}=require('../lib/operations/rotation-service');
const singleCodes=['DROP','LOCKER','DATA','EXIT','PARK','PLAYGROUND','TRAMPOLINE'];
const positions=[...singleCodes,...COMBINATIONS.map(c=>c.code)].map(code=>({id:code,code,label:code,active:true,requiresQualification:false,sortOrder:1}));
const member=(id,shift='PM')=>({employeeId:id,shiftCode:shift,code:shift,working:true,liveDay:false,expectedStart:shift==='AM'?'10:00':'18:00',expectedEnd:shift==='AM'?'11:00':'19:00',employee:{id,name:id,active:true,jobTitle:'Operator',department:'OPERATION'}});
const rule=(p,index,shift='PM')=>({id:shift+p.id,positionId:p.id,shift,enabled:true,rank:index+1,required:index<4,min:index<4?1:0,target:1,max:1,roles:[],qualificationRequired:false,effectiveFrom:null,effectiveTo:null,weekdays:[]});
function fixture(count=4,shift='PM'){
 return {date:'2026-10-11',workDate:'2026-10-11',branch:'MOT',positions,team:Array.from({length:count},(_,i)=>member('employee'+i,shift)),qualifications:[],breaks:[],assignments:[],slots:[{shiftCode:shift,startTime:shift==='AM'?'10:00':'18:00',endTime:shift==='AM'?'11:00':'19:00'}],shifts:{AM:{startTime:'10:00',endTime:'11:00'},PM:{startTime:'18:00',endTime:'19:00'}},distributions:{schemaVersion:1,branch:'MOT',revision:1,preferCombinedWhenShortStaffed:true,allowDisabledManualAssignments:false,rules:positions.map((p,i)=>rule(p,i,shift))},day:{id:'day',status:'OPEN',rotationPlans:[{version:1}]},plan:{id:'plan',version:1,status:'ACTIVE'},schedule:{id:'schedule',status:'PUBLISHED',version:1}};
}
const codes=result=>result.assignments.map(a=>a.positionCode);
function assertNoSharedPhysicalLocations(result){for(let i=0;i<result.assignments.length;i++)for(let j=i+1;j<result.assignments.length;j++){const a=result.assignments[i],b=result.assignments[j];if(a.startTime<b.endTime&&b.startTime<a.endTime){assert.equal(physicalConflict(a.positionCode,b.positionCode),false);assert.notEqual(a.employeeId,b.employeeId);}}}
test('seven explicit combinations share exact physical identities; Play aliases Playground without substring matching',()=>{
 assert.equal(COMBINATIONS.length,7);assert.deepEqual(components('PLAY'),['PLAYGROUND']);assert.deepEqual(components('PLAY-DROP'),['PLAYGROUND','DROP']);assert.equal(physicalConflict('PLAY-DROP','PLAYGROUND'),true);assert.equal(physicalConflict('PLAY-DROP','PLAY-TRAMPOLINE'),true);assert.equal(physicalConflict('PLAY-DROP','DISPLAY'),false);assert.equal(physicalConflict('PARK','PARK'),false);
 for(const pair of COMBINATIONS)for(const part of pair.parts)assert.equal(physicalConflict(pair.code,part),true);
});
test('four PM employees cover seven sites through three disjoint pairs and Exit; two prioritize required coverage',()=>{
 const result=generateRotation(fixture());assert.deepEqual(new Set(codes(result)),new Set(['DATA-LOCKER','PLAY-DROP','PARK-TRAMPOLINE','EXIT']));assert.equal(result.coverage.filter(c=>singleCodes.includes(c.positionCode)&&c.assigned===1).length,7);assert.equal(result.coverage.filter(c=>c.required&&c.shortage).length,0);assertNoSharedPhysicalLocations(result);assert.deepEqual(generateRotation(fixture()),result);
 const short=generateRotation(fixture(2));assert.deepEqual(new Set(codes(short)),new Set(['DATA-LOCKER','PLAY-DROP']));assert.equal(short.coverage.filter(c=>c.required&&c.assigned===1).length,3);assertNoSharedPhysicalLocations(short);
});
test('full PM staffing and AM use single sites; disabled preference or pairs never force compound fallback',()=>{
 assert.ok(codes(generateRotation(fixture(7))).every(c=>!c.includes('-')));assert.ok(codes(generateRotation(fixture(4,'AM'))).every(c=>!c.includes('-')));
 const disabled=fixture();disabled.distributions.preferCombinedWhenShortStaffed=false;assert.ok(codes(generateRotation(disabled)).every(c=>!c.includes('-')));
 const noPairs=fixture();noPairs.distributions.rules=noPairs.distributions.rules.map(r=>r.positionId.includes('-')?{...r,rank:0,enabled:false}:r);assert.ok(codes(generateRotation(noPairs)).every(c=>!c.includes('-')));
});
test('both component qualifications, active states and dates apply to a combined assignment',()=>{
 const all=positions.map(p=>({...p,requiresQualification:true})),combo=all.find(p=>p.code==='DATA-LOCKER'),qualifications=['DATA','LOCKER'].map(id=>({employeeId:'e',operationalPositionId:id,status:'QUALIFIED',effectiveDate:'2026-01-01'}));
 const args={qualifications,employeeId:'e',position:combo,positions:all,workDate:'2026-10-11'};assert.equal(canAssign(args),true);assert.equal(canAssign({...args,qualifications:qualifications.slice(0,1)}),false);assert.equal(canAssign({...args,qualifications:qualifications.map(q=>q.operationalPositionId==='LOCKER'?{...q,expiryDate:'2026-10-10'}:q)}),false);assert.equal(canAssign({...args,positions:all.map(p=>p.code==='DATA'?{...p,active:false}:p)}),false);
});
test('manual options and save reject a shared part, across shifts and despite an excluded-location override',()=>{
 const d=fixture(2);d.team.push({...member('am','AM'),expectedStart:'18:00',expectedEnd:'19:00'});d.assignments=[{id:'occupied',employeeId:'am',operationalPositionId:'PLAY-DROP',shiftCode:'AM',startTime:'18:00',endTime:'19:00',source:'MANUAL',manualLock:true}];
 const cell=rotationEditor(d).cells.find(c=>c.employeeId==='employee0');assert.ok(cell);for(const code of ['PLAYGROUND','DROP','PLAY-TRAMPOLINE','LOCKER-DROP'])assert.equal(cell.options.find(o=>o.id===code).reason,'COMPONENT_CONFLICT');
 const body={employeeId:cell.employeeId,startTime:cell.startTime,endTime:cell.endTime,operationalPositionId:'PLAYGROUND',reason:'Try overlapping physical location',sourceFingerprint:rotationEditor(d).sourceFingerprint};assert.throws(()=>replaceCell(d,body),/COMPONENT_CONFLICT/);
 d.distributions.allowDisabledManualAssignments=true;d.distributions.rules=d.distributions.rules.map(r=>r.positionId==='PLAYGROUND'?{...r,enabled:false,rank:0}:r);assert.throws(()=>replaceCell(d,{...body,allowDisabled:true,sourceFingerprint:rotationEditor(d).sourceFingerprint}),/COMPONENT_CONFLICT/);
 assert.doesNotThrow(()=>replaceCell(d,{...body,operationalPositionId:'EXIT',sourceFingerprint:rotationEditor(d).sourceFingerprint}));
});
test('compound coverage counts both components and overlapping AM coverage satisfies PM physical demand',()=>{
 const d=fixture(1);d.team.push({...member('am','AM'),expectedStart:'18:00',expectedEnd:'19:00'});d.fixedAssignments=[{employeeId:'am',operationalPositionId:'DATA-LOCKER',shiftCode:'AM',startTime:'18:00',endTime:'19:00',manualLock:true,source:'MANUAL'}];
 const result=generateRotation(d);assert.ok(result.assignments.filter(a=>a.source==='AUTO').every(a=>!components(a.positionCode).some(p=>['DATA','LOCKER'].includes(p))));assertNoSharedPhysicalLocations(result);
 const coverage=coverageFor({...d,assignments:result.assignments});for(const code of ['DATA','LOCKER'])assert.equal(coverage.find(c=>c.shiftCode==='PM'&&c.positionCode===code).assigned,1);
 assert.equal(coversPosition(d.fixedAssignments[0],positions.find(p=>p.id==='DATA'),positions),true);
});
test('protected conflicting pairs are retained in preview but applying fails before any database write',async()=>{
 const d=fixture();d.assignments=[{employeeId:'employee0',operationalPositionId:'PLAY-DROP',startTime:'18:00',endTime:'19:00',source:'MANUAL',manualLock:true},{employeeId:'employee1',operationalPositionId:'PLAYGROUND',startTime:'18:00',endTime:'19:00',source:'MANUAL',manualLock:true}];
 const preview=rotationPreview(d);assert.ok(preview.alerts.some(a=>a.code==='PHYSICAL_LOCATION_CONFLICT'&&a.severity==='CRITICAL'));let writes=0;const tx={opsRotationPlan:{updateMany:()=>writes++}};await assert.rejects(applyRotation({$transaction:fn=>fn(tx)},{user:{id:'manager'},date:d.date,branch:d.branch,confirmed:true,previewFingerprint:preview.sourceFingerprint,reason:'Manager reviewed conflicts',loadDaily:async()=>d}),{status:422});assert.equal(writes,0);
});
test('generated assignments never share compound components across staffing levels, breaks and shifts',()=>{
 for(let n=1;n<=10;n++)for(const shift of ['AM','PM']){
  const d=fixture(n,shift);d.breaks=n%2?[{employeeId:'employee0',startTime:d.slots[0].startTime,endTime:d.slots[0].endTime,status:'PLANNED'}]:[];const result=generateRotation(d);assertNoSharedPhysicalLocations(result);assert.ok(result.assignments.every(a=>!d.breaks.some(b=>b.employeeId===a.employeeId)));assert.deepEqual(generateRotation(d),result);
 }
});
