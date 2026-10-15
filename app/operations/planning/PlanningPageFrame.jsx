"use client";
import { OperationalError } from '../../ui/OperationalFeedback';
import {PageHeader} from '../../ui/DesktopLayout';
import ActionButton from "@/app/ActionButton";
import Link from 'next/link';
import {nextActionLabel} from './PlanDetailsWorkspace';
import {WorkflowHint} from './PlanningControls';
import styles from '../PlanningWorkspace.module.css';
export default function PlanningPageFrame({page,title,description,action,children}){
 const {mode,data,error,notice,t,ar,load,markDirty}=page;
 if(!data)return <><PageHeader title={title} description={description}/><section className={styles.panel} aria-busy={!error}>{error?<><h2>{t('Records could not be loaded','تعذر تحميل السجلات')}</h2><OperationalError error={error}/><ActionButton className="secondary" onClick={load}>{t('Try again','إعادة المحاولة')}</ActionButton></>:<><p role="status">{t('Loading planning records…','جارٍ تحميل سجلات التخطيط…')}</p><div className={styles.skeleton} aria-hidden="true"><span/><span/><span/></div></>}</section></>;
 const isDetail=page.create||page.params.get('planId')||page.params.get('developmentId');
 return <section className={styles.workspace} aria-label={title} data-planning-page={mode} onChange={event=>{if(event.target.closest('form'))markDirty();}}>
  <PageHeader title={title} description={description} actions={action}/>
  <OperationalError error={error}/>
  {page.busy?<p className={styles.success} role="status">{t('Saving your change…','جارٍ حفظ التغيير…')}</p>:notice&&<p className={styles.success} role="status">{notice}</p>}
  {!isDetail&&mode!=='reports'&&data.notifications.length>0&&<aside className={`${styles.callout} ${styles.urgent}`} aria-label={t('Your follow-up alerts','تنبيهات متابعتك')}><details><summary>{t('Needs your attention','يحتاج متابعتك')} · {data.notifications.length} {data.notifications.length>1&&`· ${t('View all follow-ups','عرض كل المتابعات')}`}</summary>{data.notifications.length>1&&<ul className={styles.attentionList}>{data.notifications.slice(1).map(row=><li key={row.id}><Link href={row.href}><b>{row.employee}</b><span>{nextActionLabel(row.type,ar)}</span></Link></li>)}</ul>}</details><p><Link href={data.notifications[0].href}>{data.notifications[0].employee} · {nextActionLabel(data.notifications[0].type,ar)}</Link></p></aside>}
  {children}<WorkflowHint t={t}/>
 </section>;
}

