const test=require('node:test'),assert=require('node:assert/strict');
const {generateRotation}=require('../lib/operations/live-daily');
const {migrateLegacy,validateDistributions,applicableRules,protectedAssignments,assertCanApply,saveDistributions,loadDistributions}=require('../lib/operations/rotation-distributions');
const {rotationPreview,applyRotation}=require('../lib/operations/rotation-service');
const position=(code,priority=10,qualified=false)=>({id:code,code,label:code,sortOrder:priority,active:true,requiresQualification:qualified,staffingRequirements:[]});
const member=(id,shift='AM',role='Operator')=>({employeeId:id,shiftCode:shift,code:shift,working:true,liveDay:false,employee:{id,name:id,jobTitle:role,active:true,department:'OPERATION'}});
const rule=(id,shift='AM',values={})=>({id:shift+id,positionId:id,shift,enabled:true,rank:1,required:true,min:1,target:1,max:1,roles:[],qualificationRequired:false,effectiveFrom:null,effectiveTo:null,weekdays:[],...values});
const config=rules=>({schemaVersion:1,branch:'MOT',revision:0,rules,allowDisabledManualAssignments:false});
const slots=[{shiftCode:'AM',startTime:'10:00',endTime:'11:00'},{shiftCode:'PM',startTime:'18:00',endTime:'19:00'}];
test('legacy migration preserves positive ascending priorities, excludes zero everywhere, and removes baseline dates',()=>{
 const positions=[position('TOWER',0),position('TODDLER',0),position('Z',18),position('B',10),position('A',18)];positions[3].staffingRequirements=[{shiftCode:'AM',minEmployees:1,effectiveFrom:'2000-01-01'}];
 for(const code of ['A','Z'])positions.find(p=>p.code===code).staffingRequirements=[{shiftCode:'AM',minEmployees:1,effectiveFrom:'2000-01-01'}];
 const migrated=migrateLegacy(positions,'MOT');assert.ok(!migrated.rules.some(r=>r.shift==='PM'&&r.enabled));assert.deepEqual(migrated.rules.filter(r=>r.shift==='AM'&&r.enabled).map(r=>r.positionId),['B','A','Z']);assert.equal(migrated.rules.find(r=>r.positionId==='B').effectiveFrom,null);
 const result=generateRotation({workDate:'2026-10-11',positions,team:Array.from({length:8},(_,i)=>member(String(i))),slots:[slots[0]]});assert.ok(result.assignments.length);assert.ok(result.assignments.every(a=>!['TOWER','TODDLER'].includes(a.positionCode)));assert.ok(result.unassigned.length);
});
test('independent AM and PM enabled lists, priorities, disabled fallback and deterministic employee allocation',()=>{
 const positions=['A','B','C','ZERO'].map(p=>position(p)),team=[member('a'),member('b'),member('c','PM'),member('d','PM')];
 const distributions=config([rule('A'),rule('B','AM',{rank:2}),rule('C','AM',{enabled:false,rank:3}),rule('ZERO','AM',{rank:0}),rule('C','PM'),rule('A','PM',{rank:2}),rule('B','PM',{enabled:false,rank:0})]);
 const input={workDate:'2026-10-11',positions,team,slots,distributions};const result=generateRotation(input);assert.deepEqual(generateRotation(input),result);assert.deepEqual(result.assignments.filter(a=>a.shiftCode==='AM').map(a=>a.positionCode),['A','B']);assert.deepEqual(result.assignments.filter(a=>a.shiftCode==='PM').map(a=>a.positionCode),['C','A']);assert.ok(!result.assignments.some(a=>a.positionCode==='ZERO'));
});
test('required minima precede targets, optional rules follow required coverage, and maxima limit fallback',()=>{
 const positions=['A','B','O'].map(p=>position(p)),distributions=config([rule('A','AM',{target:3,max:3}),rule('B','AM',{rank:2,min:2,target:2,max:2}),rule('O','AM',{rank:3,required:false,min:0,target:1,max:1})]);
 const run=n=>generateRotation({workDate:'2026-10-11',positions,team:Array.from({length:n},(_,i)=>member(String(i))),slots:[slots[0]],distributions});
 assert.deepEqual(run(3).assignments.map(a=>a.positionCode),['A','B','B']);assert.deepEqual(run(5).assignments.map(a=>a.positionCode),['A','B','B','A','A']);assert.equal(run(8).assignments.length,6);assert.equal(run(8).unassigned.length,2);
 const shortage=run(1);assert.equal(shortage.assignments.length,1);assert.ok(shortage.alerts.some(a=>a.code==='POSITION_SHORTAGE'&&a.positionCode==='B'));assert.ok(!shortage.assignments.some(a=>a.positionCode==='O'));
});
test('roles, qualifications, absence, breaks, effective dates and weekdays fail closed with reasons',()=>{
 const positions=[position('Q',10,true),position('DATE'),position('DAY')],distributions=config([rule('Q','AM',{roles:['Senior']}),rule('DATE','AM',{rank:2,effectiveFrom:'2026-10-12'}),rule('DAY','AM',{rank:3,weekdays:[1]})]);
 const team=[member('junior','AM','Junior'),member('not-qualified','AM','Senior'),{...member('absent','AM','Senior'),liveDay:true,attendance:{status:'ABSENT'}},member('break','AM','Senior'),member('good','AM','Senior')];
 const qualifications=['absent','break','good'].map(employeeId=>({employeeId,operationalPositionId:'Q',status:'QUALIFIED',effectiveDate:'2026-10-01'}));
 const result=generateRotation({workDate:'2026-10-11',positions,distributions,team,qualifications,breaks:[{employeeId:'break',startTime:'10:00',endTime:'11:00'}],slots:[slots[0]]});assert.deepEqual(result.assignments.map(a=>a.employeeId),['good']);assert.ok(result.excluded.some(e=>e.reason==='OUTSIDE_DATES'));assert.ok(result.excluded.some(e=>e.reason==='WEEKDAY'));assert.ok(result.alerts.some(a=>a.code==='QUALIFICATION_CONFLICT'));
 assert.equal(applicableRules(distributions,positions,{workDate:'2026-10-12',shift:'AM'}).filter(r=>!r.excludedReason).length,3);
});
test('locked and manual cells are always protected, including former replacement flags; closed and stale plans refuse apply',()=>{
 const team=[member('locked'),member('manual'),member('auto')],existing=[{employeeId:'locked',operationalPositionId:'A',manualLock:true,source:'AUTO',startTime:'10:00',endTime:'11:00'},{employeeId:'manual',operationalPositionId:'B',manualLock:false,source:'MANUAL',startTime:'10:00',endTime:'11:00'},{employeeId:'auto',operationalPositionId:'C',source:'AUTO',startTime:'10:00',endTime:'11:00'}];
 assert.equal(protectedAssignments(existing,team).length,2);assert.equal(protectedAssignments(existing,team,{replaceManual:true}).length,2);
 const base={confirmed:true,previewFingerprint:'a',currentFingerprint:'a',reason:'Manager reviewed the dry run',day:{status:'OPEN'},plan:{status:'ACTIVE'}};assert.doesNotThrow(()=>assertCanApply(base));assert.doesNotThrow(()=>assertCanApply({...base,day:{status:'REOPENED'}}));assert.throws(()=>assertCanApply({...base,confirmed:false}),/Preview/);assert.throws(()=>assertCanApply({...base,currentFingerprint:'b'}),/changed/);assert.throws(()=>assertCanApply({...base,day:{status:'CLOSED'}}),/Historical/);assert.throws(()=>assertCanApply({...base,plan:{status:'CLOSED'}}),/Historical/);
 const distributions=config([rule('A','AM',{enabled:false,rank:0}),rule('B'),rule('C','AM',{rank:2})]);const result=generateRotation({workDate:'2026-10-11',positions:['A','B','C'].map(p=>position(p)),team,slots:[slots[0]],distributions,fixedAssignments:protectedAssignments(existing,team)});assert.ok(result.assignments.find(a=>a.employeeId==='locked').preserved);assert.ok(result.alerts.some(a=>a.code==='PROTECTED_EXCLUDED_LOCATION'));
});
test('configuration validation and branch-specific storage use revisions without changing location identities or published schedules',async()=>{
 const {prepareIsolatedEnvironment,assertIsolatedEnvironment}=require('./e2e/isolation');prepareIsolatedEnvironment();assertIsolatedEnvironment();const {PrismaClient}=require('@prisma/client'),db=new PrismaClient();try{
  const user=await db.user.findFirst({where:{role:'ADMIN',active:true}}),positions=await db.opsOperationalPosition.findMany({include:{staffingRequirements:true}}),original=JSON.stringify(positions),schedules=JSON.stringify(await db.opsSchedule.findMany());
  const draft=await loadDistributions(db,{branch:'ROTTEST',positions});assert.equal(draft.rules.length,0);draft.rules=[rule(positions[0].id)];draft.branch='ROTTEST';
  const first=await saveDistributions(db,{user,branch:'ROTTEST',positions,value:draft,expectedRevision:0});assert.equal(first.revision,1);await assert.rejects(saveDistributions(db,{user,branch:'ROTTEST',positions,value:draft,expectedRevision:0}),{status:409});
  assert.throws(()=>validateDistributions({...draft,rules:[{...draft.rules[0],min:3,target:1}]},positions,'ROTTEST'),/Minimum/);assert.equal(JSON.stringify(await db.opsOperationalPosition.findMany({include:{staffingRequirements:true}})),original);assert.equal(JSON.stringify(await db.opsSchedule.findMany()),schedules);
 }finally{await db.$disconnect();}
});
