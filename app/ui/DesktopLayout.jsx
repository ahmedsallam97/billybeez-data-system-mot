"use client";
import FormFeedbackScope from './FormFeedbackScope';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {usePermission} from '../account/AccountContext';
import {useI18n} from '../i18n';
import {PAGES,pageId} from '@/lib/operations/page-routes';

export function PageShell({children,className='',...props}){return <div className={`ui-page-shell ${className}`} data-desktop-layout {...props}><FormFeedbackScope>{children}</FormFeedbackScope></div>;}
export function Breadcrumb({label}){
 const pathname=usePathname(),{isArabic}=useI18n();
 const settings=pathname.startsWith('/opmanager/settings/');
 const id=pageId(pathname),current=label||(id?PAGES[id][isArabic?2:1]:undefined);
 return <nav className="ui-breadcrumb" aria-label={isArabic?'مسار الصفحة':'Breadcrumb'}><Link href="/opmanager">{isArabic?'العمليات':'Operations'}</Link>{settings&&<><span aria-hidden="true">/</span><Link href="/opmanager/settings">{isArabic?'الإعدادات':'Settings'}</Link></>}{current&&<><span aria-hidden="true">/</span><span aria-current="page">{current}</span></>}</nav>;
}
export function PageActions({children,className='',...props}){return <div className={`ui-page-actions ${className}`} {...props}>{children}</div>;}
export function PageHeader({title,description,context,actions,children,className='',breadcrumb=true,...props}){
 const pathname=usePathname(),{isArabic}=useI18n(),id=pageId(pathname);
 const canAttend=usePermission("attendance.view"),canRoster=usePermission("roster.view");
 const heading=title||(id?PAGES[id][isArabic?2:1]:'');
 return <header className={`ui-page-header module-page-identity ${className}`} data-page-header data-module={id||undefined} {...props}>{breadcrumb&&<Breadcrumb label={heading}/>}<div className="ui-header-row"><div className="ui-header-copy"><h1>{heading}</h1>{description&&<p>{description}</p>}{context&&<div className="ui-header-context">{context}</div>}{id==='roster'&&canAttend&&<Link className="ui-context-link" href="/operations/attendance">{isArabic?'الحضور والراحة والتسليم ←':'Attendance, breaks and handover →'}</Link>}{id==='daily'&&canRoster&&<Link className="ui-context-link" href="/operations/daily">{isArabic?'عرض الروستر اليومي ←':'View daily roster →'}</Link>}</div>{actions&&<PageActions>{actions}</PageActions>}</div>{children}</header>;
}
export function FilterBar({children,className='',...props}){return <div className={`ui-filter-bar ${className}`} {...props}>{children}</div>;}
export function ContentGrid({children,columns=2,className='',style,...props}){return <div className={`ui-content-grid ${className}`} style={{'--ui-columns':columns,...style}} {...props}>{children}</div>;}
export function SectionCard({title,description,actions,children,className='',as:Tag='section',...props}){return <Tag className={`ui-section-card ${className}`} {...props}>{(title||actions)&&<header className="ui-section-head"><div>{title&&<h2>{title}</h2>}{description&&<p>{description}</p>}</div>{actions&&<PageActions>{actions}</PageActions>}</header>}{children}</Tag>;}
export function FormSection({title,description,children,open=false,className='',...props}){return <details className={`ui-form-section ${className}`} open={open} {...props}><summary>{title}</summary>{description&&<p>{description}</p>}<div className="ui-form-content">{children}</div></details>;}
export function DataTable({children,label,className='',...props}){return <div className={`ui-data-table ${className}`} role="region" aria-label={label} tabIndex={0} {...props}>{children}</div>;}
export function EmptyState({title,children,actions,className='',...props}){return <div className={`ui-empty-state ${className}`} {...props}><h3>{title}</h3>{children}{actions&&<PageActions>{actions}</PageActions>}</div>;}
