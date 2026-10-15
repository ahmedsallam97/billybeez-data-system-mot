"use client";
import { useUiText } from '@/app/i18n';
import ActionButton from "@/app/ActionButton";
import { useMemo } from "react";
import { employeeProfileSummary } from "@/lib/operations/employee-profile-summary";
import { formatPerformanceScore } from "@/lib/operations/score-format";
import styles from "./EmployeeProfile.module.css";

export const readable = value => ({PART_TIME:"Part time", HRIS:"HRIS", DEFAULT_FULL:"Awaiting review", DEFAULT_ZERO:"Awaiting review", NOT_REQUIRED:"Not required", NOT_QUALIFIED:"Not qualified", ANP:"Absent without permission", AWP:"Absent with permission", NOT_APPLICABLE:"Not employed"}[value] || String(value || "—").toLowerCase().replaceAll("_"," ").replace(/^./,c=>c.toUpperCase()));
export const profileDate = value => value ? new Intl.DateTimeFormat("en-GB",{day:"numeric",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(new Date(value)) : "—";
export function ProfileIcon({kind="profile"}) {
  const paths={profile:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",calendar:"M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2",document:"M14 2H5v20h14V7l-5-5v5h5M7 12h8m-8 4h8",award:"m12 3 3 5 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1 3-5",briefcase:"M8 7V3h8v4M3 7h18v14H3V7Zm0 6h18m-11-2v4h4v-4",clock:"M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",check:"m5 12 4 4L19 6",chart:"M4 20V10m8 10V4m8 16v-7",pin:"M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM12 7v6m-3-3h6",print:"M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6v-7"};
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]||paths.profile}/></svg>;
}
export function StatusPill({value}) {const localize=useUiText();const tone=["ACTIVE","QUALIFIED","REVIEWED","APPROVED","COMPLETED","PRESENT"].includes(value)?"green":["IN_PROGRESS","TRAINING","IN_TRAINING","LATE","DEFAULT_FULL","DEFAULT_ZERO"].includes(value)?"amber":["NOT_QUALIFIED","RESTRICTED","EXPIRED","ABSENT","INACTIVE"].includes(value)?"red":"purple";return <span className={`${styles.pill} ${styles[tone]}`} title={localize(readable(value))}>{localize(readable(value))}</span>;}
export function ProfilePanel({title,action,children,className=""}) {const localize=useUiText();return <section className={`card ${styles.card} ${className}`}><header><h3>{localize(title)}</h3>{action}</header>{children}</section>;}
export function EmptyProfile({children="No records available."}) {const localize=useUiText();return <p className={styles.empty}>{localize(children)}</p>;}
function MetricRing({value,label,tone="purple"}) {const percentage=Number.isFinite(value)?Math.max(0,Math.min(100,value)):0;return <div className={`${styles.ring} ${styles[tone]}`} style={{"--ring-progress":`${percentage*3.6}deg`}}><strong>{label}</strong></div>;}
function Facts({items}) {const localize=useUiText();return <dl className={styles.facts}>{items.map(([label,value])=><div key={label}><dt>{localize(label)}</dt><dd>{value ?? "—"}</dd></div>)}</dl>;}
export function ActivityTimeline({items=[],compact=false}) {
  const localize = useUiText();return items.length?<ol className={`${styles.timeline} ${compact?styles.compact:""}`}>{items.map((item,index)=><li key={`${item.type}-${item.date}-${index}`}><span className={styles.activityIcon}><ProfileIcon kind={item.type==="DOCUMENT"?"document":item.type==="RECOGNITION"?"award":"calendar"}/></span><time>{profileDate(item.date)}</time><div><b>{localize(readable(item.type))}</b><p>{readable(item.title)}{item.detail?` · ${readable(item.detail)}`:""}</p></div></li>)}</ol>:<EmptyProfile>{localize("No activity recorded for this period.")}</EmptyProfile>;}
export function QualificationCards({items=[]}) {
  const localize = useUiText();return items.length?<div className={styles.qualificationGrid}>{items.map(item=><article className={styles.qualification} key={item.id}><span className={styles.positionIcon}><ProfileIcon kind="award"/></span><b>{item.label}</b><StatusPill value={item.status}/>{item.record?.expiryDate&&<small>{localize("Until")} {profileDate(item.record.expiryDate)}</small>}</article>)}</div>:<EmptyProfile>{localize("No operational positions are configured.")}</EmptyProfile>;}
export function EmploymentHistory({rows=[]}) {
  const localize = useUiText();return rows.length?<div className={styles.tableWrap}><table><thead><tr><th>{localize("From")}</th><th>{localize("To")}</th><th>{localize("Position")}</th><th>{localize("Code")}</th><th>{localize("Change")}</th></tr></thead><tbody>{rows.map(item=><tr key={item.id}><td>{profileDate(item.effectiveFrom)}</td><td>{item.effectiveTo?profileDate(item.effectiveTo):localize("Ongoing")}</td><td>{item.positionName}</td><td>{item.jobCode||"—"}</td><td>{localize(readable(item.changeReason))}</td></tr>)}</tbody></table></div>:<EmptyProfile>{localize("No employment assignments recorded.")}</EmptyProfile>;}
export function UpcomingSchedule({items=[]}) {
  const localize = useUiText();return items.length?<div className={styles.tableWrap}><table><thead><tr><th>{localize("Date")}</th><th>{localize("Day")}</th><th>{localize("Shift / status")}</th></tr></thead><tbody>{items.map(item=><tr key={item.id}><td>{profileDate(item.workDate)}</td><td>{localize(new Intl.DateTimeFormat("en",{weekday:"short",timeZone:"UTC"}).format(new Date(`${item.workDate}T00:00:00Z`)))}</td><td><span className={styles.shift} data-code={item.code}>{item.importRawValue||readable(item.code)}</span></td></tr>)}</tbody></table></div>:<EmptyProfile>{localize("No upcoming published schedule.")}</EmptyProfile>;}
export default function EmployeeProfileOverview({employee,onNavigate=()=>{},endDate,year}) {
  const localize = useUiText();
  const summary=useMemo(()=>employeeProfileSummary(employee,endDate,year),[employee,endDate,year]);
  const qualified=summary.qualifications.filter(item=>item.status==="QUALIFIED").length;
  const training=summary.qualifications.filter(item=>["TRAINING","IN_TRAINING","IN_PROGRESS"].includes(item.status)).length;
  const required=summary.qualifications.filter(item=>item.requiresQualification).length;
  const nav=(tab,label="View details")=><ActionButton type="button" className={styles.textButton} onClick={()=>onNavigate(tab)}>{localize(label)} <span className="directional-icon" aria-hidden="true">→</span></ActionButton>;
  return <div className={styles.overview}>
    <div className={styles.metrics}>
      <ProfilePanel title={localize("Attendance rate")} action={nav("Schedule & Attendance")}><div className={styles.metricContent}><MetricRing value={summary.attendanceRate} label={summary.attendanceRate===null?"—":`${summary.attendanceRate}%`} tone="green"/><Facts items={[["Attended",summary.present],["Late",summary.late],["Absent",summary.absences],["Early leave",summary.earlyLeave]]}/></div><small>{localize("Recorded expected workdays ·")} {summary.year}</small></ProfilePanel>
      <ProfilePanel title={localize("Performance")} action={nav("Performance")}><div className={styles.metricContent}><div className={styles.score}><strong>{summary.performanceScore??"—"}</strong><span>{summary.performanceUnit==="points"?localize("points"):localize("percent")}</span></div><Facts items={[["Average",formatPerformanceScore(summary.performanceScore,summary.performanceUnit)],["Approved appraisals",summary.appraisals.length],["Daily evaluations",summary.dailyEvaluations.length]]}/></div><small>{summary.performanceUnit==="points"?localize("Approved monthly appraisals"):localize("Reviewed daily evaluations")} · {summary.year}</small></ProfilePanel>
      <ProfilePanel title={localize("Training & qualifications")} action={nav("Training & Qualifications")}><div className={styles.metricContent}><MetricRing value={required?qualified/required*100:null} label={required?`${qualified}/${required}`:"—"} tone="blue"/><Facts items={[["Qualified",qualified],["In training",training],["Not qualified",summary.qualifications.filter(item=>["NOT_QUALIFIED","EXPIRED"].includes(item.status)).length],["Restricted",summary.qualifications.filter(item=>item.status==="RESTRICTED").length]]}/></div><small>{localize("Current recorded qualification status")}</small></ProfilePanel>
      <ProfilePanel title={localize("Leaves & balances")} action={nav("Leaves & Balances")}>
        {summary.leaves.length?<Facts items={summary.leaves.map(item=>[readable(item.leaveType),`${item.balance} ${localize("days")}`])}/>:<EmptyProfile>{localize("No leave ledger for")} {summary.year}.</EmptyProfile>}<small>{localize("Valid ledger entries through")} {summary.endDate}</small>
      </ProfilePanel>
    </div>
    <div className={styles.twoColumns}>
      <ProfilePanel title={localize("Recent activity")} action={nav("Timeline","View all")}><ActivityTimeline items={summary.recent} compact/></ProfilePanel>
      <ProfilePanel title={localize("Operational qualifications")} action={nav("Training & Qualifications","View all")}><QualificationCards items={summary.qualifications}/></ProfilePanel>
    </div>
    <div className={styles.historyColumns}>
      <ProfilePanel title={localize("Employment history")} action={nav("Employment","Add event")}><EmploymentHistory rows={summary.employment}/></ProfilePanel>
      <ProfilePanel title={localize("Upcoming schedule")} action={nav("Schedule & Attendance","View schedule")}><UpcomingSchedule items={summary.upcoming}/></ProfilePanel>
    </div>
  </div>;
}

