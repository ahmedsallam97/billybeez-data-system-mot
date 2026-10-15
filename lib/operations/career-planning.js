const PLAN_STATUSES=['DRAFT','ACTIVE','ON_HOLD','UNDER_REVIEW','CLOSED'];
const ACTION_STATUSES=['NOT_STARTED','IN_PROGRESS','BLOCKED','COMPLETED'];
const DECISIONS=['NOT_READY','READY_WITH_CONDITIONS','READY'];
const {workspaceLabel}=require('./succession-workspace');
const extra={ACTIVE:['Active','نشطة'],UNDER_REVIEW:['Under review','قيد المراجعة'],BLOCKED:['Blocked','متعثر'],OVERDUE:['Overdue','متأخر'],NOT_READY:['Not ready','غير جاهز'],READY_WITH_CONDITIONS:['Ready with conditions','جاهز بشروط'],READY:['Ready','جاهز']};
function label(code,ar){return extra[code]?.[ar?1:0]||workspaceLabel(code,ar);}
function actionStatus(row,today){return row.status!=='COMPLETED'&&row.dueDate&&row.dueDate<today?'OVERDUE':row.status;}
function objectiveStatus(objective,today){
 const tasks=objective.assignments||[];
 if(tasks.length&&tasks.every(row=>row.status==='COMPLETED'))return 'COMPLETED';
 if(tasks.some(row=>row.status==='BLOCKED'))return 'BLOCKED';
 if(objective.targetDate<today||tasks.some(row=>actionStatus(row,today)==='OVERDUE'))return 'OVERDUE';
 if(tasks.some(row=>['IN_PROGRESS','COMPLETED'].includes(row.status)))return 'IN_PROGRESS';
 return 'NOT_STARTED';
}
function developmentProgress(plan,today=new Date().toISOString().slice(0,10)){
 const assignments=plan.objectives.flatMap(row=>row.assignments),completed=assignments.filter(row=>row.status==='COMPLETED').length;
 return {completed,total:assignments.length,percent:assignments.length?Math.round(completed/assignments.length*100):0,blocked:assignments.filter(row=>row.status==='BLOCKED'),overdue:assignments.filter(row=>actionStatus(row,today)==='OVERDUE'),completedObjectives:plan.objectives.filter(row=>row.assignments.length&&row.assignments.every(task=>task.status==='COMPLETED')).length};
}
function planStatus(candidate){return candidate.plan?.status||(['CLOSED','PROMOTED','COMPLETED'].includes(candidate.readinessStatus)?'CLOSED':candidate.plan?.details?.ownerUserId?'ACTIVE':'DRAFT');}
function latestDecision(candidate){return candidate.plan?.decisions?.at(-1)?.decision||({READY_NOW:'READY',READY_SOON:'READY_WITH_CONDITIONS',DEVELOPING:'NOT_READY'}[candidate.readinessStatus]||'NOT_ASSESSED');}
function attention(candidate,developments,today){
 if(planStatus(candidate)==='CLOSED')return {code:'CLOSED',kind:'none'};
 if(!candidate.plan?.details?.ownerUserId)return {code:'OWNER',kind:'setup'};
 if(!candidate.progress?.total)return {code:'REQUIREMENTS',kind:'setup'};
 const linked=developments.filter(row=>row.candidateId===candidate.id&&row.status!=='CLOSED'),tasks=linked.flatMap(row=>row.objectives.flatMap(objective=>objective.assignments));
 if(tasks.some(row=>row.status==='BLOCKED'))return {code:'BLOCKER',kind:'urgent'};
 if(candidate.plan?.nextReviewDate&&candidate.plan.nextReviewDate<today)return {code:'REVIEW',kind:'urgent'};
 if(tasks.some(row=>actionStatus(row,today)==='OVERDUE'))return {code:'PROGRESS',kind:'urgent'};
 if(!linked.length&&candidate.progress?.gaps.some(row=>!row.met))return {code:'DEVELOPMENT',kind:'setup'};
 if(!candidate.plan?.decisions?.length)return {code:'DECISION',kind:'review'};
 return {code:'FOLLOW_UP',kind:'normal'};
}
function filterPlans(items,filters,owners=[],today=new Date().toISOString().slice(0,10)){
 return items.filter(row=>{
  const owner=row.plan?.details?.ownerUserId||row.ownerUserId||'',status=row.plan?planStatus(row):row.status,readiness=row.plan?latestDecision(row):'';
  const text=[row.employee?.name,row.currentRole,row.targetRole,owners.find(item=>item.id===owner)?.name].join(' ').toLowerCase();
  return (!filters.q||text.includes(filters.q.toLowerCase()))&&(!filters.employeeId||row.employeeId===filters.employeeId)&&(!filters.branch||row.branch===filters.branch)&&(!filters.targetRole||row.targetRole===filters.targetRole)&&(!filters.currentRole||row.currentRole===filters.currentRole)&&(!filters.owner||owner===filters.owner)&&(!filters.status||status===filters.status)&&(!filters.readiness||readiness===filters.readiness)&&(!filters.nextReviewDate||row.plan?.nextReviewDate===filters.nextReviewDate)&&(!filters.responsible||row.objectives?.some(objective=>objective.assignments.some(task=>task.responsibleUserId===filters.responsible)))&&(!filters.dueDate||row.objectives?.some(objective=>objective.assignments.some(task=>task.dueDate===filters.dueDate)))&&(!filters.overdue||(row.plan?row.plan.nextReviewDate&&row.plan.nextReviewDate<today:developmentProgress(row,today).overdue.length));
 });
}
module.exports={PLAN_STATUSES,ACTION_STATUSES,DECISIONS,label,actionStatus,objectiveStatus,developmentProgress,planStatus,latestDecision,attention,filterPlans};
