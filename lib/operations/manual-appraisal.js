const { defaultPerformanceSettings } = require("./performance-settings-config");

function normalizeManualAppraisalRows(rows, bounds) {
  const initial = defaultPerformanceSettings().monthlyAppraisal;
  const { minimum = initial.finalScoreMinimum, maximum = initial.finalScoreMaximum } = bounds || {};
  if (!Array.isArray(rows) || !rows.length) throw new Error("Enter at least one manual appraisal score");
  const seen = new Set();
  return rows.map((row) => {
    const employeeId = String(row?.employeeId || "").trim();
    const totalScore = Number(row?.totalScore);
    if (!employeeId) throw new Error("Every manual score requires an employee");
    if (seen.has(employeeId)) throw new Error("The same employee cannot be entered twice");
    if (!Number.isFinite(totalScore) || totalScore < minimum || totalScore > maximum) throw new Error(`Manual score must be between ${minimum} and ${maximum}`);
    seen.add(employeeId);
    return { employeeId, totalScore };
  });
}

function manualAppraisalSnapshots({ totalScore, reason, userId, priorAppraisal }) {
  const enteredAt = new Date().toISOString();
  return {
    componentSnapshotJson: JSON.stringify({ manualScore: totalScore }),
    sourceSnapshotJson: JSON.stringify({
      source: "MANUAL_OVERRIDE",
      reason,
      enteredBy: userId,
      enteredAt,
      previousAppraisalId: priorAppraisal?.id || null,
      previousVersion: priorAppraisal?.version || null,
      previousScore: priorAppraisal?.totalScore ?? null,
    }),
    calculationExplanationJson: JSON.stringify({ mode: "MANUAL_OVERRIDE", explanation: reason }),
  };
}

function manualAppraisalMeta(appraisal) {
  try {
    const source = JSON.parse(appraisal?.sourceSnapshotJson || "{}");
    return source.source === "MANUAL_OVERRIDE" ? { entryMode: "MANUAL", manualReason: source.reason || "" } : { entryMode: "CALCULATED", manualReason: "" };
  } catch {
    return { entryMode: "CALCULATED", manualReason: "" };
  }
}

module.exports = { manualAppraisalMeta, manualAppraisalSnapshots, normalizeManualAppraisalRows };

const COMPONENT_PREFIX='OPS_MONTHLY_COMPONENT:';
function componentError(message,status=422){return Object.assign(new Error(message),{status});}
function normalizeComponentEntry(row,{branch,year,month}) {
  if(!Number.isInteger(year)||year<2020||year>2100||!Number.isInteger(month)||month<1||month>12)throw componentError('A valid historical month is required');
  const employeeId=String(row.employeeId||'').trim(),component=String(row.component||''),source=String(row.source||'').trim(),reason=String(row.reason||'').trim(),evidence=String(row.evidence||'').trim(),value=Number(row.value),responseCount=Number(row.responseCount??1);
  if(!employeeId||!['recognition','guestFeedback'].includes(component))throw componentError('Select an employee and Recognition or Guest Feedback');
  if(!['number','string'].includes(typeof row.value)||String(row.value).trim()===''||!Number.isFinite(value)||value<0||value>100)throw componentError('Historical component value must be from 0 to 100');
  if(source.length<3||reason.length<5)throw componentError('A traceable historical source and evidence/reason are required');
  if(!Number.isInteger(responseCount)||responseCount<1||responseCount>100000)throw componentError('A valid historical response count is required');
  return {employeeId,component,branch,month:`${year}-${String(month).padStart(2,'0')}`,source:source.slice(0,200),reason:reason.slice(0,2000),evidence:evidence.slice(0,2000),value,responseCount:component==='guestFeedback'?responseCount:1};
}
async function componentEmployeeAccess(db,user,employeeId,branch,permission) {
  const employee=await db.employee.findUnique({where:{id:employeeId},select:{id:true,branch:true,active:true,employmentStatus:true}});
  if(!employee)throw componentError('Employee not found',404);
  await require('./business-access').assertEmployeeBranch(db,employee,branch);
  if(user.profile){require('../accounts/service').assertCan(user,permission);const scope=await require('../accounts/enforcement').resolveScope(db,user,permission);if(!scope.unrestricted&&!scope.employeeIds?.includes(employeeId))throw componentError('Employee is outside your access scope',403);}
  return employee;
}
async function listMonthlyComponentEntries(db,{branch,year,month,employeeIds}) {
  const period=`${year}-${String(month).padStart(2,'0')}`;
  const rows=await db.systemSetting.findMany({where:{key:{startsWith:COMPONENT_PREFIX}}});
  return rows.map(row=>JSON.parse(row.value)).filter(row=>row.branch===branch&&row.month===period&&(!employeeIds||employeeIds.includes(row.employeeId))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
async function changeMonthlyComponentEntry(db,{user,branch,year,month,action,rows,id,reason}) {
  const result=await db.$transaction(async tx=>{
    const effective=await require('./performance-settings-service').getEffectivePerformanceSettings(tx,{branch,date:require('./monthly-summary').periodDates(year,month).end});
    const config=effective.value.monthlyAppraisal;
    const approval=action==='appraisalSourceApprove';
    require('./business-access').assertBusinessRole(user,approval?config.workflow.approvalRoles:config.workflow.reviewRoles);
    const now=new Date().toISOString();
    if(action==='appraisalSourcePropose') {
      if(!Array.isArray(rows)||!rows.length||rows.length>100)throw componentError('Enter or import between 1 and 100 historical component rows');
      const normalized=rows.map(row=>normalizeComponentEntry(row,{branch,year,month}));
      const entries=[];
      for(const entry of normalized){
        await componentEmployeeAccess(tx,user,entry.employeeId,branch,'appraisals.edit');
        if(user.employeeId===entry.employeeId)throw componentError('You cannot enter your own historical score',403);
        // Content identity makes a retried import safe without consuming client tokens.
        const identity=require('./performance-sources').hash({...entry,createdBy:user.id});
        const key=COMPONENT_PREFIX+identity,prior=await tx.systemSetting.findUnique({where:{key}});
        if(prior){entries.push(JSON.parse(prior.value));continue;}
        const record={...entry,id:identity,status:'PROPOSED',createdBy:user.id,createdAt:now,updatedAt:now,approvedBy:null,approvedAt:null,history:[{action:'PROPOSED',by:user.id,at:now}]};
        await tx.systemSetting.create({data:{key,value:JSON.stringify(record),updatedBy:user.id,description:'Audited monthly numeric source evidence'}});
        await tx.auditLog.create({data:{action:'OPS_MONTHLY_COMPONENT_PROPOSED',userId:user.id,summary:`Proposed historical ${entry.component} for ${entry.month}`,metadata:JSON.stringify({entryId:identity,...entry})}});
        entries.push(record);
      }
      return {entries};
    }
    if(!['appraisalSourceApprove','appraisalSourceCancel'].includes(action))throw componentError('Unknown historical source action',400);
    const key=COMPONENT_PREFIX+String(id||''),stored=await tx.systemSetting.findUnique({where:{key}});
    if(!stored)throw componentError('Historical source entry not found',404);
    const record=JSON.parse(stored.value);
    if(record.branch!==branch||record.month!==`${year}-${String(month).padStart(2,'0')}`)throw componentError('Historical entry belongs to another branch or month',403);
    await componentEmployeeAccess(tx,user,record.employeeId,branch,approval?'appraisals.approve':'appraisals.edit');
    if(user.employeeId===record.employeeId)throw componentError('You cannot approve or adjust your own historical score',403);
    if(record.status===(approval?'APPROVED':'CANCELLED'))return {entries:[record],unchanged:true};
    if(String(reason||'').trim().length<5)throw componentError('An approval or cancellation reason is required');
    if(approval){
      if(record.status!=='PROPOSED')throw componentError('Only a proposed historical source can be approved');
      if(user.id===record.createdBy||user.employeeId===record.employeeId)throw componentError('Historical sources require an independent approver',403);
      const preview=await require('./monthly-summary').previewMonthlyAppraisal(tx,{employeeId:record.employeeId,branch,year,month,effective});
      if(preview.summary.archived)throw componentError('Archived employees cannot receive historical source approval');
      if(preview.summary.sourceEvidence[record.component].mode==='AUTOMATIC')throw componentError('Automatic evidence exists. Historical entry cannot replace approved automatic data',409);
      const existing=await listMonthlyComponentEntries(tx,{branch,year,month,employeeIds:[record.employeeId]});
      if(existing.some(item=>item.component===record.component&&item.status==='APPROVED'&&item.id!==record.id))throw componentError('An approved historical source already exists; explicitly cancel it before replacement',409);
      record.approvedBy=user.id;record.approvedAt=now;
    }
    record.status=approval?'APPROVED':'CANCELLED';record.updatedAt=now;record.history.push({action:record.status,by:user.id,at:now,reason:String(reason).trim()});
    await tx.systemSetting.update({where:{key},data:{value:JSON.stringify(record),updatedBy:user.id}});
    await tx.auditLog.create({data:{action:approval?'OPS_MONTHLY_COMPONENT_APPROVED':'OPS_MONTHLY_COMPONENT_CANCELLED',userId:user.id,summary:`${record.status} historical ${record.component} for ${record.month}`,metadata:JSON.stringify({entryId:record.id,employeeId:record.employeeId,branch,month:record.month,value:record.value,reason})}});
    return {entries:[record]};
  },{timeout:30000});
  if(action!=='appraisalSourcePropose'&&!result.unchanged)result.monthlyRefresh=await require('./employee-of-month').syncMonthlySummaries(db,{user,branch,year,month,employeeIds:[...new Set(result.entries.map(row=>row.employeeId))],reason:'Approved historical component source changed'});
  return result;
}
Object.assign(module.exports,{COMPONENT_PREFIX,normalizeComponentEntry,listMonthlyComponentEntries,changeMonthlyComponentEntry});
