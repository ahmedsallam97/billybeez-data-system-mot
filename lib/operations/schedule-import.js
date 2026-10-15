const {datesInPeriod,normalizeScheduleCode}=require('./schedule');
const {workbookFromSheets,columnName}=require('./schedule-export');
const readWorkbook=require('read-excel-file/node');
const HEADERS=['Employee ID','Employee Code','Name (reference)','Role (reference)'];
const text=value=>String(value??'').trim();
async function configuredCodes(db){
  const [codes,shifts]=await Promise.all([db.opsScheduleCode.findMany({where:{active:true},orderBy:{sortOrder:'asc'}}),db.opsShiftDefinition.findMany({where:{active:true},orderBy:{sortOrder:'asc'}})]);
  const map=new Map(codes.filter(item=>!['OVERTIME'].includes(item.code)).map(item=>[item.code,{...item}]));
  for(const shift of shifts)map.set(shift.code,{...map.get(shift.code),code:shift.code,label:shift.label,labelAr:shift.labelAr,countsAsWorking:true});
  return [...map.values()];
}
function assignmentFor(value,codes){
  const rawValue=text(value), normalized=normalizeScheduleCode(rawValue);
  const code=codes.find(item=>item.code.toUpperCase()===rawValue.toUpperCase()) || codes.find(item=>item.code===normalized.code);
  if(!code||code.code==='OVERTIME')throw new Error('Invalid or inactive schedule code');
  return {code:code.code,shiftCode:code.countsAsWorking?code.code:null,importRawValue:rawValue,importMetadata:normalized.metadata?JSON.stringify(normalized.metadata):null};
}
function templateSheets(schedule,employees,codes,branch){
  const dates=datesInPeriod({startDate:schedule.periodStart,endDate:schedule.periodEnd});
  const instructions=[['Operations schedule import','Format 1 · draft only'],['Branch',branch],['Schedule ID',schedule.id],['Version',String(schedule.version)],['Operational year',String(schedule.operationalYear)],['Operational month',String(schedule.operationalMonth)],['Period start',schedule.periodStart],['Period end',schedule.periodEnd],['How to use','Fill date cells in Schedule using Codes. Do not change identity, metadata or headers.'],['Identity','Employee ID or Employee Code is authoritative. Name and role are reference only.'],['Merge','Blank cells leave existing entries unchanged.'],['Replace','Blank cells remove existing entries in this selected period; confirmation and snapshot required.'],['Safety','Upload for validation first. Apply separately. Locked cells are skipped unless explicitly confirmed.'],['Dates','Use the generated YYYY-MM-DD headers; all dates in this operational period must remain.'],['Order','Worksheet order does not alter the saved employee display order.']];
  return [{name:'Instructions',rows:instructions,layout:{widths:[36,104],rowHeight:36}},{name:'Schedule',layout:{widths:[39,22,42,26,...dates.map(()=>14)],rowHeight:38,freeze:{columns:2},inputColumn:4,referenceColumns:[2,3]},rows:[HEADERS.concat(dates),...employees.map(item=>[item.id,item.hrisNumber||item.localEmployeeCode||'',item.name,item.jobTitle||item.department,...dates.map(()=>'')])],validation:employees.length?`<dataValidations count="1"><dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Invalid schedule code" error="Choose a code from Codes" sqref="E2:${columnName(HEADERS.length+dates.length-1)}${employees.length+1}"><formula1>ScheduleCodes</formula1></dataValidation></dataValidations>`:''},{name:'Codes',layout:{widths:[20,36,40,20],rowHeight:32,freeze:{columns:0}},rows:[['Code','Meaning','Arabic meaning','Working shift'],...codes.map(item=>[item.code,item.label,item.labelAr||'',item.countsAsWorking?'Yes':'No'])]}];
}
function importTemplate(...args){return workbookFromSheets(templateSheets(...args));}
async function parseWorkbook(buffer){
  if(buffer.length>8*1024*1024||buffer.slice(0,2).toString()!=='PK')throw new Error('Choose a readable XLSX workbook up to 8 MB');
  const sheets=await readWorkbook(buffer);
  if(sheets.length!==3||['Instructions','Schedule','Codes'].some(name=>sheets.filter(item=>item.sheet===name).length!==1))throw new Error('Workbook must contain exactly Instructions, Schedule and Codes sheets');
  return Object.fromEntries(sheets.map(sheet=>[sheet.sheet,sheet.data]));
}
function planImport({sheets,schedule,employees,codes,branch,mode='merge',overwriteLocked=false}){
  const errors=[],warnings=[],changes=[],counts={created:0,updated:0,unchanged:0,skipped:0,rejected:0};
  if(!['merge','replace'].includes(mode))errors.push('Choose merge or replace');
  if(schedule.status!=='DRAFT')errors.push('Published schedules cannot be imported; create a draft revision first');
  const metadataRows=(sheets.Instructions||[]).map(row=>[text(row[0]),text(row[1])]);
  const metadata=new Map(metadataRows);
  if(new Set(metadataRows.map(row=>row[0])).size!==metadataRows.length)errors.push('Duplicate Instructions metadata');
  const codeRows=sheets.Codes||[];
  if(text(codeRows[0]?.[0])!=='Code'||codeRows.length!==codes.length+1||codeRows.slice(1).some((row,index)=>text(row[0])!==codes[index].code))errors.push('Codes sheet changed or code configuration changed; download a fresh template');
  for(const [key,value]of [['Branch',branch],['Schedule ID',schedule.id],['Version',String(schedule.version)],['Operational year',String(schedule.operationalYear)],['Operational month',String(schedule.operationalMonth)],['Period start',schedule.periodStart],['Period end',schedule.periodEnd]])if(metadata.get(key)!==value)errors.push(`${key} mismatch: download a template for the selected draft`);
  const rows=sheets.Schedule||[];
  const dates=datesInPeriod({startDate:schedule.periodStart,endDate:schedule.periodEnd});
  const header=rows[0]||[];
  if(rows.length<2||rows.length>5000||rows.some(row=>row.length>100))errors.push('Schedule must contain 2–5000 rows and at most 100 columns');
  if(HEADERS.some((value,index)=>text(header[index])!==value))errors.push('Malformed Schedule identity columns');
  const parsedDates=header.slice(4).map(value=>value instanceof Date?value.toISOString().slice(0,10):text(value));
  if(parsedDates.length!==dates.length||parsedDates.some((date,index)=>date!==dates[index]))errors.push('Invalid, duplicate, missing or out-of-period date headers; retain the generated ISO dates');
  const ids=new Map(employees.map(item=>[item.id,item])),codesToEmployees=new Map();
  for(const employee of employees)for(const code of [employee.hrisNumber,employee.localEmployeeCode].filter(Boolean)){const matches=codesToEmployees.get(code)||[];matches.push(employee);codesToEmployees.set(code,matches);}
  const current=new Map(schedule.assignments.map(item=>[`${item.employeeId}:${item.workDate}`,item]));
  const seen=new Set(),touched=new Set();
  for(let index=1;index<rows.length;index++){
    const row=rows[index];if(row.every(value=>!text(value)))continue;
    if(row.slice(header.length).some(value=>text(value)))errors.push(`Row ${index+1}: data outside the declared date columns`);
    const id=text(row[0]),code=text(row[1]);let employee;
    if(id)employee=ids.get(id);else if(codesToEmployees.get(code)?.length===1)employee=codesToEmployees.get(code)[0];
    if(!employee||(code&&![employee.hrisNumber,employee.localEmployeeCode].includes(code))){errors.push(`Row ${index+1}: invalid employee ID/code or employee belongs to another branch`);counts.rejected++;continue;}
    if(seen.has(employee.id)){errors.push(`Row ${index+1}: duplicate employee`);counts.rejected++;continue;}seen.add(employee.id);
    for(let col=0;col<dates.length;col++){
      const value=text(row[col+4]),workDate=dates[col],key=`${employee.id}:${workDate}`,before=current.get(key);
      if(!value&&mode==='merge'){counts.skipped++;continue;}
      let data=null;
      if(value)try{data=assignmentFor(value,codes);}catch(error){errors.push(`Row ${index+1}, ${workDate}: ${error.message} (${value})`);counts.rejected++;continue;}
      touched.add(key);addChange(employee,workDate,before,data,index+1);
    }
  }
  if(mode==='replace')for(const [key,before]of current)if(!touched.has(key)&&ids.has(before.employeeId))addChange(ids.get(before.employeeId),before.workDate,before,null,null);
  function addChange(employee,workDate,before,data,row){
    if(workDate<schedule.periodStart||workDate>schedule.periodEnd)return;
    const same=(!before&&!data)||(before&&data&&before.code===data.code&&before.shiftCode===data.shiftCode&&before.importRawValue===data.importRawValue&&before.importMetadata===data.importMetadata);
    const isLocked=Boolean(before?.manualLock || before?.source==='MANUAL');
    const locked=isLocked&&!overwriteLocked;
    const action=same?'unchanged':locked?'skipped':!before?'created':'updated';counts[action]++;
    if(locked&&!same)warnings.push(`${employee.name} ${workDate}: locked cell preserved`);
    changes.push({employeeId:employee.id,employeeName:employee.name,workDate,row,before:before?.importRawValue||before?.code||'',after:data?.importRawValue||'',action,locked:isLocked,data});
  }
  if(!seen.size)errors.push('No eligible employee rows found');
  return {valid:errors.length===0,errors,warnings,counts,changes,mode,overwriteLocked,branch,scheduleId:schedule.id};
}
module.exports={HEADERS,configuredCodes,assignmentFor,templateSheets,importTemplate,parseWorkbook,planImport};
