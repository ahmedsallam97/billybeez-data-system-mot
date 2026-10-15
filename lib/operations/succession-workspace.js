const { resolveSuccessionPath } = require('./performance-policy');
const PLAN_PREFIX = 'OPS_SUCCESSION_PLAN:';
const keyOf = row => `${row.templateCode}:${row.code}`;
const labels = {
  'Ride Operator':['Ride operator','مشغّل ألعاب'],'Front Cashier':['Front cashier','كاشير أمامي'],'Operation Supervisor':['Operations supervisor','مشرف تشغيل'], RECOMMENDED:['Recommended','موصى به'], NOT_RECOMMENDED:['Not recommended','غير موصى به'], INSUFFICIENT_DATA:['Insufficient evidence','أدلة غير كافية'], CONDITIONAL:['Conditional','مشروط'], REVIEWED:['Reviewed','مُراجع'],
  NOT_ASSESSED:['Not assessed','لم يُقيّم'], DEVELOPING:['Developing','قيد التطوير'], READY_SOON:['Ready soon','جاهز قريبًا'], READY_NOW:['Ready now','جاهز الآن'], ON_HOLD:['On hold','معلّق'], PROMOTED:['Promoted','تمت الترقية'], COMPLETED:['Completed','مكتمل'], CLOSED:['Closed','مغلق'],
  NOT_STARTED:['Not started','لم يبدأ'], IN_PROGRESS:['In progress','جارٍ التنفيذ'], NOT_REQUIRED:['Not required','غير مطلوب'], TRAINING:['Training','تدريب'], SHADOWING:['Job shadowing','ملازمة موظف خبير'], PRACTICAL_ASSIGNMENT:['Practical assignment','تكليف عملي'], COACHING:['Coaching','توجيه ومتابعة'], MONTHLY:['Monthly','شهريًا'], QUARTERLY:['Quarterly','كل ثلاثة أشهر'], SEMI_ANNUAL:['Every six months','كل ستة أشهر'], ANNUAL:['Annual','سنويًا'], NORMAL:['Normal','عادية'], HIGH:['High','عالية'], CRITICAL:['Critical','حرجة'], INTERESTED:['Interested','مهتم بالمسار'], UNDECIDED:['Not discussed / undecided','لم تُناقش / غير محسومة'], DECLINED:['Not interested','غير مهتم بالمسار'], TRIP:['Trip','رحلة'], BIRTHDAY:['Birthday','عيد ميلاد'], SHIFT_LEADERSHIP:['Shift leadership','قيادة شيفت'], DRAFT:['Draft','مسودة'], APPROVED:['Approved','معتمد'], REOPENED:['Reopened','أعيد فتحه'], REJECTED:['Rejected','مرفوض'], STAFF:['Staff','عضو فريق'], BIRTHDAY_HOST:['Birthday host','مسؤول عيد ميلاد'], TRIP_TEAM_LEADER:['Trip leader','قائد رحلة'], SHIFT_TEAM_LEADER:['Shift leader','قائد شيفت'], SHIFT_DEPUTY:['Shift deputy','نائب قائد الشيفت'],
};
function workspaceLabel(code, ar=false, fallback) { return labels[code]?.[ar?1:0] || fallback || String(code || '—').replaceAll('_',' '); }
const c=(group,code,label,labelAr,successCriteria,successCriteriaAr,requiredLevel=3)=>({templateCode:group.toUpperCase().replaceAll(' ','_'),group,code,label,labelAr,requiredLevel,maxLevel:4,active:true,order:0,evidenceRequired:true,operationalReportsQualifyAsEvidence:true,practicalAssignmentTypes:[],successCriteria,successCriteriaAr});
// Editable proposals, never employee assessments or an automatically published policy.
const PROPOSED_COMPETENCIES=[
 c('Ride Operator','SAFE_OPERATION','Safe operation & incident response','التشغيل الآمن والاستجابة للحوادث','Complete opening checks and one supervised emergency drill; supervisor signs the checklist and records corrective actions.','نفّذ فحوصات الافتتاح وتجربة طوارئ تحت الإشراف، مع توقيع المشرف وتوثيق الإجراءات التصحيحية.'),
 c('Ride Operator','GUEST_CARE','Guest care & issue resolution','خدمة الضيوف وحل المشكلات','Handle three observed guest situations, documenting the response, escalation and guest follow-up.','تعامل مع ثلاث حالات ضيوف تحت الملاحظة، ووثّق الاستجابة والتصعيد والمتابعة.'),
 c('Ride Operator','SHIFT_RELIABILITY','Shift reliability & handover','الالتزام بالشيفت والتسليم','Complete three documented handovers covering attendance, equipment status, unresolved issues and next-shift responsibilities.','أكمل ثلاث عمليات تسليم موثقة تشمل الحضور وحالة المعدات والمشكلات ومسؤوليات الشيفت التالي.'),
 c('Front Cashier','CASH_CONTROL','Cash control & reconciliation','الرقابة النقدية والتسوية','Complete three supervised till reconciliations; document every difference and obtain manager verification.','أكمل ثلاث تسويات خزينة تحت الإشراف، مع توثيق كل فرق والتحقق الإداري.'),
 c('Front Cashier','BOOKING_ACCURACY','Booking, offer & bracelet accuracy','دقة الحجز والعروض والأساور','Process a supervised sample of trip, birthday and walk-in transactions with correct offers, counts and bracelet allocation; retain the checked sample.','نفّذ عينة مراجعة من حجوزات الرحلات وأعياد الميلاد والعملاء الأفراد مع صحة العروض والأعداد وتوزيع الأساور.'),
 c('Front Cashier','PAYMENT_ESCALATION','Payment issues & escalation','مشكلات الدفع والتصعيد','Demonstrate approved refund, payment-issue and escalation procedures in a witnessed practical exercise.','طبّق إجراءات الاسترداد ومشكلات الدفع والتصعيد المعتمدة في تمرين عملي مشهود.'),
 c('Operation Supervisor','TEAM_LEADERSHIP','Team leadership & coaching','قيادة الفريق والتوجيه','Lead two supervised shifts: briefing, allocation, breaks, coaching and handover; record manager feedback and improvements.','قُد شيفتين تحت الإشراف يشملان اجتماع البداية والتوزيع والراحات والتوجيه والتسليم، مع توثيق ملاحظات المدير والتحسينات.'),
 c('Operation Supervisor','OPERATIONS_CONTROL','Coverage, safety & escalation','تغطية التشغيل والسلامة والتصعيد','Prepare and run a shift plan, verify qualifications and coverage, and resolve one simulated staffing shortage with an approved escalation.','جهّز ونفّذ خطة شيفت، وتحقق من التأهيل والتغطية، وعالج نقصًا افتراضيًا في العمالة بتصعيد معتمد.',4),
 c('Operation Supervisor','PERFORMANCE_FOLLOW_UP','Performance review & follow-up','مراجعة الأداء والمتابعة','Review actual approved reports and attendance, give evidence-based feedback, and document a follow-up action and review date.','راجع تقارير فعلية معتمدة والحضور، وقدّم ملاحظات مدعومة بالأدلة، وسجّل إجراء متابعة وتاريخ مراجعة.'),
];
function proposedFramework(configuration,candidate){const path=resolveSuccessionPath({succession:configuration},{fromRole:candidate.currentRole,toRole:candidate.targetRole});return PROPOSED_COMPETENCIES.filter(row=>path.cumulativeTemplateGroups.includes(row.group)).map((row,index)=>({...row,order:index+1}));}
function planPath(configuration,candidate,plan=candidate.plan){return resolveSuccessionPath({succession:{...configuration,...(plan?.framework?.length?{competencies:plan.framework}:{})}},{fromRole:candidate.currentRole,toRole:candidate.targetRole});}
function evidenceValid(metadata,candidate,required){
 const reports=metadata?.evidence||[],documents=metadata?.documents||[];
 const validReports=reports.filter(item=>candidate.evidenceReports?.some(current=>current.id===item.reportId&&current.revision===item.revision));
 const validDocuments=documents.filter(item=>candidate.evidenceDocuments?.some(current=>current.id===item.id));
 return (!required||validReports.length+validDocuments.length>0)&&validReports.length===reports.length&&validDocuments.length===documents.length;
}
function successionProgress(candidate,asOf=new Date().toISOString().slice(0,10)){
 const path=planPath(candidate.configuration,candidate),actions=candidate.developmentActions||[],assessments=candidate.plan?.assessments||{};
 const gaps=path.competencies.map(definition=>{
  const key=keyOf(definition),assessment=assessments[key];
  const measured=assessment&&evidenceValid(assessment,candidate,definition.evidenceRequired)?Number(assessment.currentLevel):null;
  const completed=actions.filter(action=>action.competency===key&&action.status==='COMPLETED'&&evidenceValid(action.metadata,candidate,definition.evidenceRequired));
  const levels=[measured,...completed.map(action=>Number(action.metadata?.attainedLevel))].filter(value=>value!==null&&Number.isFinite(value)&&value<=(definition.maxLevel||100));
  const currentLevel=levels.length?Math.max(...levels):null;
  const related=actions.filter(action=>action.competency===key);
  return {key,definition,currentLevel,recordedLevel:assessment?.currentLevel??null,met:currentLevel!==null&&currentLevel>=definition.requiredLevel,gap:currentLevel===null?null:Math.max(0,definition.requiredLevel-currentLevel),actions:related,needsEvidence:Boolean(assessment)&&!evidenceValid(assessment,candidate,definition.evidenceRequired)};
 });
 const overdue=actions.filter(action=>!['COMPLETED','NOT_REQUIRED'].includes(action.status)&&action.targetDate&&action.targetDate<asOf);
 const completed=actions.filter(action=>action.status==='COMPLETED').length,met=gaps.filter(row=>row.met).length;
 return {gaps,met,total:gaps.length,coverage:gaps.length?Math.round(met/gaps.length*100):null,completed,totalActions:actions.length,overdue,reviewDue:Boolean(candidate.plan?.nextReviewDate&&candidate.plan.nextReviewDate<=asOf),unassessed:gaps.filter(row=>row.currentLevel===null).length};
}
module.exports={PLAN_PREFIX,keyOf,workspaceLabel,proposedFramework,planPath,successionProgress,evidenceValid};
