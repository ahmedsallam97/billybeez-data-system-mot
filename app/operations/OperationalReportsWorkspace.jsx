"use client";
import { OperationalError, OperationalStatus } from "../ui/OperationalFeedback";
import { useUiText } from '@/app/i18n';
import {PageHeader,EmptyState} from '../ui/DesktopLayout';
import ActionButton from "@/app/ActionButton";
import {usePermission,useAccount} from '@/app/account/AccountContext';
import {PermissionButton} from '@/app/account/PermissionControls';
import {reportPermission} from '@/lib/accounts/registry';

import { reportLabel as workspaceLabel, reportError } from "@/lib/operations/report-copy";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./OperationalReportsWorkspace.module.css";
import ReportEvidenceUpload from "./ReportEvidenceUpload";
import ReportExceptionFields from "./ReportExceptionFields";

const today = () => new Date().toISOString().slice(0, 10);

async function readResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw Object.assign(new Error(payload.error || "The request could not be completed"), { code: payload.code });
  return payload;
}

function evidenceInput(items) {
  return (items || []).map((item) => item.reference).join("\n");
}

function evidenceFromText(value) {
  return String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean).map((reference) => ({ reference }));
}

function emptyDraft() {
  return { everythingPlanned: false, summary: "", steps: [], survey: null, unresolvedIssues: [], participants: [], adjustments: [], attachments: [] };
}

export default function OperationalReportsWorkspace({ language = "en",year,month, reportType, initialDate, initialReportId, initialBranch }) {
  const localize = useUiText();
  const ar = language === "ar";
  const {user}=useAccount();
  const canEditReport=usePermission('reports.edit');
  const start=year&&month?`${year}-${String(month).padStart(2,"0")}-01`:null;
  const end=start?new Date(Date.UTC(year,month,0)).toISOString().slice(0,10):null;
  const [date, setDate] = useState(initialDate || (start&&(today()<start||today()>end)?start:today()));
  const [search,setSearch]=useState(""),[statusFilter,setStatusFilter]=useState("ALL");
  const loadVersion=useRef(0);
  const [branch, setBranch] = useState(initialBranch || (!user?.profile?.allBranches?user?.profile?.branches?.[0]:'') || '');
  const [context, setContext] = useState(null);
  const [reports, setReports] = useState([]);
  const [selectedId, setSelectedId] = useState(initialReportId || "");
  const [eventContext, setEventContext] = useState(null);
  const [saveState, setSaveState] = useState("");
  const [draft, setDraft] = useState(emptyDraft());
  const requestPending = useRef(false), failedDraft = useRef(""), draftRef = useRef(draft);
  const [createType, setCreateType] = useState(reportType || "TRIP");
  const [sourceId, setSourceId] = useState("");
  const [shiftCode, setShiftCode] = useState("AM");
  const [preparation, setPreparation] = useState(null), [preparationLoading, setPreparationLoading] = useState(false), [preparationError, setPreparationError] = useState(""), [prepareRetry, setPrepareRetry] = useState(0);
  const [templateCode, setTemplateCode] = useState(""), [surveyTemplateCode, setSurveyTemplateCode] = useState("");
  const canCreateModule = usePermission(reportPermission(createType, 'create'));
  const canCreate = usePermission('reports.create') && canCreateModule;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const selected = reports.find((item) => item.id === selectedId) || null;
  const canEditModule=usePermission(reportPermission(selected?.reportType,'edit'));
  const canEdit=canEditReport&&canEditModule;
  const editable = selected && !selected.locked && ["DRAFT", "REOPENED"].includes(selected.status);
  const employeeOptions = eventContext?.employees || context?.team || [];
  draftRef.current = draft;
  const sourceOptions = useMemo(() => {
    if (!context) return [];
    if (createType === "TRIP") return (context.trips || []).map((item) => ({ id: item.id, label: `${item.startTime || "—"} · ${item.name}` }));
    if (createType === "BIRTHDAY") return (context.events || []).filter((item) => item.eventType === "BIRTHDAY").map((item) => ({ id: item.id, label: `${item.startTime || "—"} · ${item.childName || item.name}` }));
    return context.day ? [{ id: context.day.id, label: `${context.date} · ${context.branch}` }] : context.schedule ? [{id:`SCHEDULE:${context.schedule.id}:${context.date}`,label:`${context.date} · ${context.branch}`}]:[];
  }, [branch, context, createType]);

  const load = useCallback(async ({refreshDraft=false}={}) => {
    setError("");setContext(null);const version=++loadVersion.current;
    try {
      if(selectedId){
        const linked=await fetch(`/api/operations/reports?id=${encodeURIComponent(selectedId)}`).then(readResponse);
        if(version!==loadVersion.current)return;
        const record=linked.reports?.[0];
        if(record&&(record.branch!==branch||record.workDate!==date)){setBranch(record.branch);setDate(record.workDate);return;}
      }
      const [daily, reportData] = await Promise.all([
        fetch(`/api/operations/daily?view=reports&date=${encodeURIComponent(date)}&branch=${encodeURIComponent(branch)}`).then(readResponse),
        fetch(`/api/operations/reports?branch=${encodeURIComponent(branch)}${reportType ? `&reportType=${reportType}` : ""}`).then(readResponse),
      ]);
      if(version!==loadVersion.current)return;
      setContext(daily);
      if(!branch&&daily.branch)setBranch(daily.branch);
      if(refreshDraft){const report=(reportData.reports||[]).find(row=>row.id===selectedId);if(report)setDraft(structuredClone(report.draft));else setSelectedId("");}
      setReports((reportData.reports||[]).filter(row=>!start||(row.workDate>=start&&row.workDate<=end)));
      setSourceId((current) => current || (createType === "SHIFT_LEADERSHIP" ? daily.day?.id || (daily.schedule?`SCHEDULE:${daily.schedule.id}:${daily.date}`:null) : createType === "TRIP" ? daily.trips?.[0]?.id : daily.events?.find((item) => item.eventType === "BIRTHDAY")?.id) || "");
    } catch (loadError) {
      if(version===loadVersion.current)setError(reportError(loadError, ar));
    }
  }, [branch, createType, date,start,end,selectedId,reportType]);

  useEffect(() => { load();return()=>{loadVersion.current++;}; }, [load]);
  useEffect(() => {
    setEventContext(null); failedDraft.current = ""; setSaveState("");
    if (selected) setDraft(structuredClone(selected.draft || emptyDraft()));
  }, [selectedId, selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    fetch(`/api/operations/reports?id=${encodeURIComponent(selectedId)}`, { signal: controller.signal }).then(readResponse).then(payload => setEventContext(payload.context || null)).catch(error => { if (error.name !== "AbortError") setError(reportError(error, ar)); });
    return () => controller.abort();
  }, [selectedId, selected?.id]);
  useEffect(() => { setSourceId(sourceOptions[0]?.id || ""); }, [createType, sourceOptions]);
  useEffect(() => {
    const controller = new AbortController();
    setPreparation(null); setPreparationError(""); setTemplateCode(""); setSurveyTemplateCode("");
    if (!sourceId || !canCreate) { setPreparationLoading(false); return; }
    setPreparationLoading(true);
    const params = new URLSearchParams({ prepare: '1', reportType: createType, sourceId, branch });
    if (createType === 'SHIFT_LEADERSHIP') params.set('shiftCode', shiftCode);
    fetch(`/api/operations/reports?${params}`, { signal: controller.signal }).then(readResponse).then(payload => {
      if (controller.signal.aborted) return;
      setPreparation(payload);
      const process = payload.templates?.process || [], survey = payload.templates?.survey || [];
      setTemplateCode(process.length === 1 ? process[0].code : "");
      setSurveyTemplateCode(survey.length === 1 ? survey[0].code : "");
    }).catch(failure => { if (!controller.signal.aborted) setPreparationError(reportError(failure, ar)); })
      .finally(() => { if (!controller.signal.aborted) setPreparationLoading(false); });
    return () => controller.abort();
  }, [sourceId, createType, shiftCode, branch, date, canCreate, ar, prepareRetry]);

  async function post(body, { autosave = false } = {}) {
    if (requestPending.current) return null;
    requestPending.current = true;
    const sentDraft = autosave ? JSON.stringify(body.draft) : null;
    setBusy(true); setError(""); setMessage("");
    if (autosave) setSaveState("saving");
    try {
      const payload = await fetch("/api/operations/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(readResponse);
      if (payload.report) {
        setReports((current) => [payload.report, ...current.filter((item) => item.id !== payload.report.id)]);
        setSelectedId(payload.report.id);
        const destination=new URL(window.location.href);destination.searchParams.set('date',payload.report.workDate);destination.searchParams.set('branch',payload.report.branch);destination.searchParams.set('reportId',payload.report.id);window.history.replaceState(null,'',destination.pathname+destination.search+destination.hash);
        setDraft(current => !autosave || JSON.stringify(current) === sentDraft ? structuredClone(payload.report.draft || emptyDraft()) : current);
        if (payload.context) setEventContext(payload.context);
      }
      failedDraft.current = "";
      if (autosave) setSaveState("saved");
      else setMessage(ar ? "تم حفظ سير عمل التقرير." : "Report workflow saved.");
      return payload;
    } catch (actionError) {
      setError(reportError(actionError, ar));
      if (autosave) { failedDraft.current = sentDraft; setSaveState("failed"); }
      return null;
    } finally { requestPending.current = false; setBusy(false); }
  }

  const dirty=Boolean(selected&&JSON.stringify(draft)!==JSON.stringify(selected.draft));
  useEffect(() => {
    const fingerprint = JSON.stringify(draft);
    if (!editable || !canEdit || !dirty || busy || failedDraft.current === fingerprint || (draft.unresolvedIssues || []).some(issue => !issue.description?.trim())) return;
    const timer = setTimeout(() => post({ action: "saveDraft", id: selected.id, expectedRevision: selected.revision, draft: draftRef.current, reason: ar ? "حفظ تلقائي لمسودة التقرير" : "Autosave operational report draft" }, { autosave: true }), 1800);
    return () => clearTimeout(timer);
  }, [draft, editable, canEdit, dirty, busy, selected?.revision]); // eslint-disable-line react-hooks/exhaustive-deps
  function discardAllowed(){return !dirty||window.confirm(ar?"هناك تغييرات غير محفوظة. تجاهلها والمتابعة؟":"Discard unsaved report changes and continue?");}
  function chooseReport(report){if(busy||report.id===selectedId||!discardAllowed())return;setSelectedId(report.id);setDate(report.workDate);setBranch(report.branch);window.history.replaceState(null,"",`${window.location.pathname}?date=${report.workDate}&branch=${encodeURIComponent(report.branch)}&reportId=${encodeURIComponent(report.id)}${year&&month?`&year=${year}&month=${month}`:""}`);}
  useEffect(()=>{const handler=event=>{if(dirty){event.preventDefault();event.returnValue="";}};window.addEventListener("beforeunload",handler);return()=>window.removeEventListener("beforeunload",handler);},[dirty]);
  const visibleReports=reports.filter(row=>(statusFilter==="ALL"||row.status===statusFilter)&&`${row.source?.snapshot?.name||row.source?.snapshot?.childName||""} ${workspaceLabel(row.reportType,ar)} ${row.workDate}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  function createReport() {
    if (!sourceId) { setError(ar ? "اختر حجزاً أو يوم تشغيل أولاً." : "Select a booking or operations day first."); return; }
    if (!preparation || preparationLoading || !templateCode || preparation.templates.survey.length > 1 && !surveyTemplateCode) { setError(ar ? "انتظر تحميل القوالب المتاحة واختر قالب العملية والاستبيان عند وجود أكثر من قالب." : "Wait for the available templates, then choose the process and survey when multiple templates are offered."); return; }
    post({ action: "create", reportType: createType, sourceId, branch, workDate: date, shiftCode: createType === "SHIFT_LEADERSHIP" ? shiftCode : undefined, templateCode, surveyTemplateCode: surveyTemplateCode || undefined, reason: ar ? "إنشاء مسودة تقرير التشغيل" : "Create operational report draft",  });
  }

  function action(name, reason) {
    if (!selected) return;
    if (["approve", "submit", "review"].includes(name) && dirty) { setError(ar ? "احفظ تغييرات المسودة قبل إرسالها أو اعتمادها." : "Save draft changes before submission or approval."); return; }
    post({ action: name, id: selected.id, expectedRevision: selected.revision, draft: name === "saveDraft" ? draft : undefined, reason });
  }

  function updateStep(code, patch) {
    setDraft((current) => ({ ...current, steps: (current.steps || []).map((item) => item.code === code ? { ...item, ...patch } : item) }));
  }

  function toggleParticipant(employeeId) {
    if (selected?.reportType === "BIRTHDAY" && !draft.participants.some(row => row.employeeId === employeeId) && draft.participants.length >= Math.min(2, selected.configSnapshot.effective.value.staffing.maximumResponsibleBirthdayHosts)) { setError(ar ? "اختر موظفًا أو اثنين فقط لعيد الميلاد." : "Choose only one or two birthday employees."); return; }
    setDraft((current) => {
      const exists = current.participants.some((item) => item.employeeId === employeeId);
      const row = employeeOptions.find(row => row.employeeId === employeeId);
      return { ...current, adjustments: exists ? current.adjustments.filter(item => item.employeeId !== employeeId) : current.adjustments, participants: exists ? current.participants.filter((item) => item.employeeId !== employeeId) : [...current.participants, { employeeId, role: selected?.reportType === "BIRTHDAY" ? "BIRTHDAY_HOST" : "STAFF", primaryLeader: false, responsibleHost: selected?.reportType === "BIRTHDAY", isTeamLeader: false, shiftCode: row?.shiftCode || null, startTime: selected?.source?.snapshot?.startTime || row?.startTime || null, endTime: selected?.source?.snapshot?.endTime || row?.endTime || null }] };
    });
  }

  function updateParticipant(employeeId, patch) {
    setDraft((current) => ({ ...current, participants: current.participants.map((item) => item.employeeId === employeeId ? { ...item, ...patch } : item) }));
  }

  function updateAdjustment(employeeId, patch) {
    setDraft((current) => {
      const existing = current.adjustments.find((item) => item.employeeId === employeeId);
      if (patch.levelCode === "") { return { ...current, adjustments: current.adjustments.filter(item => item.employeeId !== employeeId) }; }
      const adjustments = existing ? current.adjustments.map((item) => item.employeeId === employeeId ? { ...item, ...patch } : item) : [...current.adjustments, { employeeId, levelCode: patch.levelCode || selected.configSnapshot.effective.value.rewards.performanceLevels.find(level => level.active)?.code, lateMinutes: 0, absent: false, isTeamLeader: false, evidence: [], comment: "", ...patch }];
      return { ...current, adjustments };
    });
  }

  const copy = {
    title: reportType ? workspaceLabel(reportType, ar) + (ar ? " · التقارير" : " reports") : ar ? "تقارير التشغيل الموثقة" : "Versioned operational reports",
    subtitle: ar ? "اربط التقرير بالحجز الحقيقي، وأكمل الخطوات والأدلة والاستبيان قبل الاعتماد." : "Link each report to a real booking, then complete steps, evidence, and survey data before approval.",
  };

  return <section className={styles.workspace} dir={ar ? "rtl" : "ltr"}>
    <PageHeader title={copy.title} description={copy.subtitle} actions={<ActionButton type="button" className="secondary" onClick={()=>{if(discardAllowed()){load({refreshDraft:true});}}} disabled={busy}>{ar ? "تحديث" : localize("Refresh")}</ActionButton>}/>
    <OperationalError error={error || preparationError}/>{message && <p role="status" className={styles.success}>{message}</p>}

    <div className={styles.summary} aria-label={ar?"ملخص تقارير الشهر":"Monthly report summary"}>{[[reports.length,ar?"تقارير الشهر":"Reports this month"],[reports.filter(row=>["DRAFT","REOPENED"].includes(row.status)).length,ar?"بانتظار الإكمال":"Awaiting completion"],[reports.filter(row=>row.status==="APPROVED").length,ar?"معتمدة":"Approved"]].map(([count,label])=><article key={label}><b>{count}</b><span>{label}</span></article>)}</div><section><h3>{ar?"إنشاء تقرير مرتبط بحجز":"Create a report from a booking"}</h3><p>{start?`${start} — ${end}`:""}</p><div className={styles.toolbar}>
      <label>{ar ? "التاريخ" : localize("Date")}<input aria-label={ar?"تاريخ التقرير":"Report date"} type="date" min={start||undefined} max={end||undefined} value={date} onChange={(event) => {if(discardAllowed()){setSelectedId("");setDate(event.target.value);}}} /></label>
      <label>{ar ? "الفرع" : "Branch"}<input value={branch} onChange={(event) => {if(discardAllowed()){setSelectedId("");setBranch(event.target.value.toUpperCase());}}} /></label>
      {!reportType && <label>{ar ? "نوع التقرير" : "Report type"}<select aria-label={ar ? "نوع التقرير" : "Report type"} value={createType} onChange={(event) => setCreateType(event.target.value)}>{["TRIP","BIRTHDAY","SHIFT_LEADERSHIP"].map(code=><option value={code} key={code}>{workspaceLabel(code,ar)}</option>)}</select></label>}
      <label>{ar ? "المصدر" : "Booking / source"}<select aria-label={ar ? "المصدر" : "Booking / source"} value={sourceId} onChange={(event) => setSourceId(event.target.value)}><option value="">{ar ? "اختر" : "Select"}</option>{sourceOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      {createType === "SHIFT_LEADERSHIP" && <label>{ar ? "الوردية" : "Shift"}<select aria-label={ar ? "الوردية" : "Shift"} value={shiftCode} onChange={(event) => setShiftCode(event.target.value)}>{Object.keys(context?.shifts || {}).map((code) => <option key={code}>{code}</option>)}</select></label>}
      {preparation?.templates?.process?.length > 1 && <label>{ar ? "قالب العملية" : "Process template"}<select aria-label={ar ? "قالب العملية" : "Process template"} disabled={busy || preparationLoading} value={templateCode} onChange={event => setTemplateCode(event.target.value)}><option value="">{ar ? "اختر قالب العملية" : "Select a process template"}</option>{preparation.templates.process.map(item => <option key={item.code} value={item.code}>{(ar ? item.labelAr : item.label) || item.code} · v{item.version}</option>)}</select></label>}
      {preparation?.templates?.survey?.length > 1 && <label>{ar ? "قالب الاستبيان" : "Survey template"}<select aria-label={ar ? "قالب الاستبيان" : "Survey template"} disabled={busy || preparationLoading} value={surveyTemplateCode} onChange={event => setSurveyTemplateCode(event.target.value)}><option value="">{ar ? "اختر قالب الاستبيان" : "Select a survey template"}</option>{preparation.templates.survey.map(item => <option key={item.code} value={item.code}>{(ar ? item.labelAr : item.label) || item.code} · v{item.version}</option>)}</select></label>}
      <PermissionButton requireAll permission={["reports.create",reportPermission(createType,"create")]} type="button" onClick={createReport} disabled={busy || !sourceId || preparationLoading || !preparation || !templateCode || preparation?.templates?.survey?.length > 1 && !surveyTemplateCode}>{ar ? "إنشاء مسودة" : "Create draft"}</PermissionButton>
    </div>{preparationLoading && <p role="status" className={styles.hint}>{ar ? "جارٍ تحميل القوالب السارية لفرع الحجز وتاريخه…" : "Loading the active templates for this booking branch and date…"}</p>}{preparationError && canCreate && <ActionButton type="button" className="secondary" disabled={busy || preparationLoading} onClick={() => setPrepareRetry(value => value + 1)}>{ar ? "إعادة تحميل القوالب" : "Retry loading templates"}</ActionButton>}{!sourceOptions.length&&<p className={styles.hint}>{ar?"لا يوجد مصدر لهذا النوع في اليوم المختار. اختر يومًا آخر أو أضف الحجز من صفحته.":"No source for this type on the selected date. Choose another day or add the booking on its page."} <Link href={`/operations/${createType==="BIRTHDAY"?"birthdays":createType==="TRIP"?"trips":"daily"}?date=${date}`}>{ar?"فتح صفحة المصدر":"Open source page"}</Link></p>}</section>
    <div className={styles.toolbar}><label>{ar?"البحث في التقارير":"Search reports"}<input value={search} onChange={e=>setSearch(e.target.value)}/></label><label>{ar?"حالة التقرير":"Report status"}<select aria-label={ar?"Report status · حالة التقرير":"Report status"} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="ALL">{ar?"كل الحالات":"All statuses"}</option>{["DRAFT","REOPENED","SUBMITTED","REVIEWED","APPROVED","REJECTED","CANCELLED"].map(code=><option value={code} key={code}>{workspaceLabel(code,ar)}</option>)}</select></label></div>
    <div className={styles.layout}>
      <aside className={styles.list} aria-label={ar ? "قائمة التقارير" : "Report list"}>
        {visibleReports.map((report) => <ActionButton type="button" key={report.id} className={report.id === selectedId ? styles.active : ""} onClick={() => chooseReport(report)} aria-pressed={report.id===selectedId}><b>{workspaceLabel(report.reportType,ar)}</b><span>{report.workDate} · {workspaceLabel(report.status,ar)}{report.locked ? ` · ${ar ? "مقفل" : "Locked"}` : ""}</span><small>{report.source.snapshot?.name || report.source.snapshot?.childName || report.shiftCode || report.source.id}</small></ActionButton>)}
        {!visibleReports.length && <p className={styles.hint}>{ar ? "لا توجد تقارير مطابقة في الفترة المحددة. غيّر البحث أو أنشئ تقريرًا من حجز فعلي." : "No matching reports in this period. Change the search or create a report from a real booking."}</p>}
      </aside>

      <div className={styles.editor}>
        {!selected && <div className={styles.empty}>{ar ? "اختر تقريراً للعرض أو أنشئ مسودة جديدة." : "Select a report to inspect or create a new draft."}</div>}
        {selected && <>
          <header className={styles.reportHeader}><div><span>{workspaceLabel(selected.reportType,ar)}</span><h3>{selected.source.snapshot?.name || selected.source.snapshot?.childName || selected.source.id}</h3><small>{selected.branch} · {selected.workDate} · v{selected.revision}</small></div><strong>{workspaceLabel(selected.status,ar)}{selected.locked ? ` · ${ar ? "مقفل" : "Locked"}` : ""}</strong></header>
          <div className={styles.contextBar}><span>{ar ? "وقت الحجز / الشيفت" : "Booking / shift time"}: <b dir="ltr">{selected.source.snapshot.startTime || "—"} — {selected.source.snapshot.endTime || "—"}</b></span><span>{ar ? "نسخة الجدول" : "Roster revision"}: {eventContext?.schedule ? `${eventContext.schedule.version} / ${eventContext.schedule.revision}` : "—"}</span><span>{ar ? "المشاركون الفعليون" : "Actual participants"}: {draft.participants.length}</span></div>
          <p className={styles.help}>{selected.reportType === "BIRTHDAY" ? ar ? "أكد موظفًا أو اثنين مسؤولين من فريق موعد الحجز. بيانات الحضور معروضة من سجل الحضور ولا تحتاج إعادة إدخال." : "Confirm one or two responsible employees from the booking-time roster. Attendance comes from its original record." : ar ? "الفريق مقترح من الجدول المنشور؛ أكد الموظفين الذين شاركوا فعليًا وحدد قائد الفريق." : "The published roster suggests the team; confirm actual participants and the team leader."}</p>
          {editable && <p role="status" className={styles.autosave}>{saveState === "saving" ? ar ? "جارٍ حفظ المسودة تلقائيًا…" : "Autosaving draft…" : saveState === "failed" ? ar ? "تعذر الحفظ. مدخلاتك محفوظة هنا؛ أعد المحاولة بزر حفظ المسودة." : "Save failed. Your inputs remain here; retry with Save draft." : dirty ? ar ? "تغييرات قيد الحفظ…" : "Changes awaiting autosave…" : ar ? "المسودة محفوظة" : "Draft saved"}</p>}
          <label className={styles.full}>{ar ? "ملخص التقرير" : "Report summary"}<textarea aria-label={ar ? "ملخص التقرير" : "Report summary"} value={draft.summary || ""} disabled={!editable||!canEdit} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label>
          <label className={styles.check}><input type="checkbox" checked={Boolean(draft.everythingPlanned)} disabled={!editable || !canEdit || !selected.configSnapshot.effective.value.reports[selected.reportType].fastEverythingPlannedEnabled} onChange={(event) => setDraft({ ...draft, everythingPlanned: event.target.checked })} />{ar ? "كل شيء سار حسب الخطة" : "Everything went as planned"}</label>
          {selected.configSnapshot.leadershipRequirement && <p>{ar ? "جاهز قبل:" : "Ready by:"} <b dir="ltr">{selected.configSnapshot.leadershipRequirement.requiredReadyTime || "—"}</b> · {ar ? "موعد التقرير:" : "Report due:"} <b dir="ltr">{selected.configSnapshot.leadershipRequirement.dueTime || "—"}</b></p>}
          {selected.configSnapshot.deadline && <p>{ar ? "آخر موعد لإكمال التقرير:" : "Report completion deadline:"} <b dir="ltr">{selected.configSnapshot.deadline.localDateTime.replace("T", " ")}</b> · {selected.configSnapshot.deadline.timezone}</p>}

          <details className={styles.disclosure} open={Boolean(editable || draft.steps.some(step => !step.completed))}><summary>{ar ? "خطوات العملية والأدلة" : "Process steps and evidence"} · {draft.steps.filter(step => step.completed).length}/{draft.steps.length}</summary><section>{editable && canEdit && <ActionButton type="button" className="secondary" onClick={() => setDraft(current => ({ ...current, steps: current.steps.map(step => ({ ...step, completed: true })) }))}>{ar ? "كل الخطوات مكتملة" : "All completed"}</ActionButton>}{(selected.configSnapshot.processTemplate?.steps || []).filter(definition => definition.active && (definition.branches.includes("*") || definition.branches.includes(selected.branch))).map((definition) => {
            const step = draft.steps?.find((item) => item.code === definition.code) || { code: definition.code, evidence: [] };
            return <article className={styles.step} key={definition.code}><label className={styles.check}><input type="checkbox" checked={Boolean(step.completed)} disabled={!editable||!canEdit} onChange={(event) => updateStep(definition.code, { completed: event.target.checked })} />{ar ? definition.labelAr : definition.label}{definition.required ? " *" : ""}</label><label>{ar ? "المسؤول" : "Responsible employee"}<select aria-label={`${ar ? "المسؤول" : "Responsible employee"}: ${definition.code}`} value={step.responsibleEmployeeId || ""} disabled={!editable||!canEdit} onChange={(event) => updateStep(definition.code, { responsibleEmployeeId: event.target.value || null })}><option value="">—</option>{(context?.team || []).map((member) => <option key={member.employeeId} value={member.employeeId}>{member.employee?.name || member.name || member.employeeId}</option>)}</select></label><details className={styles.references}><summary>{ar ? "مراجع الأدلة المخزنة" : "Stored evidence references"}</summary><label>{ar ? "مرجع بكل سطر" : "One reference per line"}<textarea aria-label={`${ar ? "الأدلة" : "Evidence"}: ${definition.code}`} disabled={!editable||!canEdit} value={evidenceInput(step.evidence)} onChange={(event) => updateStep(definition.code, { evidence: evidenceFromText(event.target.value) })} /></label></details><ReportEvidenceUpload reportType={selected.reportType} reportId={selected.id} ar={ar} disabled={!editable||!canEdit} value={step.evidence || []} onChange={evidence => updateStep(definition.code, {evidence})} /></article>;
          })}</section></details>

          <details className={styles.disclosure} open><summary>{ar ? "الفريق الفعلي والأداء" : "Actual team and performance"} · {draft.participants.length}</summary><section><div className={styles.people}>{employeeOptions.map((member) => {
            const employeeId = member.employeeId;
            const participant = draft.participants?.find((item) => item.employeeId === employeeId);
            const adjustment = draft.adjustments?.find((item) => item.employeeId === employeeId);
            const name = ar ? member.employee?.nameAr || member.employee?.name || member.name || employeeId : member.employee?.nameEn || member.employee?.name || member.name || employeeId;
            return <article key={employeeId}><label className={styles.check}><input type="checkbox" checked={Boolean(participant)} disabled={!editable||!canEdit} onChange={() => toggleParticipant(employeeId)} />{name}</label><p className={styles.help}>{member.shiftCode || selected.shiftCode || "—"} · {ar ? "الحضور" : "Attendance"}: <OperationalStatus value={member.attendance?.status || member.attendanceStatus || "MISSING"}/>{member.attendance && <span> · {ar ? "التأخير" : "Late"}: {member.attendance.lateMinutes || 0} {ar ? "دقيقة" : "min"}</span>}{member.relevant === false && <span> · {ar ? "خارج وقت الحجز المقترح" : "Outside suggested booking roster"}</span>}</p>{participant && <><label>{ar ? "الدور" : localize("Role")}<select aria-label={`${ar ? "الدور" : "Role"}: ${name}`} value={participant.role} disabled={!editable||!canEdit} onChange={(event) => updateParticipant(employeeId, { role: event.target.value, primaryLeader: ["TRIP_TEAM_LEADER", "SHIFT_TEAM_LEADER"].includes(event.target.value), responsibleHost: event.target.value === "BIRTHDAY_HOST", isTeamLeader: event.target.value.includes("TEAM_LEADER"), deputy: event.target.value === "SHIFT_DEPUTY" })}>{["STAFF","TRIP_TEAM_LEADER","BIRTHDAY_HOST","SHIFT_TEAM_LEADER","SHIFT_DEPUTY"].map(code=><option value={code} key={code}>{workspaceLabel(code,ar)}</option>)}</select></label><label>{ar ? "بداية التكليف" : "Assignment start"}<input type="time" value={participant.startTime || ""} disabled={!editable||!canEdit} onChange={event => updateParticipant(employeeId, { startTime: event.target.value })} /></label><label>{ar ? "نهاية التكليف" : "Assignment end"}<input type="time" value={participant.endTime || ""} disabled={!editable||!canEdit} onChange={event => updateParticipant(employeeId, { endTime: event.target.value })} /></label><label>{ar ? "مستوى الأداء" : "Performance level"}<select aria-label={`${ar ? "مستوى الأداء" : "Performance level"}: ${name}`} value={adjustment?.levelCode || ""} disabled={!editable||!canEdit} onChange={(event) => updateAdjustment(employeeId, { levelCode: event.target.value, isTeamLeader: participant.isTeamLeader })}><option value="">{ar ? "بدون تعديل" : "No adjustment"}</option>{selected.configSnapshot.effective.value.rewards.performanceLevels.filter((level) => level.active).map((level) => <option key={level.code} value={level.code}>{ar ? level.labelAr : level.label}</option>)}</select></label>{adjustment && <><label>{ar ? "تعليق النقاط" : "Adjustment comment"}<input value={adjustment.comment || ""} disabled={!editable||!canEdit} onChange={(event) => updateAdjustment(employeeId, { comment: event.target.value })} /></label><label>{ar ? "مرجع دليل النقاط" : "Adjustment evidence reference"}<input value={adjustment.evidence?.[0]?.reference || ""} disabled={!editable||!canEdit} onChange={(event) => updateAdjustment(employeeId, { evidence: event.target.value ? [{ reference: event.target.value }] : [] })} /></label><ReportEvidenceUpload reportType={selected.reportType} reportId={selected.id} ar={ar} disabled={!editable||!canEdit} value={adjustment.evidence || []} onChange={evidence => updateAdjustment(employeeId,{evidence})}/></>}</>}</article>;
          })}</div></section></details>

          {selected.configSnapshot.surveyTemplate && <section><h4>{ar ? "الاستبيان" : "Survey"}</h4>{selected.configSnapshot.surveyTemplate.questions.filter((question) => question.active).map((question) => {
            const answer = draft.survey?.answers?.find((item) => item.questionCode === question.code);
            return <article className={styles.survey} key={question.code}><label>{ar ? question.textAr : question.text}<select aria-label={ar ? question.textAr : question.text} value={answer?.choiceCode || ""} disabled={!editable||!canEdit} onChange={(event) => { const next = (draft.survey?.answers || []).filter((item) => item.questionCode !== question.code); setDraft({ ...draft, survey: { ...(draft.survey || {}), removed:false, answers: event.target.value ? [...next, { questionCode: question.code, choiceCode: event.target.value, comment: "" }] : next } }); }}><option value="">—</option>{question.choices.filter((choice) => choice.active).map((choice) => <option key={choice.code} value={choice.code}>{ar ? choice.labelAr : choice.label}</option>)}</select></label>{answer && <label>{ar ? "تعليق الإجابة" : "Answer comment"}<input value={answer.comment || ""} disabled={!editable||!canEdit} onChange={(event) => setDraft({ ...draft, survey: { ...draft.survey, answers: draft.survey.answers.map((item) => item.questionCode === question.code ? { ...item, comment: event.target.value } : item) } })} /></label>}</article>;
          })}<ReportEvidenceUpload reportType={selected.reportType} reportId={selected.id} ar={ar} imageOnly disabled={!editable||!canEdit} value={draft.survey?.paperAttachment ? [draft.survey.paperAttachment] : []} onChange={files => setDraft(current=>({...current,survey:{...(current.survey || {answers:[]}),paperAttachment:files[0] || null}}))} /><label>{ar ? "مرجع صورة الاستبيان الورقي" : "Paper survey image reference"}<input disabled={!editable||!canEdit} value={draft.survey?.paperAttachment?.reference || ""} onChange={(event) => setDraft({ ...draft, survey: { ...(draft.survey || { answers: [] }), paperAttachment: event.target.value ? { reference: event.target.value } : null } })} /></label></section>}

          <ReportExceptionFields draft={draft} setDraft={setDraft} ar={ar} disabled={!editable||!canEdit} employees={employeeOptions} reportType={selected.reportType} />
          <ReportEvidenceUpload reportType={selected.reportType} reportId={selected.id} ar={ar} disabled={!editable||!canEdit} value={draft.attachments || []} onChange={attachments => setDraft(current=>({...current,attachments}))} />
          <details className={styles.references}><summary>{ar ? "مراجع المرفقات المخزنة" : "Stored attachment references"}</summary><label className={styles.full}>{ar ? "مرجع بكل سطر" : "One reference per line"}<textarea aria-label={ar ? "مراجع المرفقات" : "Report attachment references"} disabled={!editable||!canEdit} value={evidenceInput(draft.attachments)} onChange={(event) => setDraft({ ...draft, attachments: evidenceFromText(event.target.value) })} /></label></details>

          <details className={styles.disclosure}><summary>{ar ? "سجل المراجعة والاعتماد" : "Review and approval history"}</summary><ol>{selected.history.map((row, index) => <li key={`${row.revision}-${index}`}><b>{workspaceLabel(row.status || row.action, ar)}</b> · <time dir="ltr">{row.at?.replace("T", " ").slice(0, 19)}</time> · {row.reason || "—"}<small>{ar ? "المستخدم" : "Actor"}: {row.by}</small></li>)}</ol></details>
          {selected.configSnapshot.effective.value.staffing.override.allowed && <label>{ar ? "سبب تجاوز تعارض التكليفات" : "Staffing override reason"}<input disabled={!editable||!canEdit} value={draft.staffingOverride?.reason || ""} onChange={event => setDraft({ ...draft, staffingOverride: event.target.value ? { reason: event.target.value } : null })} /></label>}
          {selected.reportType === "SHIFT_LEADERSHIP" && <label>{ar ? "سبب استبدال قائد الشيفت" : "Leader replacement reason"}<input disabled={!editable||!canEdit} value={draft.leadershipReplacementReason || ""} onChange={event => setDraft({ ...draft, leadershipReplacementReason: event.target.value })} /></label>}
          <div className={styles.actions}>
            {editable && <PermissionButton requireAll permission={["reports.edit",reportPermission(selected?.reportType,"edit")]} type="button" disabled={busy} onClick={() => action("saveDraft", ar ? "حفظ تحديثات مسودة التقرير" : "Save operational report draft updates")}>{ar ? "حفظ المسودة" : "Save draft"}</PermissionButton>}
            {editable && <PermissionButton requireAll permission={["reports.edit",reportPermission(selected?.reportType,"edit")]} type="button" disabled={busy||dirty} onClick={() => action("submit", ar ? "إرسال التقرير للمراجعة" : "Submit report for review")}>{ar ? "إرسال للمراجعة" : "Submit for review"}</PermissionButton>}
            {selected.status === "SUBMITTED" && <PermissionButton requireAll permission={["reports.approve",reportPermission(selected?.reportType,"approve")]} type="button" disabled={busy} onClick={() => action("review", ar ? "تسجيل مراجعة مستقلة للتقرير" : "Record independent report review")}>{ar ? "تمت المراجعة" : "Mark reviewed"}</PermissionButton>}
            {["DRAFT","REOPENED","SUBMITTED","REVIEWED"].includes(selected.status) && <PermissionButton requireAll permission={["reports.approve",reportPermission(selected?.reportType,"approve")]} type="button" disabled={busy||dirty} onClick={() => action("approve", ar ? "مراجعة التقرير واعتماده" : "Independently review and approve report")}>{ar ? "اعتماد" : "Approve"}</PermissionButton>}
            {["DRAFT","REOPENED","SUBMITTED","REVIEWED"].includes(selected.status) && <PermissionButton requireAll permission={["reports.approve",reportPermission(selected?.reportType,"approve")]} type="button" className="secondary" disabled={busy} onClick={() => { const reason = window.prompt(ar ? "سبب الرفض" : "Rejection reason"); if (reason) action("reject", reason); }}>{ar ? "رفض" : "Reject"}</PermissionButton>}
            {selected.status !== "CANCELLED" && <PermissionButton requireAll permission={[selected.status === "APPROVED" ? "reports.unlock" : "reports.edit",reportPermission(selected?.reportType,"edit")]} type="button" className="secondary" disabled={busy} onClick={() => { const reason = window.prompt(ar ? "سبب إلغاء التقرير وعكس أثره" : "Reason to cancel the report and reverse its impact"); if (reason) action("cancel", reason); }}>{ar ? "إلغاء التقرير" : "Cancel report"}</PermissionButton>}
            {["APPROVED", "REJECTED", "CANCELLED"].includes(selected.status) && <PermissionButton requireAll permission={["reports.unlock",reportPermission(selected?.reportType,"edit")]} type="button" className="secondary" disabled={busy} onClick={() => { const reason = window.prompt(ar ? "سبب إعادة الفتح" : "Reopen reason"); if (reason) action("reopen", reason); }}>{ar ? "إعادة فتح" : "Reopen"}</PermissionButton>}
            {selected.status === "APPROVED" && !selected.locked && <PermissionButton requireAll permission={["reports.lock",reportPermission(selected?.reportType,"edit")]} type="button" disabled={busy} onClick={() => action("lock", ar ? "قفل التقرير المعتمد" : "Lock approved report")}>{ar ? "قفل" : "Lock"}</PermissionButton>}
            {editable && <PermissionButton requireAll permission={["reports.edit",reportPermission(selected?.reportType,"edit")]} type="button" className="secondary" disabled={busy} onClick={() => action("upgradeDraftTemplate", ar ? "ترقية صريحة لنسخة قالب أحدث" : "Explicitly upgrade to the newer template")}>{ar ? "ترقية القالب" : "Upgrade template"}</PermissionButton>}
          </div>
        </>}
      </div>
    </div>
  </section>;
}

