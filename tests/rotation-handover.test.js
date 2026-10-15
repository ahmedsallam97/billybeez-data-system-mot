const test=require('node:test'),assert=require('node:assert/strict');
const {rotationPreview,applyRotation}=require('../lib/operations/rotation-service');
const {handoverWindow,handoverBreaks,dataExitBlocked}=require('../lib/operations/rotation-handover');
const {rotationEditor,replaceCell}=require('../lib/operations/rotation-manual');
const {orderRoster}=require('../lib/operations/roster');
function fixture(){
 const codes=['DROP','LOCKER','PARK','PLAYGROUND','TRAMPOLINE','DATA','EXIT','TOWER','ENTRANCE','DATA-LOCKER','PLAY-DROP','PARK-TRAMPOLINE'];
 const positions=codes.map(code=>({id:code,code,label:code,active:true,requiresQualification:false}));
 const member=(id,shift)=>({employeeId:id,shiftCode:shift,working:true,expectedStart:shift==='AM'?'10:00':'15:00',expectedEnd:shift==='AM'?'18:00':'23:00',employee:{id,name:id,active:true,department:'OPERATION'}});
 return {date:'2026-10-11',branch:'MOT',positions,team:[...Array.from({length:3},(_,i)=>member('am'+i,'AM')),...Array.from({length:4},(_,i)=>member('pm'+i,'PM'))],shifts:{AM:{startTime:'10:00',endTime:'18:00'},PM:{startTime:'15:00',endTime:'23:00'}},rotationRules:{slotsPerShift:8},distributions:{schemaVersion:1,branch:'MOT',revision:1,handover:{enabled:true,breakMinutes:60},coverageBeforeDataExit:true,rules:['AM','PM'].flatMap(shift=>positions.map((p,i)=>({id:shift+p.id,positionId:p.id,shift,enabled:shift==='AM'?!p.code.includes('-'):!['TOWER','ENTRANCE'].includes(p.code),rank:i+1,required:false,min:0,target:1,max:1,roles:[],qualificationRequired:false,weekdays:[],handoverOnly:shift==='AM'&&['TOWER','ENTRANCE'].includes(p.code)})))},schedule:{id:'s',version:1,status:'PUBLISHED'},day:{id:'d',status:'OPEN',rotationPlans:[{version:1}]},plan:{id:'p',version:1,status:'ACTIVE'},assignments:[],breaks:[],qualifications:[]};
}
test('one-hour handover follows PM start; AM later assignments are support only and PM has priority',()=>{
 const d=fixture(),preview=rotationPreview(d);assert.equal(preview.breaks.length,3);
 assert.ok(preview.breaks.every(b=>b.startTime==='15:00'&&b.endTime==='16:00'));
 assert.ok(!preview.assignments.some(a=>a.shiftCode==='AM'&&a.startTime==='15:00'));
 assert.ok(preview.assignments.filter(a=>a.shiftCode==='AM'&&a.startTime>='16:00').every(a=>['TOWER','ENTRANCE','EXIT'].includes(a.positionCode)));
 assert.ok(!preview.assignments.some(a=>a.shiftCode==='AM'&&a.startTime<'16:00'&&['TOWER','ENTRANCE'].includes(a.positionCode)));
 assert.ok(preview.assignments.some(a=>a.shiftCode==='PM'&&a.startTime==='15:00'));
 const moved=fixture();moved.shifts.PM.startTime='14:00';assert.equal(rotationPreview(moved).breaks[0].startTime,'14:00');assert.notEqual(rotationPreview(moved).sourceFingerprint,preview.sourceFingerprint);
});
test('no incoming PM means no handover; cashiers, leaders and AM workers leaving early keep their roles',()=>{
 const d=fixture();d.team[0].isShiftLeader=true;d.team[1].frontAssignment='FRONT_CASHIER';d.team[2].expectedEnd='15:00';assert.deepEqual(handoverBreaks(d),[]);
 d.team=d.team.filter(m=>m.shiftCode==='AM');assert.equal(handoverWindow(d),null);assert.deepEqual(handoverBreaks(d),[]);
 const absent=fixture();absent.team.filter(m=>m.shiftCode==='PM').forEach(m=>{m.liveDay=true;m.attendance={status:'ABSENT'};});assert.equal(handoverWindow(absent),null);
 absent.team.find(m=>m.shiftCode==='PM').attendance.status='PRESENT';absent.team[0].liveDay=true;absent.team[0].attendance={status:'ABSENT'};assert.equal(handoverBreaks(absent).some(b=>b.employeeId==='am0'),false);
});
test('existing partial break is completed to one hour without duplicates; cancelling an old auto break recalculates',()=>{
 const d=fixture();d.breaks=[{employeeId:'am0',startTime:'15:00',endTime:'15:30',status:'PLANNED',note:'Lunch'},{employeeId:'am1',startTime:'14:00',endTime:'15:00',status:'PLANNED',note:'AUTO_PM_HANDOVER'}];
 const breaks=handoverBreaks(d);assert.equal(breaks.filter(b=>b.employeeId==='am0').length,2);assert.ok(breaks.some(b=>b.employeeId==='am0'&&b.startTime==='15:30'&&b.endTime==='16:00'));assert.ok(!breaks.some(b=>b.startTime==='14:00'));
 assert.deepEqual(handoverBreaks({...d,breaks}),breaks);assert.deepEqual(handoverBreaks(d,'PM'),d.breaks);
});
test('Data plus Exit is blocked until every other active location is covered, including compound and partial-hour coverage',()=>{
 const d=fixture(),slot={shiftCode:'PM',startTime:'15:00',endTime:'16:00'};
 const row=(p,start='15:00',end='16:00')=>({employeeId:p,operationalPositionId:p,startTime:start,endTime:end});
 const exit=d.positions.find(p=>p.code==='EXIT');assert.equal(dataExitBlocked(d,exit,[row('DATA-LOCKER')],slot),true);
 const covered=[row('DATA-LOCKER'),row('PLAY-DROP'),row('PARK-TRAMPOLINE')];assert.equal(dataExitBlocked(d,exit,covered,slot),false);
 assert.equal(dataExitBlocked(d,exit,[...covered.slice(0,2),row('PARK-TRAMPOLINE','15:00','15:30')],slot),true);
});
test('manual overrides cannot bypass Break, late AM support or Data/Exit; clearing core coverage is rejected',()=>{
 const d=fixture();d.distributions.allowDisabledManualAssignments=true;
 const body=(id,start,position)=>({employeeId:id,startTime:start,endTime:`${Number(start.slice(0,2))+1}:00`,operationalPositionId:position,sourceFingerprint:rotationEditor(d).sourceFingerprint,reason:'Manager adjusts coverage',allowDisabled:true});
 assert.throws(()=>replaceCell(d,body('am0','15:00','DROP')),/BREAK/);
 assert.throws(()=>replaceCell(d,body('am0','16:00','DROP')),/PM_HANDOVER_SUPPORT_ONLY/);
 assert.throws(()=>replaceCell(d,body('am0','14:00','TOWER')),/AFTER_HANDOVER_ONLY/);
 d.assignments=[{employeeId:'pm1',operationalPositionId:'DATA',startTime:'15:00',endTime:'16:00',source:'AUTO'}];assert.throws(()=>replaceCell(d,body('pm0','15:00','EXIT')),/DATA_EXIT_COVERAGE/);
 d.assignments=['DATA-LOCKER','PLAY-DROP','PARK-TRAMPOLINE','EXIT'].map((p,i)=>({employeeId:'pm'+i,operationalPositionId:p,startTime:'15:00',endTime:'16:00',source:'AUTO'}));
 assert.throws(()=>replaceCell(d,body('pm1','15:00','')),/Data and Exit require coverage/);
});
test('protected manual conflict blocks application before writes; generated breaks are stored in the new version',async()=>{
 const d=fixture();d.assignments=[{employeeId:'am0',operationalPositionId:'DROP',startTime:'15:00',endTime:'16:00',source:'MANUAL',manualLock:true}];
 const preview=rotationPreview(d);assert.ok(preview.alerts.some(a=>a.code==='HANDOVER_BREAK_CONFLICT'));let writes=0;
 await assert.rejects(applyRotation({$transaction:fn=>fn({opsRotationPlan:{updateMany:()=>writes++}})},{user:{id:'u'},date:d.date,branch:d.branch,confirmed:true,previewFingerprint:preview.sourceFingerprint,reason:'Reviewed preview',loadDaily:async()=>d}),{status:422});assert.equal(writes,0);
 d.assignments=[];let saved;const tx={opsRotationPlan:{updateMany:async()=>{},create:async({data})=>{saved=data;return {id:'new',...data,assignments:data.assignments.create};}},auditLog:{create:async()=>{}}};
 await applyRotation({$transaction:fn=>fn(tx)},{user:{id:'u'},date:d.date,branch:d.branch,confirmed:true,previewFingerprint:rotationPreview(d).sourceFingerprint,reason:'Reviewed preview',loadDaily:async()=>d});assert.equal(saved.breaks.create.length,3);assert.equal(saved.version,2);assert.equal(d.breaks.length,0);
});
test('chosen team leader follows cashiers and overrides a former leader flag',()=>{
 const rows=[{employee:{id:'old',name:'Old',operationsTeamLeader:true},isShiftLeader:false,shiftCode:'AM'},{employee:{id:'leader',name:'Leader'},isShiftLeader:true,shiftCode:'AM'},{employee:{id:'cashier',name:'Cashier',department:'CASHIER'},shiftCode:'AM'}];
 assert.deepEqual(orderRoster(rows,['old','leader','cashier']).map(r=>r.employee.id),['cashier','leader','old']);
});
test('manual Break saves a new break without creating a fake operational position',()=>{
 const d=fixture(),editor=rotationEditor(d),cell=editor.cells.find(c=>c.employeeId==='am0'&&c.startTime==='10:00');
 const result=replaceCell(d,{employeeId:cell.employeeId,startTime:cell.startTime,endTime:cell.endTime,operationalPositionId:'BREAK',sourceFingerprint:editor.sourceFingerprint,reason:'Approved morning break'});
 assert.equal(result.breaks[0].startTime,'10:00');assert.equal(result.assignments.some(a=>a.operationalPositionId==='BREAK'),false);assert.equal(d.breaks.length,0);
});
test('clearing AM support cannot invalidate a Data/Exit pair assigned to the overlapping PM shift',()=>{
 const d=fixture();d.assignments=['DATA-LOCKER','PLAY-DROP','PARK-TRAMPOLINE','EXIT'].map((p,i)=>({employeeId:'pm'+i,operationalPositionId:p,startTime:'16:00',endTime:'17:00',source:'AUTO'}));d.assignments.push({employeeId:'am0',operationalPositionId:'TOWER',startTime:'16:00',endTime:'17:00',source:'AUTO'},{employeeId:'am1',operationalPositionId:'ENTRANCE',startTime:'16:00',endTime:'17:00',source:'AUTO'});
 assert.throws(()=>replaceCell(d,{employeeId:'am0',startTime:'16:00',endTime:'17:00',operationalPositionId:'',sourceFingerprint:rotationEditor(d).sourceFingerprint,reason:'Attempt to remove support'}),/Data and Exit require coverage/);
});
test('Entrance setup is idempotent and qualifies only the original approved employees',async()=>{
 const fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite'),{PrismaClient}=require('@prisma/client');
 const {configureHandover}=require('../lib/operations/rotation-handover-config');
 const isolation=require('./e2e/isolation'),parent=path.resolve(process.env.OPS_E2E_VERIFICATION_ROOT||'tmp');fs.mkdirSync(parent,{recursive:true});const root=fs.mkdtempSync(path.join(parent,'handover-test-')),database=path.join(root,'test.db'),source=new DatabaseSync(isolation.sourceDatabasePath(),{readOnly:true});source.prepare('VACUUM INTO ?').run(database);source.close();
 const db=new PrismaClient({datasources:{db:{url:'file:'+database.replaceAll('\\','/')}}});
 try{
  await db.systemSetting.deleteMany({where:{key:'OPS_PM_HANDOVER_V1:MOT'}});
  const user=await db.user.findFirst({where:{active:true}}),newcomer=await db.employee.create({data:{name:'New qualification test',active:true,department:'OPERATION',branch:'MOT'}});
  const before=JSON.stringify(await db.opsRotationPlan.findMany({include:{assignments:true,breaks:true},orderBy:{id:'asc'}}));
  const result=await configureHandover(db,{userId:user.id,backupReference:'Isolated test'});assert.equal(result.applied,true);assert.ok(result.employeeIds.length>0);assert.equal(await db.employeeQualification.count({where:{employeeId:newcomer.id}}),0);
  assert.equal((await configureHandover(db,{userId:user.id,backupReference:'Isolated test'})).applied,false);assert.equal(await db.opsOperationalPosition.count({where:{code:'ENTRANCE'}}),1);assert.equal(JSON.stringify(await db.opsRotationPlan.findMany({include:{assignments:true,breaks:true},orderBy:{id:'asc'}})),before);
 }finally{await db.$disconnect();}
});
