"use client";
import { latestDecision } from '@/lib/operations/career-planning';
export default function PlanCompleteness({ candidate, developments, t, next }) {
  const linked=developments.filter(row=>row.candidateId===candidate.id),tasks=linked.flatMap(row=>row.objectives.flatMap(objective=>objective.assignments));
  const checks=[
    [t('Plan owner','مسؤول الخطة'),Boolean(candidate.plan?.details?.ownerUserId),'#plan-ownership'],
    [t('Target-role requirements','متطلبات الوظيفة المستهدفة'),candidate.progress.total>0,'#plan-gaps'],
    [t('Competency evidence','أدلة الكفاءات'),candidate.progress.total>0&&candidate.progress.unassessed===0,'#plan-gaps'],
    [t('Development assignments','تكليفات التطوير'),tasks.length>0,'#plan-development'],
    [t('Review schedule','جدول المراجعات'),Boolean(candidate.plan?.nextReviewDate),'#plan-ownership'],
    [t('Manual readiness decision','قرار الجاهزية اليدوي'),latestDecision(candidate)!=='NOT_ASSESSED','#plan-readiness']
  ];
  const setupMissing=!checks[0][1]||!checks[1][1]||!checks[4][1];
  const phase=setupMissing?t('Plan setup incomplete','إعداد الخطة غير مكتمل'):!checks[2][1]?t('Competency evidence needed','تحتاج أدلة كفاءات'):tasks.some(row=>row.status!=='COMPLETED')?t('Development in progress','التطوير قيد التنفيذ'):!checks[5][1]?t('Manual readiness review required','يلزم قرار جاهزية يدوي'):t('Follow the documented decision','تابع القرار الموثق');
  const setupBlocker=[checks[0],checks[1],checks[4]].find(row=>!row[1]),blockedTask=tasks.find(row=>row.status==='BLOCKED');
  const blocker=next || (setupBlocker?setupBlocker[0]:!checks[2][1]?t('Document missing competency evidence before the next review.','وثّق أدلة الكفاءات الناقصة قبل المراجعة القادمة.'):blockedTask?blockedTask.blocker:tasks.some(row=>row.status!=='COMPLETED')?t('Development assignments are still in progress.','تكليفات التطوير ما زالت قيد التنفيذ.'):!checks[5][1]?t('Record a manual readiness decision.','سجّل قرار الجاهزية اليدوي.'):t('No setup blocker recorded.','لا يوجد عائق إعداد مسجّل.'));
  return <section className="ui-plan-completeness" aria-label={t('Plan completeness','اكتمال الخطة')}><header><b>{t('Plan completeness','اكتمال الخطة')}</b><span>{phase}</span></header><ul>{checks.map(([caption,complete,href])=><li key={caption} data-complete={complete}><a href={href}><span aria-hidden="true">{complete?'✓':'○'}</span>{caption}<small>{complete?t('Recorded','مسجّل'):t('Needs attention','يحتاج متابعة')}</small></a></li>)}</ul><p><b>{t('Current first blocker','أول عائق حالي')}: </b>{blocker}</p></section>;
}
