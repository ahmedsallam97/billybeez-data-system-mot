const COMPONENTS={dailyPerformance:['Daily performance','الأداء اليومي'],attendanceReliability:['Attendance','الحضور'],recognition:['Recognition','التكريم'],guestFeedback:['Guest feedback','تقييم الضيوف'],processReliability:['Process reliability','الالتزام بالإجراءات'],leadershipProblemResolution:['Leadership','القيادة']};
function componentLabel(code,ar=false){return COMPONENTS[code]?.[ar?1:0]||String(code).replaceAll('_',' ');}
function exclusionText(code,row,ar=false){
 const t=(en,arabic)=>ar?arabic:en;
 switch(code){
  case 'MISSING_COMPONENTS':return t('Missing required scores: ','درجات مطلوبة غير متوفرة: ')+(row.missingComponents||[]).map(key=>`${componentLabel(key,ar)} (${Number(row.formula?.[key]||0)}%)`).join(' · ');
  case 'NO_DAILY':return t('No daily evaluations recorded in this period.','لا توجد تقييمات يومية مسجلة في هذه الفترة.');
  case 'INCOMPLETE':return t(`${row.incompleteDays||0} daily entries still require review; default scores are excluded.`,`${row.incompleteDays||0} تقييم يومي يحتاج مراجعة؛ الدرجات الافتراضية مستبعدة.`);
  case 'AWAITING_CLOSE':return t(`${row.awaitingCloseDays||0} reviewed daily entries await day approval/closing.`,`${row.awaitingCloseDays||0} تقييم يومي مُراجع ينتظر اعتماد وإغلاق اليوم.`);
  case 'MINIMUM_DAYS':return t(`${row.completedDays} completed days; at least ${row.eligibilityRules?.minimumDailyEvaluations} are required.`,`${row.completedDays} يوم مكتمل؛ المطلوب ${row.eligibilityRules?.minimumDailyEvaluations} أيام على الأقل.`);
  case 'INSUFFICIENT_COVERAGE':return t(`Evaluation coverage ${row.coverage?.actualDays}/${row.coverage?.expectedDays} does not meet the configured minimum.`,`تغطية التقييم ${row.coverage?.actualDays}/${row.coverage?.expectedDays} لا تحقق الحد الأدنى المحدد.`);
  case 'ARCHIVED_EMPLOYEE':return t('Employee is archived and cannot enter the competition.','الموظف مؤرشف ولا يدخل المسابقة.');
  case 'INACTIVE_EMPLOYEE':return t('Only active employees are eligible under the configured rules.','الإعدادات تسمح للموظفين النشطين فقط بالمشاركة.');
  case 'MINIMUM_SCORE':return t(`Monthly score is below ${row.eligibilityRules?.minimumScore}.`,`النتيجة الشهرية أقل من ${row.eligibilityRules?.minimumScore}.`);
  case 'AWAITING_MONTHLY_APPROVAL':return row.appraisalId&&row.appraisalStatus!=='SUPERSEDED'?t('Monthly result exists but has not been approved.','النتيجة الشهرية موجودة لكنها لم تُعتمد.'):t('A valid monthly draft must be calculated and approved first.','يجب حساب مسودة شهرية صالحة واعتمادها أولًا.');
  case 'SOURCE_CHANGED':return t('Daily sources changed after approval; the approved score is preserved and needs authorized review.','تغيّرت المصادر اليومية بعد الاعتماد؛ النتيجة المعتمدة محفوظة وتحتاج مراجعة مصرحًا بها.');
  case 'STALE_MONTHLY_RESULT':return t('The calculated monthly draft is stale or superseded; recalculate from the current daily sources.','المسودة الشهرية المحسوبة قديمة أو مستبدلة؛ أعد حسابها من المصادر اليومية الحالية.');
  default:return t('Review the monthly result and its source records.','راجع النتيجة الشهرية وسجلات مصدرها.');
 }
}
module.exports={COMPONENTS,componentLabel,exclusionText};
