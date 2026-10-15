import { withAccountAccess } from '@/lib/accounts/routes';
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi, loadRoleMatrix } from "@/lib/api-auth";
import { ScheduleInputError, validatePeriod, validateWorkDate } from "@/lib/operations/schedule-input";
import { getOperationalSchedulePeriod } from "@/lib/operations/schedule";
import { scheduleBranch, readScheduleState, assertScheduleBranch, writeScheduleState, scheduleEmployees, employeeScope, completeOrder } from "@/lib/operations/schedule-state";
import { configuredCodes, assignmentFor } from "@/lib/operations/schedule-import";
import { dryRun, applyImport, restoreSnapshot } from "@/lib/operations/schedule-import-service";

function periodFromParams(searchParams) {
  const now = new Date();
  const year = Number(searchParams.get("year") || now.getFullYear());
  const month = Number(searchParams.get("month") || now.getMonth() + 1);
  return validatePeriod(year, month);
}

function failure(error) {
  const conflict = ["P2002", "P2025", "P2034", "P1008", "P2028"].includes(error.code);
  const status = error.status || (conflict ? 409 : 500);
  if (status === 500) console.error("Schedule request failed", error.code || error.name);
  return NextResponse.json({ success: false, error: status === 500 ? "Schedule request failed. Please retry." : conflict ? "Schedule changed while saving. Reload and retry." : error.message }, { status });
}
async function jsonBody(request) { try { const body = await request.json(); if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error(); return body; } catch { throw new ScheduleInputError("Invalid JSON request"); } }
async function audit(tx, user, action, summary, metadata) { await tx.auditLog.create({ data: { action, userId: user.id, summary, metadata: JSON.stringify(metadata) } }); }
async function requireSchedule(tx, id, draftOnly = false) {
  const schedule = await tx.opsSchedule.findUnique({ where: { id: String(id || "") }, include: { assignments: true } });
  if (!schedule) throw new ScheduleInputError("Schedule not found", 404);
  if (draftOnly && schedule.status !== "DRAFT") throw new ScheduleInputError("Only draft schedules can be changed", 409);
  return schedule;
}
async function GETHandler(request) {
  const { user, error } = await authorizeApi("OPS_SCHEDULE_READ");
  if (error) return error;
  try {
    const { year, month } = periodFromParams(new URL(request.url).searchParams);
    const branch=await scheduleBranch(prisma,user,new URL(request.url).searchParams.get("branch"));
    let schedules = await prisma.opsSchedule.findMany({
      where: { operationalYear: year, operationalMonth: month },
      include: { assignments: { where: { employee: await employeeScope(prisma,branch) }, include: { employee: { select: { id: true, name: true, nameEn: true, hrisNumber: true, localEmployeeCode: true, department: true, jobTitle:true, branch:true } } }, orderBy: [{ employee: { name: "asc" } }, { workDate: "asc" }] } },
      orderBy: { version: "desc" },
    });
    const requestedId = new URL(request.url).searchParams.get("scheduleId");
    if (requestedId && !schedules.some(item => item.id === requestedId)) throw new ScheduleInputError("Schedule not found in this period", 404);
    const employees=await scheduleEmployees(prisma,branch);
    const states=await Promise.all(schedules.map(schedule=>readScheduleState(prisma,schedule.id)));
    schedules=schedules.filter((schedule,index)=>states[index].state.branch===branch).map(schedule=>{const state=states.find(item=>item.row?.key===`OPS_SCHEDULE_STATE:${schedule.id}`)?.state || {branch,revision:0,displayOrder:[]};return {...schedule,state,displayOrder:completeOrder([...employees,...schedule.assignments.map(item=>item.employee)],state.displayOrder)};});
    if(requestedId&&!schedules.some(item=>item.id===requestedId))throw new ScheduleInputError("Schedule not found in branch",404);
    const schedule = (requestedId ? schedules.find((item) => item.id === requestedId) : null) || schedules.find((item) => item.status === "DRAFT") || schedules.find((item) => item.status === "PUBLISHED") || schedules[0] || null;
    const branches=!user.profile?.allBranches?user.profile?.branches||[branch]:[...new Set([branch,...(await prisma.employee.findMany({where:{active:true,branch:{not:null}},select:{branch:true},distinct:["branch"]})).map(item=>item.branch)])];
    const snapshots=schedule?(await prisma.systemSetting.findMany({where:{key:{startsWith:"OPS_SCHEDULE_SNAPSHOT:"}}})).map(row=>JSON.parse(row.value)).filter(item=>item.scheduleId===schedule.id&&item.branch===branch).map(({id,createdAt,importId})=>({id,createdAt,importId})).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)):[];
    return NextResponse.json({ success: true, branch, branches, snapshots, codes:await configuredCodes(prisma), canManage:Boolean(user.permissions?.['schedules.edit'] || user.permissions?.['schedules.create']), canPublish:Boolean(user.permissions?.['schedules.publish']), employees, period: getOperationalSchedulePeriod(year, month), versions: schedules.map(({ assignments, ...item }) => ({ ...item, assignmentCount: assignments.length })), schedule });
  } catch (requestError) {
    return failure(requestError);
  }
}

async function PATCHHandler(request) {
  const { user, error } = await authorizeApi("OPS_SCHEDULE_MANAGE");
  if (error) return error;
  try {
    const body = await jsonBody(request);
    const branch=await scheduleBranch(prisma,user,body.branch);
    let data;try{data=assignmentFor(body.value,await configuredCodes(prisma));}catch(error){throw new ScheduleInputError(error.message);}
    const saved = await prisma.$transaction(async tx => {
      const schedule = await requireSchedule(tx, body.scheduleId, true);
      const previousState=await assertScheduleBranch(tx,schedule,branch);
      const workDate = validateWorkDate(body.workDate, schedule);
      const employee=(await scheduleEmployees(tx,branch)).find(item=>item.id===String(body.employeeId||""));
      if (!employee) throw new ScheduleInputError("Invalid operational employee");
      const previous=await tx.opsScheduleAssignment.findUnique({where:{scheduleId_employeeId_workDate:{scheduleId:schedule.id,employeeId:employee.id,workDate}}});
      if(Object.hasOwn(body,"expectedUpdatedAt") && (previous?.updatedAt?.toISOString()||null)!==body.expectedUpdatedAt)throw new ScheduleInputError("This cell changed. Reload before editing it.",409);
      const result = await tx.opsScheduleAssignment.upsert({ where: { scheduleId_employeeId_workDate: { scheduleId: schedule.id, employeeId: employee.id, workDate } }, update: { ...data, source: "MANUAL", manualLock:true }, create: { scheduleId: schedule.id, employeeId: employee.id, workDate, ...data, source: "MANUAL", manualLock:true } });
      await audit(tx, user, "OPS_SCHEDULE_CELL_UPDATED", "Updated schedule cell", { scheduleId: schedule.id, employeeId: employee.id, workDate, code: data.code });
      const state=await writeScheduleState(tx,schedule.id,previousState,previousState.state,user.id);
      return {assignment:result,state};
    });
    return NextResponse.json({ success: true, ...saved });
  } catch (error) { return failure(error); }
}

async function POSTHandler(request) {
  try {
    if (String(request.headers.get("content-type")||"").includes("multipart/form-data")) {
      const {user,error}=await authorizeApi("OPS_SCHEDULE_MANAGE"); if(error)return error;
      const form=await request.formData(),file=form.get("file");
      if(!file||typeof file.arrayBuffer!=="function"||!/\.xlsx$/i.test(file.name)||file.size<1||file.size>8*1024*1024)throw new ScheduleInputError("Choose an XLSX workbook up to 8 MB");
      const branch=await scheduleBranch(prisma,user,form.get("branch"));
      return NextResponse.json({success:true,...await dryRun(prisma,user,{scheduleId:String(form.get("scheduleId")||""),branch,buffer:Buffer.from(await file.arrayBuffer()),fileName:file.name,mode:String(form.get("mode")||"merge"),overwriteLocked:form.get("overwriteLocked")==="true"})});
    }
    const body = await jsonBody(request);
    const {user,error}=await authorizeApi(body.action === "publish" ? "OPS_SCHEDULE_PUBLISH" : "OPS_SCHEDULE_MANAGE"); if(error)return error;
    const branch=await scheduleBranch(prisma,user,body.branch);
    if(body.action==="applyImport")return NextResponse.json({success:true,...await applyImport(prisma,user,{...body,branch})});
    if(body.action==="restoreImport")return NextResponse.json({success:true,...await restoreSnapshot(prisma,user,{...body,branch})});
    if(body.action==="reorder"){
      const state=await prisma.$transaction(async tx=>{
        const schedule=await requireSchedule(tx,body.scheduleId,true),previous=await assertScheduleBranch(tx,schedule,branch);
        if(body.expectedRevision!==previous.state.revision)throw new ScheduleInputError("Employee order changed. Reload before reordering.",409);
        const employees=await scheduleEmployees(tx,branch,schedule.assignments.map(item=>item.employeeId)),ids=completeOrder(employees,previous.state.displayOrder);
        if(!Array.isArray(body.displayOrder)||body.displayOrder.length!==ids.length||new Set(body.displayOrder).size!==ids.length||body.displayOrder.some(id=>!ids.includes(id)))throw new ScheduleInputError("Order must include every eligible employee exactly once");
        const result=await writeScheduleState(tx,schedule.id,previous,{...previous.state,displayOrder:body.displayOrder},user.id);
        await audit(tx,user,"OPS_SCHEDULE_ORDER_UPDATED","Updated schedule employee order",{scheduleId:schedule.id,branch,before:ids,after:body.displayOrder});return result;
      });return NextResponse.json({success:true,state});
    }
    if (!["createBlankDraft","createRevision","publish","deleteDraft"].includes(body.action)) throw new ScheduleInputError("Unknown schedule action");
    const schedule = await prisma.$transaction(async tx => {
      if (body.action === "createBlankDraft") {
        const {year,month} = validatePeriod(Number(body.year),Number(body.month));
        const period = getOperationalSchedulePeriod(year,month);
        const latest = await tx.opsSchedule.findFirst({where:{operationalYear:year,operationalMonth:month},orderBy:{version:"desc"}});
        const created = await tx.opsSchedule.create({data:{year,month,operationalYear:year,operationalMonth:month,periodStart:period.startDate,periodEnd:period.endDate,version:(latest?.version||0)+1,status:"DRAFT",basedOnScheduleId:latest?.id||null}});
        const prior=await readScheduleState(tx,created.id),employees=await scheduleEmployees(tx,branch);
        await writeScheduleState(tx,created.id,prior,{...prior.state,branch,displayOrder:employees.map(item=>item.id)},user.id);
        await audit(tx,user,"OPS_SCHEDULE_DRAFT_CREATED","Created blank schedule draft",{scheduleId:created.id}); return created;
      }
      const source = await requireSchedule(tx,body.scheduleId,body.action!=="createRevision");
      const sourceState=await assertScheduleBranch(tx,source,branch);
      if (body.action === "createRevision") {
        const latest = await tx.opsSchedule.findFirst({where:{operationalYear:source.operationalYear,operationalMonth:source.operationalMonth},orderBy:{version:"desc"}});
        const created = await tx.opsSchedule.create({data:{year:source.year,month:source.month,operationalYear:source.operationalYear,operationalMonth:source.operationalMonth,periodStart:source.periodStart,periodEnd:source.periodEnd,version:(latest?.version||0)+1,status:"DRAFT",basedOnScheduleId:source.id}});
        if(source.assignments.length) await tx.opsScheduleAssignment.createMany({data:source.assignments.map(item=>({scheduleId:created.id,employeeId:item.employeeId,workDate:item.workDate,code:item.code,shiftCode:item.shiftCode,source:"REVISION",importRawValue:item.importRawValue,importMetadata:item.importMetadata,manualLock:item.manualLock}))});
        await writeScheduleState(tx,created.id,await readScheduleState(tx,created.id),{...sourceState.state,branch},user.id);
        await audit(tx,user,"OPS_SCHEDULE_REVISION_CREATED","Created schedule revision",{scheduleId:created.id,basedOn:source.id}); return created;
      }
      if (body.action === "publish") {
        if(!source.assignments.length) throw new ScheduleInputError("An empty schedule cannot be published");
        const publishedSchedules=await tx.opsSchedule.findMany({where:{operationalYear:source.operationalYear,operationalMonth:source.operationalMonth,status:"PUBLISHED"}});
        const ids=[];for(const item of publishedSchedules)if((await readScheduleState(tx,item.id)).state.branch===branch)ids.push(item.id);
        await tx.opsSchedule.updateMany({where:{id:{in:ids}},data:{status:"SUPERSEDED"}});
        const published = await tx.opsSchedule.update({where:{id:source.id},data:{status:"PUBLISHED",publishedAt:new Date()}});
        await audit(tx,user,"OPS_SCHEDULE_PUBLISHED","Published schedule revision",{scheduleId:source.id}); return published;
      }
      await tx.opsSchedule.delete({where:{id:source.id}});
      await audit(tx,user,"OPS_SCHEDULE_DRAFT_DELETED","Deleted schedule draft",{scheduleId:source.id}); return null;
    });
    return NextResponse.json({success:true,...(schedule?{schedule}:{})},{status:body.action==="createBlankDraft"?201:200});
  } catch(error) { return failure(error); }
}

export const GET=withAccountAccess(GETHandler);
export const PATCH=withAccountAccess(PATCHHandler);
export const POST=withAccountAccess(POSTHandler);
