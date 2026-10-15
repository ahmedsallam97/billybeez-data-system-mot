"use client";
import {monthlySourceConfig} from '@/lib/operations/performance-source-config';
import styles from './PerformanceSettingsWorkspace.module.css';

export default function MonthlySourcesSettings({value,onChange,t,rewards=[],surveys=[],Field,NumberField,Toggle,StringListField}) {
  const config=monthlySourceConfig(value);
  const set=(component,key,next)=>onChange({...config,[component]:{...config[component],[key]:next}});
  return <section className={styles.configCard}>
    <h4>{t('Recognition and guest feedback sources','مصادر التكريم وتقييم الضيوف')}</h4>
    <p>{t('Publish these source rules only after confirming the rubric. Existing weights stay unchanged. Missing evidence remains pending; historical entry needs independent approval and cannot replace automatic evidence.','انشر قواعد المصدر بعد تأكيد مقياس الدرجات. تظل الأوزان كما هي. نقص الأدلة يبقي النتيجة معلقة؛ الإدخال التاريخي يحتاج اعتمادًا مستقلاً ولا يستبدل الأدلة الآلية.')}</p>
    {Object.entries(config).map(([component,item])=><details key={component}>
      <summary>{component==='recognition'?t('Recognition — approved positive event awards','التكريم — مكافآت الأحداث الموجبة المعتمدة'):t('Guest feedback — approved surveys and resolved ratings','تقييم الضيوف — الاستبيانات المعتمدة والتقييمات المغلقة')}</summary>
      <div className={styles.fieldGrid}>
        <Toggle label={t('Enable numeric source','تفعيل المصدر الرقمي')} checked={item.active} onChange={next=>set(component,'active',next)}/>
        <Toggle label={t('Approval evidence required','دليل الاعتماد إلزامي')} checked={item.approvalRequired} onChange={next=>set(component,'approvalRequired',next)}/>
        <Field type="date" label={t('Effective from','ساري من')} value={item.effectiveFrom||''} onChange={next=>set(component,'effectiveFrom',next||null)}/>
        <Field type="date" label={t('Effective to','ساري حتى')} value={item.effectiveTo||''} onChange={next=>set(component,'effectiveTo',next||null)}/>
        <StringListField label={t('Branches (* = all)','الفروع (* = الكل)')} value={item.branches} onChange={next=>set(component,'branches',next)} addLabel={t('Branch','فرع')} t={t}/>
        <StringListField label={t('Eligible job titles (empty = all)','الوظائف المؤهلة (فارغ = الكل)')} value={item.eligibleJobTitles} onChange={next=>set(component,'eligibleJobTitles',next)} addLabel={t('Job title','وظيفة')} t={t}/>
        <StringListField label={t('Eligible employment statuses','حالات التوظيف المؤهلة')} value={item.eligibleStatuses} onChange={next=>set(component,'eligibleStatuses',next)} addLabel={t('Status','حالة')} t={t}/>
      </div>
      {component==='recognition'?<>
        <p>{t('Monthly Recognition = eligible configured points / monthly cap × 100, capped at 100. Cancelled or reopened reports and reversed awards are excluded.','التكريم الشهري = النقاط المؤهلة حسب الإعداد / الحد الشهري × 100، بحد أقصى 100. تُستبعد التقارير الملغاة أو المعاد فتحها والمكافآت المعكوسة.')}</p>
        <div className={styles.fieldGrid}><NumberField label={t('Monthly point cap (required)','الحد الشهري للنقاط (إلزامي)')} min={0.01} step={0.01} value={item.monthlyCap??''} onChange={next=>set(component,'monthlyCap',next===''?null:next)}/>
        {['TRIP','BIRTHDAY','SHIFT_LEADERSHIP'].map(type=><Toggle key={type} label={t({TRIP:'Trip',BIRTHDAY:'Birthday',SHIFT_LEADERSHIP:'Shift Leader'}[type],{TRIP:'رحلة',BIRTHDAY:'عيد ميلاد',SHIFT_LEADERSHIP:'قائد الشيفت'}[type])} checked={item.includedReportTypes.includes(type)} onChange={checked=>set(component,'includedReportTypes',checked?[...item.includedReportTypes,type]:item.includedReportTypes.filter(code=>code!==type))}/>)}</div>
        <div className={styles.fieldGrid}>{rewards.filter(level=>level.active&&level.points>0).map(level=>{const existing=item.levels.find(row=>row.levelCode===level.code);return <div key={level.code}><Toggle label={level.labelAr?t(level.label||level.code,level.labelAr):level.label||level.code} checked={Boolean(existing)} onChange={checked=>set(component,'levels',checked?[...item.levels,{levelCode:level.code,points:Number(level.points)}]:item.levels.filter(row=>row.levelCode!==level.code))}/>{existing&&<NumberField label={t('Recognition points','نقاط التكريم')} min={0.01} step={0.01} value={existing.points} onChange={points=>set(component,'levels',item.levels.map(row=>row.levelCode===level.code?{...row,points}:row))}/>}</div>;})}</div>
      </>:<>
        <div className={styles.fieldGrid}>
          <Toggle label={t('Include resolved Employee 360 ratings','احتساب تقييمات ملف الموظف المغلقة')} checked={item.includeDirectFeedback} onChange={next=>set(component,'includeDirectFeedback',next)}/>
          <NumberField label={t('Rating scale minimum','أدنى قيمة بمقياس التقييم')} value={item.ratingMinimum} min={0} step={0.01} onChange={next=>set(component,'ratingMinimum',next)}/>
          <NumberField label={t('Rating scale maximum','أعلى قيمة بمقياس التقييم')} value={item.ratingMaximum} min={0} step={0.01} onChange={next=>set(component,'ratingMaximum',next)}/>
          <NumberField label={t('Minimum genuine responses','الحد الأدنى للاستجابات الحقيقية')} value={item.minimumResponses} min={1} onChange={next=>set(component,'minimumResponses',next)}/>
          <NumberField label={t('Trip staff attribution weight (0 excludes)','وزن إسناد موظفي الرحلة (0 يستبعد)')} value={item.tripStaffWeight} min={0} step={0.1} onChange={next=>set(component,'tripStaffWeight',next)}/>
          <NumberField label={t('Trip leader attribution weight (0 excludes)','وزن إسناد قائد الرحلة (0 يستبعد)')} value={item.tripLeaderWeight} min={0} step={0.1} onChange={next=>set(component,'tripLeaderWeight',next)}/>
          <label className={styles.field}>{t('Shared birthday attribution','إسناد عيد الميلاد المشترك')}<select value={item.birthdayAttribution} onChange={event=>set(component,'birthdayAttribution',event.target.value)}><option value="EQUAL">{t('Equal responsibility share','نصيب متساوٍ للمسؤولين')}</option><option value="FULL">{t('Full response for each host','استجابة كاملة لكل مسؤول')}</option></select></label>
          <StringListField label={t('Eligible question codes (empty = all numeric)','رموز الأسئلة المؤهلة (فارغ = كل الرقمي)')} value={item.questionCodes} onChange={next=>set(component,'questionCodes',next)} addLabel={t('Question code','رمز سؤال')} t={t}/>
        </div>
        <h5>{t('Eligible configurable survey templates','قوالب الاستبيانات القابلة للضبط المؤهلة')}</h5><div className={styles.fieldGrid}>{[...new Map(surveys.map(template=>[template.code,template])).values()].map(template=><Toggle key={template.code} label={t(template.label||template.code,template.labelAr||template.label||template.code)} checked={item.eligibleTemplates.includes(template.code)} onChange={checked=>set(component,'eligibleTemplates',checked?[...item.eligibleTemplates,template.code]:item.eligibleTemplates.filter(code=>code!==template.code))}/>)}</div>
        <p>{t('One approved event survey counts as one response, regardless of its number of numeric answers. Only confirmed responsible hosts or actual trip participants receive attributed evidence.','استبيان الحدث المعتمد يُحسب استجابة واحدة مهما كان عدد الإجابات الرقمية. تُسند الأدلة للمسؤولين المؤكدين أو المشاركين الفعليين في الرحلة فقط.')}</p>
      </>}
    </details>)}
  </section>;
}
