"use client";
import { useUiText } from '@/app/i18n';
import {exclusionText,componentLabel} from '@/lib/operations/monthly-result-copy';
import {PageHeader,FilterBar} from '../ui/DesktopLayout';
import SafeDialog from "../ui/SafeDialog";
import { OperationalError, OperationalStatus } from "../ui/OperationalFeedback";
import ActionButton from "@/app/ActionButton";
import {PermissionButton,PermissionSection} from '@/app/account/PermissionControls';

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "../i18n";
import Link from "next/link";
import styles from "./PerformanceWorkspace.module.css";
import { MonthlyWinnerArtwork } from "./RecognitionArtwork";
import { printRecognitionArtwork } from "@/lib/client/print-recognition";
import { readApiResponse } from "@/lib/client/read-api-response";

function ManualAppraisalModal({ data, year, month, isArabic, busy, onClose, onSave, error }) {
  const localize = useUiText();
  const existing = new Map((data.appraisals || []).map((item) => [item.employeeId, item]));
  const [values, setValues] = useState(() => Object.fromEntries((data.employees || []).map((employee) => [employee.id, existing.has(employee.id) ? String(existing.get(employee.id).totalScore) : ""])));
  const [changed, setChanged] = useState({});
  const [reason, setReason] = useState("");
  const changedRows = Object.keys(changed).filter((employeeId) => changed[employeeId] && values[employeeId] !== "").map((employeeId) => ({ employeeId, totalScore: Number(values[employeeId]) }));
  async function submit(event) {
    event.preventDefault();
    if (!changedRows.length || reason.trim().length < 5) return;
    const saved = await onSave({ action: "appraisalManualOverride", year, month, reason: reason.trim(), rows: changedRows }, isArabic ? `تم حفظ ${changedRows.length} نتيجة يدوية كمسودة جديدة` : `${changedRows.length} manual score(s) saved as new drafts`);
    if (saved) onClose();
  }
  return <SafeDialog className="manual-appraisal-modal" titleId="manual-appraisal-title" onClose={onClose} busy={busy} dirty={Object.keys(changed).length>0||Boolean(reason)}>{close => <>
    <div className="modal-head"><div><span className="badge">{localize("MANUAL OVERRIDE")}</span><h2 id="manual-appraisal-title">{isArabic ? "إدخال نتائج التقييم يدويًا" : "Enter monthly scores manually"}</h2><p>{month}/{year} · {isArabic ? "سيتم حفظ القيم المعدلة فقط في نسخة جديدة قابلة للمراجعة والاعتماد." : "Only changed values are saved in a new version for review and approval."}</p></div><ActionButton type="button" disabled={busy} onClick={close}>{isArabic ? "إغلاق" : localize("Close")}</ActionButton></div>
    <OperationalError error={error}/>
    <form onSubmit={submit}><fieldset disabled={busy} className="ui-dialog-fields">
      <div className="manual-appraisal-list">{(data.employees || []).map((employee) => { const appraisal = existing.get(employee.id); return <label className={changed[employee.id] ? "changed" : ""} key={employee.id}><span><b>{employee.name}</b><small>{employee.hrisNumber || employee.localEmployeeCode || employee.jobTitle || "—"} · {employee.active ? (isArabic ? "نشط" : localize("Active")) : employee.employmentStatus}</small></span><input aria-label={`${employee.name} manual score`} type="number" min={data.performanceSettings?.monthlyAppraisal.finalScoreMinimum} max={data.performanceSettings?.monthlyAppraisal.finalScoreMaximum} step="0.01" placeholder={isArabic ? "النتيجة" : localize("Score")} value={values[employee.id] ?? ""} onChange={(event) => { setValues((current) => ({ ...current, [employee.id]: event.target.value })); setChanged((current) => ({ ...current, [employee.id]: true })); }} /><em>{appraisal ? `${appraisal.entryMode === "MANUAL" ? (isArabic ? "يدوي" : "Manual") : (isArabic ? "محسوب" : "Calculated")} · v${appraisal.version}` : (isArabic ? "لا يوجد تقييم" : "No appraisal")}</em></label>; })}</div>
      <label className="manual-appraisal-reason">{isArabic ? "سبب الإدخال أو التعديل اليدوي" : "Reason for manual entry or correction"}<textarea aria-label={isArabic ? "سبب التعديل اليدوي" : "Manual override reason"} required minLength="5" placeholder={isArabic ? "مثال: نتيجة معتمدة من ملف التقييم الورقي قبل تشغيل السيستم" : "Example: approved paper appraisal from before the system launch"} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <div className="manual-appraisal-footer"><span>{isArabic ? `${changedRows.length} موظف سيتم حفظه. النتائج القديمة تظل محفوظة في السجل.` : `${changedRows.length} employee(s) will be saved. Previous scores remain in the audit history.`}</span><PermissionButton permission={"appraisals.edit"} type="submit" disabled={busy || !changedRows.length || reason.trim().length < 5}>{busy ? (isArabic ? "جارٍ الحفظ…" : "Saving…") : (isArabic ? "حفظ القيم اليدوية" : "Save manual scores")}</PermissionButton></div>
    </fieldset></form>
  </>}</SafeDialog>;
}

function AppraisalCalculationForm({ data, year, month, isArabic, busy, onSave }) {
  const localize = useUiText();
  const [employeeId, setEmployeeId] = useState("");
  const [reason, setReason] = useState("");
  return <details className="panel"><summary>{isArabic ? "حساب التقييم الشهري من السجلات" : "Calculate monthly appraisal from records"}</summary><form className="ops-form-actions" onSubmit={async event => { event.preventDefault(); if (await onSave({ action: "appraisalCalculate", year, month, employeeId, reason }, isArabic ? "تم حفظ الحساب في إصدار جديد" : "Calculation saved as a new version")) setReason(""); }}><label>{isArabic ? "الموظف" : localize("Employee")}<select aria-label={isArabic ? "Employee to calculate · الموظف" : "Employee to calculate"} required value={employeeId} onChange={event => setEmployeeId(event.target.value)}><option value="">—</option>{data.employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label><label>{isArabic ? "سبب الحساب أو إعادة الحساب" : "Calculation or recalculation reason"}<input required minLength={5} value={reason} onChange={event => setReason(event.target.value)} /></label><PermissionButton permission={"appraisals.create"} disabled={busy || !employeeId || reason.trim().length < 5}>{isArabic ? "حساب وحفظ مسودة" : "Calculate and save draft"}</PermissionButton></form></details>;
}

export default function PerformanceWorkspace({module="appraisal"}) {
  const localize = useUiText();
  const { isArabic } = useI18n();
  const searchParams = useSearchParams();
  const now = new Date();
  const requestedYear = Number(searchParams.get("year"));
  const requestedMonth = Number(searchParams.get("month"));
  const [year, setYear] = useState(Number.isInteger(requestedYear) && requestedYear >= 2020 && requestedYear <= 2100 ? requestedYear : now.getFullYear());
  const [month, setMonth] = useState(Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth : now.getMonth() + 1);
  const setPeriod=(key,value)=>{if(key==='year')setYear(value);if(key==='month')setMonth(value);const url=new URL(location.href);url.searchParams.set(key,value);if(Number.isInteger(Number(url.searchParams.get('year')||year))&&Number(url.searchParams.get('year')||year)>=2020&&Number(url.searchParams.get('year')||year)<=2100)window.history.pushState({},'',url.pathname+url.search);};
  useEffect(()=>{const nextYear=Number(searchParams.get('year')),nextMonth=Number(searchParams.get('month'));if(nextYear>=2020&&nextYear<=2100)setYear(nextYear);if(nextMonth>=1&&nextMonth<=12)setMonth(nextMonth);},[searchParams]);
  const branch=searchParams.get('branch')||'';
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const section=module;
  const [artworkOpen, setArtworkOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [variant, setVariant] = useState("");
  const loadVersion = useRef(0);
  const activeVariant = variant || data?.artworkConfig?.monthly?.template || "T01";
  async function load() { const version=++loadVersion.current; try { const response=await fetch(`/api/operations/performance?year=${year}&month=${month}&section=${section}&branch=${encodeURIComponent(branch)}`); const payload=await readApiResponse(response,"Performance data could not be loaded"); if(version===loadVersion.current){setData(payload);setError("");} } catch(error){if(version===loadVersion.current)setError(error.message);} }
  useEffect(() => { load(); return()=>{loadVersion.current++;}; }, [year,month,searchParams]);
  useEffect(()=>{const refresh=()=>{if(!document.hidden)load();};window.addEventListener('focus',refresh);const timer=setInterval(refresh,60000);return()=>{window.removeEventListener('focus',refresh);clearInterval(timer);};},[year,month,branch]);

  async function action(body, successMessage = "") { setBusy(true); setError(""); setNotice(""); try { const response = await fetch("/api/operations/performance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({...body,branch:data?.branch?.branchCode||branch}) }); await readApiResponse(response, "Performance action could not be saved"); await load(); if (successMessage) setNotice(successMessage); return true; } catch (requestError) { setError(requestError.message); return false; } finally { setBusy(false); } }
  const competition = data?.competitions[0];
  const pendingAppraisals = data?.appraisals.filter((item) => ["DRAFT", "REVIEWED", "REOPENED"].includes(item.status)) || [];
  const approvedAppraisals = data?.appraisals.filter((item) => item.status === "APPROVED") || [];
  const pendingCount=section==="appraisal"?data?.monthlyResults?.filter(row=>!row.eligible).length||0:section==="eotm"?data?.appraisalSummary?.pending||0:pendingAppraisals.length,approvedCount=section==="eotm"?data?.appraisalSummary?.approved||0:approvedAppraisals.length;
  const templateWinner = competition?.winner ? { ...competition, employee: competition.winner, branch: data?.branch?.branchCode || "MOT" } : null;
  const currentScores = data?.appraisals.filter((item) => item.status === "APPROVED").map((item) => item.totalScore) || [];
  const previousScores = data?.previousAppraisals?.map((item) => item.totalScore) || [];
  const average = (scores) => scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
  const currentAverage = average(currentScores);
  const previousAverage = average(previousScores);
  async function printArtwork() { setArtworkOpen(true); try { await printRecognitionArtwork("monthly"); } catch(error) { setError(error.message); } }
  return <section className={`performance-workspace ${styles.workspace}`}>
    <PageHeader description={isArabic?"راجع نتائج الشهر والقرارات الموثقة.":"Review monthly results and documented decisions."} context={section==="appraisal"?<span>{isArabic?"تقييمات تحتاج إجراء":"Needs action"}: {pendingCount} · {isArabic?"معتمدة":localize("Approved")}: {approvedCount}</span>:undefined} actions={section==="appraisal"?<PermissionButton permission="appraisals.edit" type="button" disabled={busy || !data} onClick={() => setManualOpen(true)}>{isArabic ? "إدخال / تعديل يدوي" : "Manual scores"}</PermissionButton>:undefined}/>
    <>
    <OperationalError error={error}/>
    {notice && <div className="alert success">{notice}</div>}
    <FilterBar className="performance-controls"><label>{isArabic?"الفرع":"Branch"}<select aria-label={isArabic?"الفرع":"Branch"} value={data?.branch?.branchCode||branch} onChange={e=>{const url=new URL(location.href);url.searchParams.set("branch",e.target.value);url.searchParams.set("year",year);url.searchParams.set("month",month);location.assign(url.pathname+url.search);}}>{(data?.branches||[]).map(code=><option key={code}>{code}</option>)}</select></label><label>{isArabic?"السنة":localize("Year")}<input aria-label={isArabic ? "السنة" : localize("Year")} type="number" value={year} onChange={(event) => setPeriod("year",Number(event.target.value))} /></label><label>{isArabic?"الشهر":localize("Month")}<select aria-label={isArabic ? "الشهر" : localize("Month")} value={month} onChange={(event) => setPeriod("month",Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option value={index + 1} key={index + 1}>{new Date(year,index,1).toLocaleString(isArabic?"ar-EG":"en-GB",{month:"long"})}</option>)}</select></label></FilterBar>
    {["appraisal","eotm"].includes(section)&&<>{section==="eotm"&&<section className="operations-status-strip" aria-label={isArabic ? "ملخص قرارات الأداء" : "Performance decision summary"}>
      <article><span>{isArabic ? "تقييمات تحتاج إجراء" : "Needs action"}</span><b>{pendingCount}</b></article>
      {section==="eotm"&&<article><span>{isArabic ? "حالة موظف الشهر" : "EOTM status"}</span><b>{competition?.status || (isArabic ? "لم تبدأ" : "Not started")}</b></article>}
    </section>}
    {section==="appraisal"&&<PermissionSection as="section" permission="appraisals.view" id="performance-reports" className="panel performance-trend"><div><span>{isArabic ? "اتجاه الأداء المعتمد" : "APPROVED PERFORMANCE TREND"}</span><h3>{isArabic ? "مقارنة بالشهر السابق" : "Compared with the previous month"}</h3><p>{currentAverage == null ? (isArabic ? "لا توجد تقييمات معتمدة في الفترة المحددة" : "No approved appraisals in this period") : (isArabic ? `متوسط الفترة الحالية: ${currentAverage}` : `Current approved average: ${currentAverage}`)}</p></div>{currentAverage != null && <div className={`performance-trend-value ${(previousAverage == null || currentAverage >= previousAverage) ? "up" : "down"}`}><b>{previousAverage == null ? "—" : `${currentAverage - previousAverage >= 0 ? "+" : ""}${currentAverage - previousAverage}`}</b><small>{previousAverage == null ? (isArabic ? "لا توجد فترة سابقة معتمدة" : "No prior approved period") : `${data.previousPeriod.month}/${data.previousPeriod.year} · ${previousAverage}`}</small></div>}</PermissionSection>}
    <section className={styles.layout}>
      {section==="appraisal"&&<PermissionSection as="article" permission="appraisals.view" className="panel"><div className="operations-profile-head"><div><h2>{isArabic?"نتائج الموظفين المسجلة":"Recorded employee results"}</h2><span>{isArabic ? "الاعتماد يثبت القيم التاريخية كما هي دون إعادة حساب" : "Approval preserves historical values without recalculation"}</span></div><div className="manual-appraisal-trigger"><em>{data?.monthlyResults?.length || 0}</em></div></div>
        {pendingAppraisals.length > 0 && <div className="performance-appraisal-actions"><div><b>{isArabic ? `${pendingAppraisals.length} تقييم بانتظار الاعتماد` : `${pendingAppraisals.length} appraisals await approval`}</b><span>{isArabic ? "راجع النتائج ثم اعتمدها لتفعيل اختيار موظف الشهر." : "Review the scores, then approve them to enable Employee of the Month selection."}</span></div><PermissionButton permission={"appraisals.approve"} type="button" disabled={busy} onClick={() => { if (window.confirm(isArabic ? `اعتماد ${pendingAppraisals.length} تقييم لشهر ${month}/${year} بالقيم الحالية؟` : `Approve ${pendingAppraisals.length} appraisals for ${month}/${year} with their current values?`)) action({ action: "appraisalApproveAll", year, month }, isArabic ? "تم اعتماد تقييمات الشهر ويمكن الآن حساب المرشحين" : "Monthly appraisals approved; candidates can now be calculated"); }}>{isArabic ? "اعتماد كل تقييمات الشهر" : "Approve all monthly appraisals"}</PermissionButton></div>}
        <div className="record-table-scroll"><table className="record-line-table performance-table ui-comparison-table" data-monthly-results><thead><tr>{(isArabic?['الموظف','أيام مكتملة','متوسط اليومي','النتيجة الشهرية','المصدر','الحالة وأسباب المنع','الإجراء']:['Employee','Completed days','Daily aggregate','Monthly result','Source','Status and blocking reasons','Action']).map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{(data?.monthlyResults||[]).map(row=>{const stored=data.appraisals.find(item=>item.employeeId===row.employee.id);return <tr key={row.employee.id} data-employee-id={row.employee.id}><td>{row.employee.name}</td><td><bdi dir="ltr">{row.completedDays} / {row.expectedDays}</bdi></td><td>{row.dailyAggregate??'—'}</td><td>{stored?stored.totalScore:row.finalResult??'—'}</td><td>{row.manual?(isArabic?'إدخال يدوي محفوظ':'Preserved manual entry'):(isArabic?'التقييمات اليومية المراجعة':'Reviewed daily evaluations')}{stored&&<small>v{stored.version}</small>}</td><td><OperationalStatus value={row.appraisalStatus||row.state}/>{row.exclusionReasons.map(code=><small key={code} className="block">{exclusionText(code,row,isArabic)}</small>)}</td><td>{stored&&['DRAFT','REVIEWED','REOPENED'].includes(stored.status)?<PermissionButton permission="appraisals.approve" type="button" disabled={busy||row.sourceChanged} onClick={()=>action({action:'appraisalApprove',appraisalId:stored.id})}>{isArabic?'اعتماد':'Approve'}</PermissionButton>:!row.frozen&&row.completedDays>0&&row.finalResult!=null?<PermissionButton permission="appraisals.create" type="button" disabled={busy} onClick={()=>action({action:'appraisalCalculate',employeeId:row.employee.id,year,month,reason:'Manager requested calculation from reviewed daily sources'})}>{isArabic?'حساب مسودة':'Calculate draft'}</PermissionButton>:null}</td></tr>;})}</tbody></table></div>
        {data&&!data.monthlyResults?.length&&<div className="daily-empty">{isArabic?'لا توجد تقييمات يومية أو شهرية في الفترة والفرع المحددين.':'No daily or monthly evaluations exist in this period and branch.'}</div>}
        {!!data?.dailySummaries?.length&&<details open className="panel"><summary>{isArabic?'ملخصات الشهر من التقييمات اليومية':'Monthly summaries from daily evaluations'} ({data.dailySummaries.length})</summary><div className="record-table-scroll"><table><thead><tr>{[isArabic?'الموظف':'Employee',isArabic?'الأيام المكتملة / المتوقعة':'Completed / expected days',isArabic?'الأيام الناقصة':'Missing days',isArabic?'متوسط اليومي':'Daily average',isArabic?'حالة الحساب':'Calculation state'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{data.dailySummaries.map(row=><tr key={row.employee.id}><td>{row.employee.name}</td><td><bdi dir="ltr">{row.completedDays} / {row.expectedDays}</bdi></td><td>{row.missingDates.length}</td><td>{row.dailyAggregate??'—'}</td><td><OperationalStatus value={row.state}/>{row.missingComponents.length?`: ${row.missingComponents.map(code=>componentLabel(code,isArabic)).join(' · ')}`:''}</td></tr>)}</tbody></table></div><Link href={`/operations/employee-of-the-month?year=${year}&month=${month}`}>{isArabic?'فتح تفاصيل الحساب والأهلية':'Open calculation breakdowns and eligibility'}</Link></details>}
      </PermissionSection>}
      {section==="eotm"&&<PermissionSection as="article" permission="eom.view" id="eotm" className="panel"><div className="operations-profile-head"><div><h2>{isArabic ? "موظف الشهر" : localize("Employee of the Month")}</h2><span>{competition ? `${competition.status} · v${competition.version}` : (isArabic ? "لم تبدأ المسابقة" : "Competition not started")}</span></div>{competition?.winner && <em>{competition.winner.name}</em>}</div>
        {!competition ? <div className="eotm-start-panel"><p>{pendingCount ? (isArabic ? "اعتمد تقييمات الشهر أولًا، وبعدها سيظهر جميع الموظفين المؤهلين للاختيار." : "Approve the month's appraisals first; all eligible employees will then be available for selection.") : approvedCount ? (isArabic ? `${approvedCount} تقييم معتمد وجاهز لحساب المرشحين.` : `${approvedCount} approved appraisals are ready for candidate calculation.`) : (isArabic ? "لا توجد تقييمات في هذا الشهر لبدء المسابقة." : "There are no appraisals in this month to start the competition.")}</p><PermissionButton permission={"eom.create"} disabled={busy || pendingCount > 0 || approvedCount === 0} onClick={() => action({ action: "eotmCreate", year, month }, isArabic ? "تم حساب المرشحين؛ اختر موظف الشهر" : "Candidates calculated; select Employee of the Month")}>{isArabic ? "حساب المرشحين" : "Calculate candidates"}</PermissionButton></div> : <>
          <div className="daily-team-list">{competition.candidates.map((candidate) => <div className="row" key={candidate.id}><b>#{candidate.rank} {candidate.employee.name}</b><span>{candidate.finalScore}</span>{competition.status !== "LOCKED" && <PermissionButton permission={"eom.edit"} disabled={busy} onClick={() => action({ action: "eotmWinner", competitionId: competition.id, employeeId: candidate.employeeId }, isArabic ? `تم اختيار ${candidate.employee.name}؛ اقفل النتيجة بعد المراجعة` : `${candidate.employee.name} selected; lock the result after review`)}>{competition.winnerEmployeeId === candidate.employeeId ? (isArabic ? "المختار" : "Selected") : (isArabic ? "اختيار" : "Select")}</PermissionButton>}</div>)}</div>
          {competition.status === "WINNER_APPROVED" && <PermissionButton permission={"eom.lock"} disabled={busy} onClick={() => action({ action: "eotmLock", competitionId: competition.id }, isArabic ? "تم اعتماد وقفل موظف الشهر" : "Employee of the Month was approved and locked")}>{isArabic ? "اعتماد وقفل النتيجة" : "Approve and lock result"}</PermissionButton>}
          {competition.status === "LOCKED" && <div className="recognition-actions"><Link className={styles.photoLink} href={`/opmanager/settings?category=recognition&employeeId=${competition.winnerEmployeeId}#employee-photo-framing`}>{isArabic ? "ضبط صورة الموظف" : "Adjust employee photo"}</Link><ActionButton onClick={() => setArtworkOpen(true)}>{isArabic ? "تمبلت جائزة موظف الشهر" : "Employee of the Month template"}</ActionButton><PermissionButton permission={["eom.print","eom.pdf"]} className="secondary" onClick={printArtwork}>{isArabic ? "طباعة / حفظ PDF" : "Print / Save PDF"}</PermissionButton><PermissionButton permission={"eom.unlock"} className="danger" onClick={() => { const reason = window.prompt(isArabic ? "سبب إعادة الفتح" : "Reopen reason"); if (reason) action({ action: "eotmReopen", competitionId: competition.id, reason }); }}>{isArabic ? "إعادة فتح مصرح" : "Authorized reopen"}</PermissionButton></div>}
        </>}
      </PermissionSection>}
    </section></>}
    {section==="appraisal" && data && <PermissionSection permission="appraisals.view"><AppraisalCalculationForm data={data} year={year} month={month} isArabic={isArabic} busy={busy} onSave={action} /></PermissionSection>}
    </>
    {artworkOpen && templateWinner && <div className="modal-backdrop recognition-preview-backdrop" role="presentation" onMouseDown={() => setArtworkOpen(false)}><section className="recognition-preview" role="dialog" aria-modal="true" aria-label={isArabic ? "تمبلت موظف الشهر" : "Employee of the Month template"} onMouseDown={(event) => event.stopPropagation()}><div className="recognition-preview-actions"><div className="recognition-template-picker" aria-label={isArabic ? "اختيار القالب" : "Choose template"}>{["T01", "T02", "T03", "T04", "T05"].map((item) => <ActionButton className={activeVariant === item ? "active" : "secondary"} key={item} onClick={() => setVariant(item)}>{item}</ActionButton>)}</div><PermissionButton permission={["eom.print","eom.pdf"]} className="secondary" onClick={printArtwork}>{isArabic ? "طباعة / حفظ PDF" : "Print / Save PDF"}</PermissionButton><ActionButton onClick={() => setArtworkOpen(false)}>{isArabic ? "إغلاق" : localize("Close")}</ActionButton></div><div className="recognition-preview-canvas" role="region" tabIndex={0} aria-label={isArabic ? "معاينة تصميم قابلة للتمرير" : "Scrollable artwork preview"}><MonthlyWinnerArtwork winner={templateWinner} variant={activeVariant} config={data?.artworkConfig} /></div></section></div>}
    {manualOpen && data && <ManualAppraisalModal error={error} data={data} year={year} month={month} isArabic={isArabic} busy={busy} onClose={() => setManualOpen(false)} onSave={action} />}
  </section>;
}

