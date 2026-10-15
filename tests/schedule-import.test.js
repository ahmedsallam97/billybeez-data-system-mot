const test=require('node:test'),assert=require('node:assert/strict');
const {templateSheets,importTemplate,parseWorkbook,planImport,assignmentFor}=require('../lib/operations/schedule-import');
const {workbookFromSheets,scheduleWorkbook}=require('../lib/operations/schedule-export');
const {orderedRows,moveEmployee}=require('../lib/operations/schedule-order');
const schedule={id:'draft-1',version:2,status:'DRAFT',operationalYear:2026,operationalMonth:10,periodStart:'2026-09-16',periodEnd:'2026-10-15',assignments:[]};
const employees=[{id:'e1',name:'Z employee',hrisNumber:'001',jobTitle:'Ride operator'},{id:'e2',name:'A employee',localEmployeeCode:'PT-02',department:'CASHIER'}];
const codes=[{code:'AM',label:'Morning',countsAsWorking:true},{code:'PM',label:'Night',countsAsWorking:true},{code:'OFF',label:'Off',countsAsWorking:false}];
function fixture(){return {sheets:Object.fromEntries(templateSheets(schedule,employees,codes,'MOT').map(sheet=>[sheet.name,sheet.rows])),schedule:structuredClone(schedule),employees,codes,branch:'MOT'};}
test('generated import XLSX round trips with exact metadata, stable IDs, ISO period and Codes validation',async()=>{
 const bytes=Buffer.from(importTemplate(schedule,employees,codes,'MOT')),sheets=await parseWorkbook(bytes);
 assert.deepEqual(Object.keys(sheets),['Instructions','Schedule','Codes']);assert.equal(sheets.Schedule[1][0],'e1');assert.equal(sheets.Schedule[1][1],'001');assert.equal(sheets.Schedule[0][4],'2026-09-16');assert.equal(sheets.Schedule[0].at(-1),'2026-10-15');
 assert.match(bytes.toString(),/sqref="E2:AH3"/);assert.match(bytes.toString(),/Codes!\$A\$2:\$A\$4/);
 const args={...fixture(),sheets};assert.equal(planImport(args).valid,true);
 sheets.Schedule[1][4]='AM';assert.equal(planImport(args).counts.created,1);
 await assert.rejects(parseWorkbook(Buffer.from(workbookFromSheets([{name:'Wrong',rows:[['data']]}]))),/Instructions/);
});
test('merge ignores blanks; replace clears existing entries; locked cells require explicit opt-in',()=>{
 const args=fixture();args.schedule.assignments=[{employeeId:'e1',workDate:'2026-09-16',code:'PM',shiftCode:'PM',importRawValue:'PM',manualLock:true},{employeeId:'e2',workDate:'2026-09-17',code:'OFF',shiftCode:null,importRawValue:'OFF',importMetadata:null}];args.sheets.Schedule[1][4]='AM';
 let result=planImport(args);assert.equal(result.counts.created,0);assert.equal(result.counts.updated,0);assert.equal(result.changes[0].action,'skipped');assert.equal(result.warnings.length,1);
 result=planImport({...args,mode:'replace'});assert.equal(result.changes.find(item=>item.employeeId==='e2'&&item.workDate==='2026-09-17').after,'');assert.equal(result.counts.updated,1);
 result=planImport({...args,overwriteLocked:true});assert.equal(result.counts.updated,1);assert.equal(result.changes[0].locked,true);
});
test('validation collects ID, duplicate employee, invalid code, dates, branch/version and published failures',()=>{
 for(const mutate of [a=>a.sheets.Schedule[1][0]='unknown',a=>a.sheets.Schedule[1][1]='other-code',a=>a.sheets.Schedule.push([...a.sheets.Schedule[1]]),a=>a.sheets.Schedule[1][4]='BAD',a=>a.sheets.Schedule[0][4]='2026-02-30',a=>a.sheets.Schedule[0][5]=a.sheets.Schedule[0][4],a=>a.sheets.Instructions[1][1]='OTHER',a=>a.sheets.Instructions[3][1]='99',a=>a.schedule.status='PUBLISHED']){const args=fixture();mutate(args);const result=planImport(args);assert.equal(result.valid,false);assert.ok(result.errors.length);}
 const args=fixture();args.sheets.Schedule[1][0]='';args.sheets.Schedule[1][2]='A changed reference name';args.sheets.Schedule[1][4]='AM';assert.equal(planImport(args).valid,true);assert.equal(planImport(args).changes[0].employeeId,'e1');
});
test('configured codes and historical aliases share normalization, inactive/unknown codes reject',()=>{
 assert.equal(assignmentFor('PM Front',codes).code,'PM');assert.match(assignmentFor('PM Front',codes).importMetadata,/FRONT_CASHIER/);
 assert.throws(()=>assignmentFor('OVERTIME',codes));assert.throws(()=>assignmentFor('BW',codes));
 assert.equal(assignmentFor('CUSTOM',[{code:'CUSTOM',countsAsWorking:false}]).shiftCode,null);
});
test('manual ordering remains stable under filtering and exports, never mutates source employee records',async()=>{
 const order=['e2','e1'],rows=orderedRows(employees,order);assert.deepEqual(rows.map(item=>item.id),order);assert.equal(rows.filter(item=>item.id==='e1')[0].id,'e1');assert.deepEqual(employees.map(item=>item.id),['e1','e2']);assert.deepEqual(moveEmployee(order,'e1',0),['e1','e2']);
 const assignments=employees.map(employee=>({id:employee.id,employeeId:employee.id,employee,workDate:'2026-09-16',code:'AM'}));const sheets=await require('read-excel-file/node')(Buffer.from(scheduleWorkbook({...schedule,assignments,displayOrder:order})));assert.equal(sheets[0].data[1][0],'A employee');assert.equal(sheets[0].data[2][0],'Z employee');
});
