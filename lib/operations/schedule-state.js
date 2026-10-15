const { createHash } = require('node:crypto');
const { ScheduleInputError } = require('./schedule-input');

const stateKey = id => `OPS_SCHEDULE_STATE:${id}`;
async function defaultBranch(db) {
  const row = await db.systemSetting.findUnique({ where: { key: 'OPS_BRANCH_CONFIG' } });
  return String(JSON.parse(row?.value || '{}').branchCode || 'MOT').toUpperCase();
}
async function scheduleBranch(db, user, requested) {
  const fallback = await defaultBranch(db);
  if(user.profile){const branch=String(requested||user.profile.branches[0]||fallback).trim().toUpperCase();if(!/^[A-Z0-9_-]{1,40}$/.test(branch))throw new ScheduleInputError('Invalid branch');if(!user.profile.allBranches&&!user.profile.branches.includes(branch))throw new ScheduleInputError('Branch access denied',403);return branch;}
  const actor = user.role === 'MANAGER' ? await db.user.findUnique({where:{id:user.id},include:{employee:true}}) : user;
  const allowed = String(actor?.employee?.branch || fallback).toUpperCase();
  const branch = String(requested || (user.role === 'MANAGER' ? allowed : fallback)).trim().toUpperCase();
  if (!/^[A-Z0-9_-]{1,40}$/.test(branch)) throw new ScheduleInputError('Invalid branch');
  if (user.role === 'MANAGER' && branch !== allowed) throw new ScheduleInputError('Branch access denied', 403);
  return branch;
}
async function readScheduleState(db, scheduleId) {
  const row = await db.systemSetting.findUnique({where:{key:stateKey(scheduleId)}});
  return { row, state: row ? JSON.parse(row.value) : {branch:await defaultBranch(db),revision:0,displayOrder:[]} };
}
async function assertScheduleBranch(db, schedule, branch) {
  const result = await readScheduleState(db,schedule.id);
  if (result.state.branch !== branch) throw new ScheduleInputError('Schedule belongs to another branch',403);
  return result;
}
async function publishedScheduleForBranch(db,date,branch){
  const schedules=await db.opsSchedule.findMany({where:{status:'PUBLISHED',periodStart:{lte:date},periodEnd:{gte:date}},orderBy:{version:'desc'}});
  for(const schedule of schedules)if((await readScheduleState(db,schedule.id)).state.branch===branch)return schedule;
  return null;
}
async function writeScheduleState(tx, scheduleId, previous, state, userId) {
  const key=stateKey(scheduleId), value=JSON.stringify({...state,revision:previous.state.revision+1});
  if(previous.row){
    const result=await tx.systemSetting.updateMany({where:{key,value:previous.row.value},data:{value,updatedBy:userId}});
    if(result.count!==1)throw new ScheduleInputError('Schedule changed. Reload before retrying.',409);
  }else await tx.systemSetting.create({data:{key,value,updatedBy:userId}});
  return JSON.parse(value);
}
function orderedRows(rows, displayOrder=[], id=item=>item.employeeId || item.employee?.id || item.id) {
  const ranks=new Map(displayOrder.map((value,index)=>[value,index]));
  return [...rows].sort((a,b)=>(ranks.get(id(a))??Number.MAX_SAFE_INTEGER)-(ranks.get(id(b))??Number.MAX_SAFE_INTEGER) || String(a.employee?.name || a.name || '').localeCompare(String(b.employee?.name || b.name || '')) || String(id(a)).localeCompare(String(id(b))));
}
function completeOrder(employees, order=[]) {
  const allowed=new Set(employees.map(item=>item.id));
  return [...new Set([...order.filter(id=>allowed.has(id)),...employees.map(item=>item.id)])];
}
async function employeeScope(db,branch){
  const fallback=await defaultBranch(db);
  return {department:{in:['OPERATION','CASHIER']},...(branch===fallback?{OR:[{branch},{branch:null}]}:{branch})};
}
async function scheduleEmployees(db,branch,assignedIds=[]) {
  return db.employee.findMany({where:{AND:[await employeeScope(db,branch),{OR:[{active:true},{id:{in:assignedIds}}]}]},select:{id:true,name:true,nameEn:true,hrisNumber:true,localEmployeeCode:true,department:true,jobTitle:true,branch:true},orderBy:[{name:'asc'},{id:'asc'}]});
}
function fingerprint(schedule,state) {
  const cells=[...(schedule.assignments||[])].sort((a,b)=>a.id.localeCompare(b.id));
  return createHash('sha256').update(JSON.stringify({id:schedule.id,status:schedule.status,periodStart:schedule.periodStart,periodEnd:schedule.periodEnd,updatedAt:schedule.updatedAt,state,cells})).digest('hex');
}
module.exports={stateKey,defaultBranch,scheduleBranch,readScheduleState,assertScheduleBranch,publishedScheduleForBranch,writeScheduleState,orderedRows,completeOrder,employeeScope,scheduleEmployees,fingerprint};
