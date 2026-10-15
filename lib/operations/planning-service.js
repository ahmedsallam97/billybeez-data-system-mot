const {randomUUID}=require('node:crypto');
const {loadAccount,assertCan,readConfig}=require('../accounts/service');
const {resolveScope}=require('../accounts/enforcement');
const {effectivePermissions,isOperationsRole}=require('../accounts/registry');
const {operationsBranch,assertEmployeeBranch,employeeBranchFilter,assertBusinessRole}=require('./business-access');
const {getEffectivePerformanceSettings,readPerformanceSettingsSnapshot,capturePerformanceSettingsSnapshot}=require('./performance-settings-service');
const {resolveSuccessionPath}=require('./performance-policy');
const {enrichSuccessionActions}=require('./succession-actions');
const {PLAN_PREFIX,keyOf,planPath}=require('./succession-workspace');
const {isValidIsoDate}=require('./performance-settings-config');
const {PLAN_STATUSES,ACTION_STATUSES,DECISIONS,developmentProgress,attention}=require('./career-planning');
const DEVELOPMENT_PREFIX='OPS_DEVELOPMENT_PLAN:';
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
const text=(value,min=1,max=3000)=>{if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)fail('Please provide a clear description within the allowed length');return value.trim();};
const date=(value)=>{if(!isValidIsoDate(value))fail('Use a valid date');return value;};
async function access(db,user,permission,employeeId,requestedBranch){
 const raw=await db.user.findUnique({where:{id:user.id}});if(!raw?.active)fail('Login required',401);
 const fresh=await loadAccount(db,raw);if(user.profile?.sessionVersion!==fresh.profile.sessionVersion)fail('Login required',401);
 assertCan(fresh,permission);const scope=await resolveScope(db,fresh,permission),branch=await operationsBranch(db,fresh,requestedBranch);
 if(!scope.unrestricted&&(!scope.branches.includes(branch)||(employeeId&&!scope.employeeIds.includes(employeeId))))fail('Record access denied',403);
 return {user:fresh,scope,branch};
}
async function ownersFor(db,branch,permission){
 const {config}=await readConfig(db),result=[];
 for(const [id,profile]of Object.entries(config.accounts)){
  const role=config.roles.find(row=>row.id===profile.roleId);
  if(profile.archivedAt||!isOperationsRole(role)||!(profile.allBranches||profile.branches?.includes(branch))||!effectivePermissions(role,profile)[permission])continue;
  const raw=await db.user.findUnique({where:{id},select:{id:true,name:true,active:true}});if(raw?.active)result.push({id,name:profile.displayName||raw.name});
 }
 return result;
}
async function verifyOwner(db,branch,id,employeeId,permission='development.edit'){
 if(!(await ownersFor(db,branch,permission)).some(row=>row.id===id))fail('Select an active responsible manager with access in this branch');
 const raw=await db.user.findUnique({where:{id}}),fresh=await loadAccount(db,raw),scope=await resolveScope(db,fresh,permission);
 if(!scope.unrestricted&&!scope.employeeIds.includes(employeeId))fail('Responsible manager cannot access this employee');
}
async function audit(tx,user,branch,employeeId,action,metadata,reason){await tx.auditLog.create({data:{action,userId:user.id,summary:reason,metadata:JSON.stringify({branch,employeeId,...metadata})}});}
async function replace(tx,key,row,value,user){
 if(row){const changed=await tx.systemSetting.updateMany({where:{key,value:row.value},data:{value:JSON.stringify(value),updatedBy:user.id}});if(changed.count!==1)fail('This record changed. Reload before saving.',409);}
 else await tx.systemSetting.create({data:{key,value:JSON.stringify(value),updatedBy:user.id}});
}
async function evidence(tx,employeeId,branch,reportIds=[],documentIds=[]){
 if(!Array.isArray(reportIds)||!Array.isArray(documentIds)||reportIds.length+documentIds.length>100)fail('Invalid evidence selection');
 const reports=[];for(const id of [...new Set(reportIds)]){const row=await tx.systemSetting.findUnique({where:{key:'OPS_OPERATIONAL_REPORT:'+id}}),report=row&&JSON.parse(row.value);if(report?.status!=='APPROVED'||report.branch!==branch||!report.draft.participants.some(person=>person.employeeId===employeeId))fail('Evidence must be an approved report for this employee and branch');reports.push({id,revision:report.revision,reportType:report.reportType,workDate:report.workDate});}
 const ids=[...new Set(documentIds)],documents=await tx.employeeDocument.findMany({where:{id:{in:ids},employeeId,status:'ACTIVE',documentType:{in:['CERTIFICATE','EDUCATION_CERTIFICATE','OTHER']}},select:{id:true,displayName:true}});if(ids.length!==documents.length)fail('Evidence must be an active supporting document for this employee');
 return {reports,documents};
}
async function loadPlanning(db,{user,mode,branch:requested,asOf}){
 asOf=asOf||new Date().toISOString().slice(0,10);
 const permission={succession:'succession.view',development:'development.view',reports:'performance_reports.view'}[mode];if(!permission)fail('Unknown planning page');
 const {scope,branch}=await access(db,user,permission,null,requested),where=await employeeBranchFilter(db,branch);
 const employees=await db.employee.findMany({where:{AND:[where,...(scope.unrestricted?[]:[{id:{in:scope.employeeIds}}])]},select:{id:true,name:true,jobTitle:true,active:true,branch:true,employmentStatus:true,hrisNumber:true,localEmployeeCode:true},orderBy:{name:'asc'}}),ids=employees.map(row=>row.id);
 const settings=await getEffectivePerformanceSettings(db,{branch});
 const succession=await db.opsSuccessionCandidate.findMany({where:{employeeId:{in:ids},active:true},include:{employee:{select:{id:true,name:true,jobTitle:true}},developmentActions:true,reviews:{orderBy:{reviewDate:'desc'}}},orderBy:{updatedAt:'desc'}});
 for(const plan of succession){const snapshot=await readPerformanceSettingsSnapshot(db,{kind:'SUCCESSION',recordId:plan.id});plan.configuration=snapshot?.effective.value.succession||settings.value.succession;plan.branch=branch;plan.supporting={appraisals:await db.opsMonthlyAppraisal.count({where:{employeeId:plan.employeeId,status:"APPROVED"}}),evaluations:await db.opsEmployeeDailyEvaluation.count({where:{employeeId:plan.employeeId}}),attendance:await db.opsAttendanceRecord.count({where:{employeeId:plan.employeeId}}),training:await db.employeeTrainingRecord.count({where:{employeeId:plan.employeeId}})};}
 await enrichSuccessionActions(db,succession,branch);
 const rows=await db.systemSetting.findMany({where:{key:{startsWith:DEVELOPMENT_PREFIX}}});
 const developments=rows.map(row=>JSON.parse(row.value)).filter(row=>row.branch===branch&&ids.includes(row.employeeId)).map(row=>({...row,employee:employees.find(person=>person.id===row.employeeId),progress:developmentProgress(row,asOf)}));
 for(const development of developments)if(!development.candidateId){
  const documents=await db.employeeDocument.findMany({where:{employeeId:development.employeeId,status:'ACTIVE',documentType:{in:['CERTIFICATE','EDUCATION_CERTIFICATE','OTHER']}},select:{id:true,displayName:true}});
  const reportRows=await db.systemSetting.findMany({where:{key:{startsWith:'OPS_OPERATIONAL_REPORT:'}}});
  development.evidenceContext={evidenceDocuments:documents,evidenceReports:reportRows.map(row=>JSON.parse(row.value)).filter(report=>report.branch===branch&&report.status==='APPROVED'&&report.draft.participants.some(person=>person.employeeId===development.employeeId)).map(report=>({id:report.id,revision:report.revision,workDate:report.workDate,reportType:report.reportType}))};
 }
 const owners=await ownersFor(db,branch,mode==='succession'?'succession.edit':'development.edit');
 const planOwners=await ownersFor(db,branch,'succession.edit');
 const notifications=[];
 for(const candidate of succession){const next=attention(candidate,developments,asOf);if(user.permissions?.['succession.view']&&next.kind==='urgent'&&(candidate.plan?.details?.ownerUserId===user.id||user.permissions?.['succession.edit']==='ALL'))notifications.push({id:candidate.id,type:next.code,employee:candidate.employee.name,href:'/operations/succession?planId='+candidate.id});}
 for(const plan of developments.filter(row=>row.status!=='CLOSED'))for(const objective of plan.objectives)for(const task of objective.assignments)if(user.permissions?.['development.view']&&task.status!=='COMPLETED'&&task.dueDate<asOf&&(task.responsibleUserId===user.id||plan.ownerUserId===user.id))notifications.push({id:task.id,type:task.status==='BLOCKED'?'BLOCKER':'PROGRESS',employee:plan.employee.name,href:'/operations/development?developmentId='+plan.id});
 return {success:true,employees,succession,developments,owners,planOwners,branch,asOf,currentUserId:user.id,configuration:settings.value.succession,notifications};
}
async function createSuccession(db,{user,branch:requested,employeeId,targetRole,framework,details,notes}){
 const auth=await access(db,user,'succession.create',employeeId,requested),branch=auth.branch;user=auth.user;
 return db.$transaction(async tx=>{
  const employee=await tx.employee.findUnique({where:{id:employeeId}});if(!employee?.active)fail('Choose an active employee');await assertEmployeeBranch(tx,employee,branch);
  const effective=await getEffectivePerformanceSettings(tx,{branch}),path=resolveSuccessionPath(effective.value,{fromRole:employee.jobTitle,toRole:targetRole});
  assertBusinessRole(user,effective.value.permissions.adjustmentProposeRoles,employeeId);
  if(await tx.opsSuccessionCandidate.findFirst({where:{employeeId,targetRole:path.path.toRole,active:true,readinessStatus:{notIn:['CLOSED','COMPLETED','PROMOTED']}}}))fail('An active plan already exists for this employee and role');
  await verifyOwner(tx,branch,details?.ownerUserId,employeeId,'succession.edit');date(details?.nextReviewDate);date(details?.targetDate);if(details.nextReviewDate>details.targetDate)fail('The next review must be before the target readiness date');
  if(!effective.value.succession.reviewFrequencyOptions.some(row=>row.code===details.reviewFrequency))fail('Select a configured review frequency');
  if(!Array.isArray(framework)||!framework.length||framework.length>60)fail('Confirm at least one target role requirement');const seen=new Set();
  const requirements=framework.map((row,index)=>{const key=keyOf(row);if(seen.has(key)||!path.cumulativeTemplateGroups.includes(row.group)||!/^\w{1,80}$/.test(row.code)||!/^\w{1,80}$/.test(row.templateCode))fail('Invalid or duplicate role requirement');seen.add(key);const requiredLevel=Number(row.requiredLevel),maxLevel=Number(row.maxLevel);if(!Number.isFinite(requiredLevel)||!Number.isFinite(maxLevel)||requiredLevel<1||maxLevel<requiredLevel||maxLevel>100)fail('Invalid requirement level');return {...row,label:text(row.label,1,200),labelAr:String(row.labelAr||'').slice(0,200),successCriteria:text(row.successCriteria||row.successCriteriaAr,10),requiredLevel,maxLevel,order:index+1,active:true};});
  const candidate=await tx.opsSuccessionCandidate.create({data:{employeeId,currentRole:path.path.fromRole,targetRole:path.path.toRole,managementNotes:String(notes||'').slice(0,3000)||null,targetReadinessDate:details.targetDate,createdBy:user.id,updatedBy:user.id}});
  await capturePerformanceSettingsSnapshot(tx,{kind:'SUCCESSION',recordId:candidate.id,branch,date:new Date().toISOString().slice(0,10),configOverride:effective});
  const plan={revision:1,status:'ACTIVE',framework:requirements,assessments:{},details:{ownerUserId:details.ownerUserId,reviewFrequency:details.reviewFrequency,businessNeed:text(details.businessNeed,10),priority:'NORMAL',careerInterest:'UNDECIDED'},nextReviewDate:details.nextReviewDate,targetDate:details.targetDate,decisions:[],history:[{revision:1,at:new Date().toISOString(),by:user.id,reason:'Created after confirming role requirements and review schedule'}]};
  await replace(tx,PLAN_PREFIX+candidate.id,null,plan,user);await audit(tx,user,branch,employeeId,'OPS_SUCCESSION_CREATED',{candidateId:candidate.id},'Created a guided succession plan');return {candidate};
 });
}
async function createDevelopment(db,{user,branch:requested,candidateId,employeeId,targetRole,objectives,ownerUserId,status='ACTIVE'}){
 const candidate=candidateId?await db.opsSuccessionCandidate.findUnique({where:{id:candidateId}}):{employeeId};if(!candidate?.employeeId)fail('Select an employee or succession plan',404);
 const auth=await access(db,user,'development.create',candidate.employeeId,requested),branch=auth.branch;user=auth.user;
 return db.$transaction(async tx=>{
  const employee=await tx.employee.findUnique({where:{id:candidate.employeeId}});await assertEmployeeBranch(tx,employee,branch);
  const current=candidateId?await tx.opsSuccessionCandidate.findUnique({where:{id:candidateId}}):candidate;
  const row=candidateId?await tx.systemSetting.findUnique({where:{key:PLAN_PREFIX+candidateId}}):null,plan=row&&JSON.parse(row.value);if(['CLOSED','PROMOTED','COMPLETED'].includes(current.readinessStatus)||plan?.status==='CLOSED')fail('This succession plan is closed');
  const snapshot=candidateId?await readPerformanceSettingsSnapshot(tx,{kind:'SUCCESSION',recordId:candidateId}):null,effective=snapshot?.effective||await getEffectivePerformanceSettings(tx,{branch});if(snapshot?.branch&&snapshot.branch!==branch)fail('Succession plan belongs to another branch',403);
  let path;
  if(candidateId)path=planPath(effective.value.succession,current,plan);
  else {const configured=resolveSuccessionPath(effective.value,{fromRole:employee.jobTitle,toRole:targetRole});candidate.currentRole=configured.path.fromRole;candidate.targetRole=configured.path.toRole;const definitions=require('./succession-workspace').proposedFramework(effective.value.succession,candidate);path={competencies:effective.value.succession.competencies.length?planPath(effective.value.succession,candidate).competencies:definitions};}
  assertBusinessRole(user,effective.value.permissions.adjustmentProposeRoles,candidate.employeeId);await verifyOwner(tx,branch,ownerUserId,candidate.employeeId);
  if(!['DRAFT','ACTIVE'].includes(status)||!Array.isArray(objectives)||!objectives.length||objectives.length>60)fail('Add at least one objective');
  const seen=new Set();const normalized=[];
  for(const objective of objectives){const definition=path.competencies.find(item=>keyOf(item)===objective.gapKey);if(!definition||seen.has(objective.gapKey))fail('Select distinct documented gaps from this plan');seen.add(objective.gapKey);const assessment=plan?.assessments?.[objective.gapKey];if(assessment&&Number(assessment.currentLevel)>=definition.requiredLevel)fail('This requirement has no recorded gap');
   if(!Array.isArray(objective.assignments)||!objective.assignments.length||objective.assignments.length>30)fail('Add an assignment for every objective');const assignments=[];
   for(const task of objective.assignments){await verifyOwner(tx,branch,task.responsibleUserId,candidate.employeeId);assignments.push({id:randomUUID(),task:text(task.task,10),responsibleUserId:task.responsibleUserId,dueDate:date(task.dueDate),status:'NOT_STARTED',evidence:{reports:[],documents:[]},completionNote:'',blocker:'',history:[]});}
   const targetDate=date(objective.targetDate);if(assignments.some(task=>task.dueDate>targetDate))fail('Assignment dates must be on or before the objective target date');
   normalized.push({id:randomUUID(),gapKey:objective.gapKey,gapLabel:definition.label,gapLabelAr:definition.labelAr,outcome:text(objective.outcome,10),successCriteria:text(objective.successCriteria,10),targetDate,assignments,sourceRequirement:{...definition,currentLevel:assessment?.currentLevel??null}});
  }
  const development={id:randomUUID(),revision:1,employeeId:candidate.employeeId,candidateId:candidateId||null,currentRole:candidate.currentRole,targetRole:candidate.targetRole,branch,ownerUserId,status,objectives:normalized,createdAt:new Date().toISOString(),createdBy:user.id,updatedAt:new Date().toISOString(),history:[{at:new Date().toISOString(),by:user.id,reason:'Objectives and assignments explicitly confirmed'}]};
  await replace(tx,DEVELOPMENT_PREFIX+development.id,null,development,user);await audit(tx,user,branch,candidate.employeeId,'OPS_DEVELOPMENT_CREATED',{developmentId:development.id,candidateId},'Created a development plan');return {development};
 });
}
async function updateAssignment(db,{user,branch:requested,developmentId,assignmentId,expectedRevision,status,completionNote,blocker,reportIds,documentIds,reason,task:taskText,responsibleUserId,dueDate}){
 return db.$transaction(async tx=>{
  const row=await tx.systemSetting.findUnique({where:{key:DEVELOPMENT_PREFIX+developmentId}}),plan=row&&JSON.parse(row.value);if(!plan)fail('Development plan not found',404);
  const auth=await access(tx,user,'development.edit',plan.employeeId,requested);if(auth.branch!==plan.branch)fail('Branch access denied',403);user=auth.user;
  if(Number(expectedRevision)!==plan.revision)fail('This plan changed. Reload before saving.',409);if(plan.status==='CLOSED')fail('This development plan is closed');
  const task=plan.objectives.flatMap(objective=>objective.assignments).find(item=>item.id===assignmentId);if(!task)fail('Assignment not found',404);if(!ACTION_STATUSES.includes(status))fail('Select a valid assignment status');
  const note=String(completionNote||'').trim().slice(0,3000),obstacle=String(blocker||'').trim().slice(0,3000);if(status==='BLOCKED'&&obstacle.length<5)fail('Explain the blocker');
  const verified=await evidence(tx,plan.employeeId,plan.branch,reportIds,documentIds);if(status==='COMPLETED'&&note.length<10&&!verified.reports.length&&!verified.documents.length)fail('Completion needs a clear completion note or verified supporting evidence');
  const before={...task};if(taskText!==undefined)task.task=text(taskText,10);if(responsibleUserId!==undefined){await verifyOwner(tx,plan.branch,responsibleUserId,plan.employeeId);task.responsibleUserId=responsibleUserId;}if(dueDate!==undefined){date(dueDate);const objective=plan.objectives.find(row=>row.assignments.some(item=>item.id===assignmentId));if(dueDate>objective.targetDate)fail('Assignment date must be on or before the objective target date');task.dueDate=dueDate;}
  task.status=status;task.completionNote=note;task.blocker=status==='BLOCKED'?obstacle:'';task.evidence=verified;task.completedAt=status==='COMPLETED'?new Date().toISOString():null;task.history=[...task.history,{at:new Date().toISOString(),by:user.id,reason:text(reason,5),before:{...before,history:undefined},after:{status,completionNote:note,blocker:task.blocker,evidence:verified,task:task.task,responsibleUserId:task.responsibleUserId,dueDate:task.dueDate}}];
  plan.revision++;plan.updatedAt=new Date().toISOString();await replace(tx,DEVELOPMENT_PREFIX+developmentId,row,plan,user);await audit(tx,user,plan.branch,plan.employeeId,'OPS_DEVELOPMENT_PROGRESS',{developmentId,assignmentId,status},reason);return {development:plan};
 });
}
async function decideReadiness(db,{user,branch:requested,candidateId,expectedRevision,decision,decisionDate,reason,remainingConditions,nextReviewDate,reportIds,documentIds,comments}){
 return db.$transaction(async tx=>{
  const candidate=await tx.opsSuccessionCandidate.findUnique({where:{id:candidateId}});if(!candidate)fail('Plan not found',404);const auth=await access(tx,user,'succession.edit',candidate.employeeId,requested),branch=auth.branch;user=auth.user;
  const employee=await tx.employee.findUnique({where:{id:candidate.employeeId}});await assertEmployeeBranch(tx,employee,branch);const row=await tx.systemSetting.findUnique({where:{key:PLAN_PREFIX+candidateId}}),plan=row?JSON.parse(row.value):{revision:0,history:[],decisions:[]};if(Number(expectedRevision)!==plan.revision)fail('This plan changed. Reload before deciding.',409);
  const snapshot=await readPerformanceSettingsSnapshot(tx,{kind:'SUCCESSION',recordId:candidateId}),effective=snapshot?.effective||await getEffectivePerformanceSettings(tx,{branch});assertBusinessRole(user,effective.value.permissions.adjustmentApproveRoles,candidate.employeeId);
  if(!DECISIONS.includes(decision))fail('Select a readiness decision');date(decisionDate);date(nextReviewDate);if(decisionDate>new Date().toISOString().slice(0,10)||nextReviewDate<decisionDate)fail('Review dates are inconsistent');
  if(decision==='READY_WITH_CONDITIONS'&&String(remainingConditions||'').trim().length<5)fail('Document the remaining conditions');const verified=await evidence(tx,candidate.employeeId,branch,reportIds,documentIds);if(!verified.reports.length&&!verified.documents.length)fail('Select supporting evidence for the decision');
  const record={id:randomUUID(),decision,decisionDate,reviewerId:user.id,reviewerName:user.profile.displayName||user.name,reason:text(reason,10),remainingConditions:String(remainingConditions||'').trim().slice(0,3000),nextReviewDate,evidence:verified,comments:String(comments||'').slice(0,3000),recordedAt:new Date().toISOString()};
  const legacy={NOT_READY:'DEVELOPING',READY_WITH_CONDITIONS:'READY_SOON',READY:'READY_NOW'}[decision];plan.decisions=[...(plan.decisions||[]),record];plan.nextReviewDate=nextReviewDate;plan.revision++;plan.history=[...(plan.history||[]),{at:record.recordedAt,by:user.id,revision:plan.revision,reason:record.reason}];
  await replace(tx,PLAN_PREFIX+candidateId,row,plan,user);await tx.opsSuccessionReview.create({data:{candidateId,previousReadiness:candidate.readinessStatus,newReadiness:legacy,notes:record.reason,reviewedBy:user.id,reviewDate:new Date(decisionDate+'T12:00:00Z')}});await tx.opsSuccessionCandidate.update({where:{id:candidateId},data:{readinessStatus:legacy,readinessReviewDate:new Date(),updatedBy:user.id}});await audit(tx,user,branch,candidate.employeeId,'OPS_SUCCESSION_READINESS_UPDATED',{candidateId,decisionId:record.id,decision},record.reason);
  // Deliberately no employee, competency, appraisal, or lifecycle update.
  return {decision:record};
 });
}
async function changeLifecycle(db,{user,branch:requested,candidateId,developmentId,expectedRevision,status,reason}){
 return db.$transaction(async tx=>{
  const key=developmentId?DEVELOPMENT_PREFIX+developmentId:PLAN_PREFIX+candidateId,row=await tx.systemSetting.findUnique({where:{key}});if(!row)fail('Plan not found',404);const plan=JSON.parse(row.value),candidate=developmentId?null:await tx.opsSuccessionCandidate.findUnique({where:{id:candidateId}}),employeeId=plan.employeeId||candidate?.employeeId;
  const auth=await access(tx,user,developmentId?'development.edit':'succession.edit',employeeId,requested);user=auth.user;
  if(plan.branch&&plan.branch!==auth.branch)fail('Branch access denied',403);const employee=await tx.employee.findUnique({where:{id:employeeId}});await assertEmployeeBranch(tx,employee,auth.branch);
  if(!PLAN_STATUSES.includes(status))fail('Invalid plan status');if(plan.revision!==Number(expectedRevision))fail('This plan changed. Reload before saving.',409);plan.status=status;plan.revision++;plan.history=[...(plan.history||[]),{at:new Date().toISOString(),by:user.id,revision:plan.revision,reason:text(reason,5),status}];
  await replace(tx,key,row,plan,user);await audit(tx,user,auth.branch,employeeId,'OPS_PLANNING_STATUS_CHANGED',{candidateId,developmentId,status},reason);return {plan};
 });
}
module.exports={loadPlanning,createSuccession,createDevelopment,updateAssignment,decideReadiness,changeLifecycle,DEVELOPMENT_PREFIX};
