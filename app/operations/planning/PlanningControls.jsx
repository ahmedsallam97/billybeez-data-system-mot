"use client";
import {ContentGrid,EmptyState,DataTable} from '../../ui/DesktopLayout';
import ActionButton from "@/app/ActionButton";
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import styles from '../PlanningWorkspace.module.css';
import {label} from '@/lib/operations/career-planning';
export function Field({label:caption,children,full}){
 const field=useRef(null);
 useLayoutEffect(()=>{
  const control=field.current?.querySelector('textarea');if(!control)return;
  let width=-1;const fit=()=>{if(!control.getBoundingClientRect().width)return;control.style.height='auto';control.style.height=Math.ceil(control.scrollHeight+4)+'px';};
  fit();const observer=new ResizeObserver(()=>{const next=control.getBoundingClientRect().width;if(next!==width){width=next;fit();}});observer.observe(control);return()=>observer.disconnect();
 },[children?.props?.value]);
 return <label ref={field} className={full?styles.full:undefined}><span>{caption}</span>{children}</label>;
}
export function Select({label:caption,value,onChange,items,required=false,placeholder='—'}){return <Field label={caption}><select aria-label={caption} required={required} value={value||''} onChange={e=>onChange(e.target.value)}><option value="">{placeholder}</option>{items.map(row=><option key={row[0]} value={row[0]}>{row[1]}</option>)}</select></Field>;}
export function Stats({items}){return <ContentGrid columns={items.length} className={styles.stats}>{items.map(([value,caption,tone])=><article className={styles.stat} data-tone={tone} key={caption}><b>{value}</b><span>{caption}</span></article>)}</ContentGrid>;}
export function StatusBadge({code,ar}){return <span className={styles.badge} data-status={code}>{label(code,ar)}</span>;}
export function Progress({value,caption}){return <div className={styles.progress}><b>{value}%</b><progress max="100" value={value} aria-label={caption}/></div>;}
export function WorkflowHint({t}){return <details className={styles.workflowHint}><summary>{t('Workflow & status guide','دليل الخطوات والحالات')}</summary><ol className={styles.flow}>{[t('Employee & target position','الموظف والوظيفة المستهدفة'),t('Evidence & competency gaps','الأدلة وفجوات الكفاءة'),t('Owned succession plan','خطة خلافة بمسؤول واضح'),t('Development & progress reviews','التطوير ومتابعة التقدم'),t('Manual readiness decision','قرار الجاهزية الإداري'),t('Read-only reports','تقارير للقراءة فقط')].map((item,i)=><li key={item}><b>{i+1}</b>{item}</li>)}</ol><p>{t('Blocked means support is needed. Overdue means a due date has passed; a task can be both. Readiness is a documented manager decision, separate from progress and plan status.','المتعثر يحتاج دعمًا، والمتأخر تجاوز موعده؛ قد ينطبق الاثنان على نفس التكليف. الجاهزية قرار إداري موثق مستقل عن تقدم التطوير وحالة الخطة.')}</p></details>;}
export function Empty({title,children}){return <EmptyState className={styles.empty} title={title}>{children}</EmptyState>;}
export function Steps({names,step,caption='Steps'}){return <ol className={styles.steps} aria-label={caption}>{names.map((name,i)=><li key={name} aria-current={step===i?'step':undefined}>{i+1}. {name}</li>)}</ol>;}
export function useDraft(key,initial){
 const [draft,setDraft]=useState(initial),[ready,setReady]=useState(false),[restored,setRestored]=useState(false);
 useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(key)||'null');if(saved&&saved.at>Date.now()-7*86400000){setDraft({...initial,...saved.value});setRestored(true);}}catch{}setReady(true);},[key]);
 useEffect(()=>{if(!ready)return;try{localStorage.setItem(key,JSON.stringify({at:Date.now(),value:draft}));}catch{}},[draft,key,ready]);
 const clear=()=>{setDraft(initial);setRestored(false);try{localStorage.removeItem(key);}catch{}};
 return [draft,setDraft,clear,restored];
}
export function Filters({data,filters,change,mode,t,ar}){
 const rows=mode==='development'?data.developments:data.succession;
 const active=Object.entries(filters).filter(([,v])=>v),advanced=active.filter(([key])=>!['q','status','overdue','period'].includes(key));
 const names={q:t('Search','بحث'),employeeId:t('Employee','الموظف'),owner:t('Owner','المسؤول'),status:t('Status','الحالة'),readiness:t('Readiness','الجاهزية'),targetRole:t('Target','الهدف'),currentRole:t('Current position','الوظيفة الحالية'),branch:t('Branch','الفرع'),overdue:t('Overdue','متأخر'),nextReviewDate:t('Next review','المراجعة'),from:t('From','من'),until:t('Until','حتى'),period:t('Decision month','شهر القرارات'),dueDate:t('Due','الاستحقاق'),responsible:t('Responsible','المسؤول')};
 const select=(key,caption,items)=><Select aria-label={caption} label={caption} value={filters[key]} onChange={value=>change(key,value)} items={items} placeholder={t('All','الكل')}/>;
 return <section className={`${styles.panel} ${styles.filters}`} aria-label={t('Filters','التصفية')}>
  <div className={styles.filterMain}><Field label={t('Search employee or role','البحث بالموظف أو الوظيفة')}><input placeholder={t('Type a name or position…','اكتب اسمًا أو وظيفة…')} value={filters.q||''} onChange={e=>change('q',e.target.value)}/></Field>{select('status',t('Plan status','حالة الخطة'),['DRAFT','ACTIVE','ON_HOLD','UNDER_REVIEW','CLOSED'].map(code=>[code,label(code,ar)]))}{mode==='reports'&&<Field label={t('Decision history month','شهر سجل قرارات الجاهزية')}><input type="month" value={filters.period||''} onChange={e=>change('period',e.target.value)}/></Field>}<label className={styles.check}><input type="checkbox" checked={Boolean(filters.overdue)} onChange={e=>change('overdue',e.target.checked?'1':'')}/>{t('Overdue only','المتأخر فقط')}</label></div>
  <details open={advanced.length>0||undefined}><summary>{t('More filters','تصفية إضافية')}{advanced.length>0&&` (${advanced.length})`}</summary><div className={styles.fields}>
   {select('employeeId',t('Employee','الموظف'),data.employees.map(row=>[row.id,row.name]))}{select('branch',t('Branch','الفرع'),[[data.branch,data.branch]])}{select('currentRole',t('Current position','الوظيفة الحالية'),[...new Set(rows.map(row=>row.currentRole))].map(code=>[code,label(code,ar)]))}{select('targetRole',t('Target position','الوظيفة المستهدفة'),[...new Set(rows.map(row=>row.targetRole))].map(code=>[code,label(code,ar)]))}{select('owner',t('Plan owner','مسؤول الخطة'),(mode==='succession'?data.planOwners:data.owners).map(row=>[row.id,row.name]))}
   {mode!=='development'&&<>{select('readiness',t('Readiness','الجاهزية'),['NOT_ASSESSED','NOT_READY','READY_WITH_CONDITIONS','READY'].map(code=>[code,label(code,ar)]))}<Field label={t('Next review date','تاريخ المراجعة القادمة')}><input type="date" value={filters.nextReviewDate||''} onChange={e=>change('nextReviewDate',e.target.value)}/></Field></>}
   {mode==='development'&&<>{select('responsible',t('Responsible person','مسؤول التكليف'),data.owners.map(row=>[row.id,row.name]))}<Field label={t('Assignment due date','تاريخ استحقاق التكليف')}><input type="date" value={filters.dueDate||''} onChange={e=>change('dueDate',e.target.value)}/></Field></>}
   {mode==='reports'&&<><Field label={t('Decision history from','سجل القرارات من تاريخ')}><input type="date" value={filters.from||''} onChange={e=>change('from',e.target.value)}/></Field><Field label={t('Overdue reference date','تاريخ مرجع التأخر')}><input type="date" value={filters.until||data.asOf} onChange={e=>change('until',e.target.value)}/></Field><p className={styles.full}>{t('Month limits decision history. Other summaries show current records using the report reference date.','الشهر يحدد فترة سجل القرارات. باقي الملخصات تعرض السجلات الحالية وفق تاريخ مرجع التقرير.')}</p></>}
  </div></details>
  <p className="ui-filter-criteria">{mode==='reports'?t(`Summaries show current saved records. Due-date reference: ${data.asOf}. Decision history: ${filters.period || filters.from || 'all dates'} through ${filters.period ? 'the end of that month' : filters.until || data.asOf}.`, `الملخصات تعرض السجلات المحفوظة الحالية. مرجع التأخر: ${data.asOf}. سجل القرارات: ${filters.period || filters.from || 'كل التواريخ'} حتى ${filters.period ? 'نهاية الشهر المختار' : filters.until || data.asOf}.`):mode==='development'?t('Due-date filters select development assignments; overdue uses the current reference date.','تصفية الاستحقاق تختار تكليفات التطوير؛ التأخر يُحسب وفق تاريخ المرجع الحالي.'):t('Review-date filters select the next scheduled management review, not creation or promotion dates.','تاريخ المراجعة يختار موعد المراجعة الإدارية القادمة، وليس تاريخ الإنشاء أو الترقية.')}</p>
  <div className={styles.filterSummary}><span role="status">{active.length?active.map(([key,value])=>`${names[key]||key}: ${key==='employeeId'?data.employees.find(row=>row.id===value)?.name:key==='owner'||key==='responsible'?[...data.owners,...data.planOwners].find(row=>row.id===value)?.name:key==='overdue'?t('Yes','نعم'):label(value,ar)}`).join(' · '):t('Showing all accessible records','عرض كل السجلات المتاحة لصلاحياتك')}</span><ActionButton type="button" className="secondary" disabled={!active.length} onClick={()=>change(null,null)}>{t('Reset filters','مسح التصفية')}</ActionButton></div>
 </section>;
}

