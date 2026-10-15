const { readPerformanceSettingsSnapshot, getEffectivePerformanceSettings } = require('./performance-settings-service');
const { resolveSuccessionPath } = require('./performance-policy');
const { assertBusinessRole, assertEmployeeBranch } = require('./business-access');
const { isValidIsoDate } = require('./performance-settings-config');
const PREFIX='OPS_SUCCESSION_ACTION:';
const DOCUMENT_EVIDENCE_TYPES=['CERTIFICATE','EDUCATION_CERTIFICATE','OTHER'];
const {PLAN_PREFIX,planPath,successionProgress}=require('./succession-workspace');
const fail=(message,status=422)=>{throw Object.assign(new Error(message),{status});};
async function actionContext(db,{candidateId,branch,user,permission="succession.edit"}) {
  const candidate=await db.opsSuccessionCandidate.findUnique({where:{id:candidateId},include:{employee:true}});
  if(!candidate?.active || ['CLOSED','COMPLETED','PROMOTED'].includes(candidate.readinessStatus))fail('Select an active succession plan');
  if(user.profile){
    const {loadAccount,assertCan}=require('../accounts/service');
    const raw=await db.user.findUnique({where:{id:user.id}});
    if(!raw?.active)fail('Login required',401);
    const fresh=await loadAccount(db,raw);
    if(fresh.profile.sessionVersion!==user.profile.sessionVersion)fail('Login required',401);
    assertCan(fresh,permission);
    const scope=await require('../accounts/enforcement').resolveScope(db,fresh,permission);
    if(!scope.unrestricted&&(!scope.branches.includes(branch)||!scope.employeeIds.includes(candidate.employeeId)))fail('Succession plan access denied',403);
    user=fresh;
  }
  await assertEmployeeBranch(db,candidate.employee,branch);
  const snapshot=await readPerformanceSettingsSnapshot(db,{kind:'SUCCESSION',recordId:candidate.id});
  const effective=snapshot?.effective || await getEffectivePerformanceSettings(db,{branch});
  assertBusinessRole(user,effective.value.permissions.adjustmentProposeRoles,candidate.employeeId);
  const planRow=await db.systemSetting.findUnique({where:{key:PLAN_PREFIX+candidate.id}});
  const plan=planRow?JSON.parse(planRow.value):{revision:0};
  if(plan.status==='CLOSED')fail('This succession plan is closed');
  if(snapshot?.branch&&snapshot.branch!==branch)fail('Succession plan belongs to another branch',403);
  const path=planPath(effective.value.succession,candidate,plan);
  return {candidate,effective,path,plan,planRow};
}
async function changeSuccessionAction(db,{user,branch,candidateId,id,expectedRevision,type,competency,note,status,targetDate,completionDate,evidence=[],reason,attainedLevel,documentIds=[],assignmentType,planDetails}) {
  if(String(reason||'').trim().length<5)fail('A clear development-action reason is required');
  return db.$transaction(async tx=>{
    const {candidate,effective,path}=await actionContext(tx,{candidateId,branch,user,permission:'development.edit'});
    if(!path.developmentActionTypes.some(item=>item.code===type))fail('Select an active development-action type');
    if(!path.developmentStatuses.some(item=>item.code===status))fail('Select an active development status');
    const definition=path.competencies.find(item=>`${item.templateCode}:${item.code}`===competency);
    if(path.competencies.length&&!definition)fail('Select a competency in the plan’s cumulative template groups');
    if(!String(competency||'').trim() || String(competency).length>200)fail('A competency is required');
    if(definition?.practicalAssignmentTypes.length&&type==='PRACTICAL_ASSIGNMENT'&&!definition.practicalAssignmentTypes.includes(assignmentType))fail('This competency does not allow this assignment type');
    if(!Number.isFinite(Number(attainedLevel??0))||Number(attainedLevel??0)<0||Number(attainedLevel??0)>(definition?.maxLevel||100))fail('Attained level must be within the competency scale');
    for(const date of [targetDate,completionDate])if(date&&!isValidIsoDate(date))fail('Dates must be valid YYYY-MM-DD values');
    if(planDetails){
      if(String(planDetails.objective||'').trim().length<10||String(planDetails.successCriteria||'').trim().length<10)fail('A measurable objective and success criteria are required');
      if(!targetDate)fail('A target date is required for a development commitment');
      if(!['NORMAL','HIGH','CRITICAL'].includes(planDetails.priority))fail('Invalid development priority');
      for(const date of [planDetails.startDate,planDetails.reviewDate])if(date&&!isValidIsoDate(date))fail('Dates must be valid YYYY-MM-DD values');
      if(planDetails.startDate&&targetDate<planDetails.startDate)fail('Target date must follow the start date');
      if(planDetails.startDate&&planDetails.reviewDate&&planDetails.reviewDate<planDetails.startDate)fail('Follow-up date must follow the start date');
      if(completionDate&&planDetails.startDate&&completionDate<planDetails.startDate)fail('Completion date must follow the start date');
      await validateOwner(tx,user,branch,planDetails.ownerUserId);
    }
    if(status==='COMPLETED'&&!completionDate)fail('Completed actions require a completion date');
    if(status==='COMPLETED'&&definition&&Number(attainedLevel??0)<definition.requiredLevel)fail('The completed action must meet its configured competency level');
    if(!Array.isArray(evidence)||evidence.length>100)fail('Invalid evidence list');
    const verified=[];
    for(const reportId of [...new Set(evidence)]) {
      const row=await tx.systemSetting.findUnique({where:{key:'OPS_OPERATIONAL_REPORT:'+reportId}});
      const report=row?JSON.parse(row.value):null;
      if(!report||report.status!=='APPROVED'||report.branch!==branch||!report.draft.participants.some(item=>item.employeeId===candidate.employeeId))fail('Evidence must be an approved report for this employee and branch');
      if(!definition?.operationalReportsQualifyAsEvidence)fail('This competency does not allow operational-report evidence');
      if(report.reportType==='SHIFT_LEADERSHIP'&&!report.configSnapshot.leadershipRequirement?.assignmentQualifiesAsSuccessionEvidence)fail('This shift assignment does not qualify as succession evidence');
      verified.push({reportId:report.id,revision:report.revision,reportType:report.reportType,workDate:report.workDate,configurationVersion:report.configSnapshot.effective.version,participant:report.draft.participants.find(item=>item.employeeId===candidate.employeeId)});
    }
    if(!Array.isArray(documentIds)||documentIds.length>100)fail('Invalid document evidence');
    const documents=await tx.employeeDocument.findMany({where:{id:{in:[...new Set(documentIds)]},employeeId:candidate.employeeId,status:'ACTIVE',documentType:{in:DOCUMENT_EVIDENCE_TYPES}},select:{id:true,storageKey:true,displayName:true,sizeBytes:true}});
    if(documents.length!==new Set(documentIds).size)fail('Document evidence must belong to this employee');
    if(status==='COMPLETED'&&definition?.evidenceRequired&&!verified.length&&!documents.length)fail('Completion requires verified report or employee-document evidence');
    const previous=id?await tx.opsSuccessionDevelopmentAction.findUnique({where:{id}}):null;
    if(id&&(!previous||previous.candidateId!==candidateId))fail('Action not found in this plan',404);
    const metadataRow=id?await tx.systemSetting.findUnique({where:{key:PREFIX+id}}):null;
    const before=metadataRow?JSON.parse(metadataRow.value):null;
    if(id&&Number(expectedRevision)!==(before?.revision||0))fail('Development action changed; reload and retry',409);
    const data={candidateId,competency,note:String(note||'').trim().slice(0,5000)||null,status,targetDate:targetDate||null,completionDate:status==='COMPLETED'?completionDate:null,updatedBy:user.id};
    const action=previous?await tx.opsSuccessionDevelopmentAction.update({where:{id},data}):await tx.opsSuccessionDevelopmentAction.create({data:{...data,createdBy:user.id}});
    const details=planDetails?{objective:String(planDetails.objective).trim().slice(0,2000),successCriteria:String(planDetails.successCriteria).trim().slice(0,3000),ownerUserId:planDetails.ownerUserId,startDate:planDetails.startDate||null,reviewDate:planDetails.reviewDate||null,priority:planDetails.priority,blocker:String(planDetails.blocker||'').trim().slice(0,2000)}:before?.planDetails||null;
    const metadata={revision:(before?.revision||0)+1,type,assignmentType:assignmentType||null,attainedLevel:Number(attainedLevel??0),evidence:verified,documents,planDetails:details,competencySnapshot:definition||null,configurationVersion:effective.version,history:[...(before?.history||[]),{at:new Date().toISOString(),by:user.id,reason,before:previous,after:action,previousEvidence:before?.evidence||[],previousDetails:before?.planDetails||null,details}]};
    if(metadataRow){const changed=await tx.systemSetting.updateMany({where:{key:PREFIX+action.id,value:metadataRow.value},data:{value:JSON.stringify(metadata),updatedBy:user.id}});if(changed.count!==1)fail('Development action changed; reload and retry',409);}
    else await tx.systemSetting.create({data:{key:PREFIX+action.id,value:JSON.stringify(metadata),updatedBy:user.id}});
    await tx.auditLog.create({data:{action:'OPS_SUCCESSION_DEVELOPMENT_UPDATED',userId:user.id,summary:'Recorded succession development action',metadata:JSON.stringify({candidateId,actionId:action.id,reason,before,after:metadata})}});
    return {action:{...action,metadata}};
  });
}
async function enrichSuccessionActions(db,plans,branch) {
  const rows=await db.systemSetting.findMany({where:{key:{startsWith:'OPS_OPERATIONAL_REPORT:'}}});
  const reports=rows.map(row=>JSON.parse(row.value)).filter(report=>report.branch===branch&&report.status==='APPROVED');
  for(const plan of plans){
    const planRow=await db.systemSetting.findUnique({where:{key:PLAN_PREFIX+plan.id}});plan.plan=planRow?JSON.parse(planRow.value):{revision:0,assessments:{},framework:[]};
    for(const action of plan.developmentActions){const row=await db.systemSetting.findUnique({where:{key:PREFIX+action.id}});action.metadata=row?JSON.parse(row.value):{revision:0,evidence:[],history:[]};}
    plan.evidenceDocuments=await db.employeeDocument.findMany({where:{employeeId:plan.employeeId,status:'ACTIVE',documentType:{in:DOCUMENT_EVIDENCE_TYPES}},select:{id:true,displayName:true}});
    plan.evidenceReports=reports.filter(report=>report.draft.participants.some(item=>item.employeeId===plan.employeeId)).map(report=>({id:report.id,reportType:report.reportType,workDate:report.workDate,revision:report.revision}));
    plan.progress=successionProgress(plan);
  }
}
async function successionOwners(db,branch,user){
  const {config}=await require('../accounts/service').readConfig(db);
  const {effectivePermissions,isOperationsRole}=require('../accounts/registry');
  const allowed=Object.entries(config.accounts||{}).filter(([,profile])=>{const role=config.roles.find(row=>row.id===profile.roleId);return !profile.archivedAt&&isOperationsRole(role)&&(profile.allBranches||profile.branches?.includes(branch))&&effectivePermissions(role,profile)['succession.edit'];}).map(([id])=>id);
  if(!user.profile)allowed.push(user.id);
  const rows=await db.user.findMany({where:{id:{in:[...new Set(allowed)]},active:true},select:{id:true,name:true}});
  return rows.map(row=>({...row,name:config.accounts[row.id]?.displayName||row.name}));
}
async function validateOwner(db,user,branch,id){if(!id||!(await successionOwners(db,branch,user)).some(row=>row.id===id))fail('Select an active plan owner with succession access in this branch');}
async function saveSuccessionPlan(db,{user,branch,candidateId,expectedRevision,details,framework,assessmentUpdates,reason}){
  if(String(reason||'').trim().length<5)fail('A clear plan-change reason is required');
  return db.$transaction(async tx=>{
    const {candidate,effective,path,plan,planRow}=await actionContext(tx,{candidateId,branch,user});
    if(Number(expectedRevision)!==(plan.revision||0))fail('Succession plan changed; reload and retry',409);
    const next={...plan,revision:(plan.revision||0)+1};
    if(details){
      await validateOwner(tx,user,branch,details.ownerUserId);
      for(const date of [details.targetDate,details.nextReviewDate])if(!isValidIsoDate(date))fail('Target and next review dates are required');
      if(!path.reviewFrequencyOptions.some(row=>row.code===details.reviewFrequency))fail('Select a configured review frequency');
      if(!['NORMAL','HIGH','CRITICAL'].includes(details.priority)||!['INTERESTED','UNDECIDED','DECLINED'].includes(details.careerInterest))fail('Invalid plan priority or career interest');
      if(details.nextReviewDate>details.targetDate)fail('Next review date must be on or before target readiness');
      if(String(details.businessNeed||'').trim().length<10)fail('Record why this target role needs a successor');
      next.details={ownerUserId:details.ownerUserId,priority:details.priority,careerInterest:details.careerInterest,reviewFrequency:details.reviewFrequency,businessNeed:String(details.businessNeed).trim().slice(0,3000),careerNotes:String(details.careerNotes||'').trim().slice(0,3000)};
      next.nextReviewDate=details.nextReviewDate;
      next.targetDate=details.targetDate;
    }
    if(framework){
      if(!Array.isArray(framework)||!framework.length||framework.length>60)fail('Add at least one role requirement');
      const seen=new Set();next.framework=framework.map((row,index)=>{
        const key=`${row.templateCode}:${row.code}`,requiredLevel=Number(row.requiredLevel),maxLevel=Number(row.maxLevel||100);
        if(seen.has(key)||!path.cumulativeTemplateGroups.includes(row.group)||!/^\w{1,80}$/.test(row.code)||!/^\w{1,80}$/.test(row.templateCode))fail('Invalid or duplicate competency in the target role groups');seen.add(key);
        if(!Number.isFinite(requiredLevel)||requiredLevel<1||requiredLevel>100||!Number.isFinite(maxLevel)||maxLevel<requiredLevel||maxLevel>100)fail('Invalid competency level scale');
        if(!String(row.label||'').trim()||String(row.successCriteria||row.successCriteriaAr||'').trim().length<10)fail('Each requirement needs a name and measurable success criteria');
        return {templateCode:row.templateCode,code:row.code,group:row.group,label:String(row.label).trim().slice(0,200),labelAr:String(row.labelAr||'').trim().slice(0,200),requiredLevel,maxLevel,active:true,order:index+1,evidenceRequired:row.evidenceRequired!==false,operationalReportsQualifyAsEvidence:row.operationalReportsQualifyAsEvidence!==false,practicalAssignmentTypes:Array.isArray(row.practicalAssignmentTypes)?row.practicalAssignmentTypes.map(String):[],successCriteria:String(row.successCriteria||'').trim().slice(0,3000),successCriteriaAr:String(row.successCriteriaAr||'').trim().slice(0,3000)};
      });
      // Existing actions/assessments keep their keys and historical evidence.
      const actions=await tx.opsSuccessionDevelopmentAction.findMany({where:{candidateId}});
      if(actions.some(action=>!seen.has(action.competency))||Object.keys(plan.assessments||{}).some(key=>!seen.has(key)))fail('Requirements linked to actions or assessments cannot be removed');
    }
    if(assessmentUpdates){
      if(!Array.isArray(assessmentUpdates)||assessmentUpdates.length>60)fail('Invalid competency assessments');
      next.assessments={...(plan.assessments||{})};
      const currentPath=planPath(effective.value.succession,candidate,next);
      for(const item of assessmentUpdates){
        const definition=currentPath.competencies.find(row=>`${row.templateCode}:${row.code}`===item.key);
        if(!definition)fail('Assessment competency is not part of the target role');
        const currentLevel=Number(item.currentLevel);
        if(item.currentLevel===null||item.currentLevel===''||!Number.isFinite(currentLevel)||currentLevel<0||currentLevel>(definition.maxLevel||100))fail('Record a level within the competency scale');
        if(String(item.notes||'').trim().length<5)fail('Each assessment requires a documented observation');
        const verified=await verifyAssessmentEvidence(tx,candidate,branch,definition,item);
        next.assessments[item.key]={currentLevel,notes:String(item.notes).trim().slice(0,3000),...verified,assessedAt:new Date().toISOString(),assessedBy:user.id};
      }
    }
    next.history=[...(plan.history||[]),{at:new Date().toISOString(),by:user.id,reason:String(reason).trim(),before:{details:plan.details,framework:plan.framework,assessments:plan.assessments,targetDate:plan.targetDate,nextReviewDate:plan.nextReviewDate},revision:next.revision}];
    if(planRow){const result=await tx.systemSetting.updateMany({where:{key:PLAN_PREFIX+candidate.id,value:planRow.value},data:{value:JSON.stringify(next),updatedBy:user.id}});if(result.count!==1)fail('Succession plan changed; reload and retry',409);}
    else await tx.systemSetting.create({data:{key:PLAN_PREFIX+candidate.id,value:JSON.stringify(next),updatedBy:user.id}});
    await tx.opsSuccessionCandidate.update({where:{id:candidate.id},data:{...(next.targetDate?{targetReadinessDate:next.targetDate}:{}),updatedBy:user.id}});
    await tx.auditLog.create({data:{action:'OPS_SUCCESSION_PLAN_UPDATED',userId:user.id,summary:'Updated role requirements, plan ownership or competency assessment',metadata:JSON.stringify({candidateId,branch,reason,revision:next.revision})}});
    return {plan:next};
  });
}
async function verifyAssessmentEvidence(db,candidate,branch,definition,item){
  if(!Array.isArray(item.evidence||[])||!Array.isArray(item.documentIds||[])||(item.evidence?.length||0)+(item.documentIds?.length||0)>100)fail('Invalid assessment evidence');
  const evidence=[];
  for(const id of [...new Set(item.evidence||[])]){
    const row=await db.systemSetting.findUnique({where:{key:'OPS_OPERATIONAL_REPORT:'+id}}),report=row?JSON.parse(row.value):null;
    if(!definition.operationalReportsQualifyAsEvidence||report?.status!=='APPROVED'||report.branch!==branch||!report.draft.participants.some(person=>person.employeeId===candidate.employeeId))fail('Use approved evidence for this employee and branch');
    if(report.reportType==='SHIFT_LEADERSHIP'&&!report.configSnapshot.leadershipRequirement?.assignmentQualifiesAsSuccessionEvidence)fail('This shift report does not qualify as succession evidence');
    evidence.push({reportId:id,revision:report.revision});
  }
  const ids=[...new Set(item.documentIds||[])],documents=await db.employeeDocument.findMany({where:{id:{in:ids},employeeId:candidate.employeeId,status:'ACTIVE',documentType:{in:DOCUMENT_EVIDENCE_TYPES}},select:{id:true,displayName:true}});
  if(documents.length!==ids.length)fail('Document evidence must belong to the employee');
  if(Number(item.currentLevel)>=definition.requiredLevel&&definition.evidenceRequired&&!evidence.length&&!documents.length)fail('Meeting the role requirement requires verified evidence');
  return {evidence,documents};
}
module.exports={changeSuccessionAction,enrichSuccessionActions,saveSuccessionPlan,successionOwners};
