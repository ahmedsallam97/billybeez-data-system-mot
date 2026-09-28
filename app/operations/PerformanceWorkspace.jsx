"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "../i18n";
import HallOfFame from "./HallOfFame";
import { MonthlyWinnerArtwork } from "./RecognitionArtwork";
import { readApiResponse } from "@/lib/client/read-api-response";

function ManualAppraisalModal({ data, year, month, isArabic, busy, onClose, onSave }) {
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
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="detail-modal manual-appraisal-modal" role="dialog" aria-modal="true" aria-labelledby="manual-appraisal-title" onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-head"><div><span className="badge">MANUAL OVERRIDE</span><h2 id="manual-appraisal-title">{isArabic ? "إدخال نتائج التقييم يدويًا" : "Enter monthly scores manually"}</h2><p>{month}/{year} · {isArabic ? "سيتم حفظ القيم المعدلة فقط في نسخة جديدة قابلة للمراجعة والاعتماد." : "Only changed values are saved in a new version for review and approval."}</p></div><button type="button" onClick={onClose}>{isArabic ? "إغلاق" : "Close"}</button></div>
    <form onSubmit={submit}>
      <div className="manual-appraisal-list">{(data.employees || []).map((employee) => { const appraisal = existing.get(employee.id); return <label className={changed[employee.id] ? "changed" : ""} key={employee.id}><span><b>{employee.name}</b><small>{employee.hrisNumber || employee.localEmployeeCode || employee.jobTitle || "—"} · {employee.active ? (isArabic ? "نشط" : "Active") : employee.employmentStatus}</small></span><input aria-label={`${employee.name} manual score`} type="number" min="0" max="10000" step="0.01" placeholder={isArabic ? "النتيجة" : "Score"} value={values[employee.id] ?? ""} onChange={(event) => { setValues((current) => ({ ...current, [employee.id]: event.target.value })); setChanged((current) => ({ ...current, [employee.id]: true })); }} /><em>{appraisal ? `${appraisal.entryMode === "MANUAL" ? (isArabic ? "يدوي" : "Manual") : (isArabic ? "محسوب" : "Calculated")} · v${appraisal.version}` : (isArabic ? "لا يوجد تقييم" : "No appraisal")}</em></label>; })}</div>
      <label className="manual-appraisal-reason">{isArabic ? "سبب الإدخال أو التعديل اليدوي" : "Reason for manual entry or correction"}<textarea aria-label={isArabic ? "سبب التعديل اليدوي" : "Manual override reason"} required minLength="5" placeholder={isArabic ? "مثال: نتيجة معتمدة من ملف التقييم الورقي قبل تشغيل السيستم" : "Example: approved paper appraisal from before the system launch"} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <div className="manual-appraisal-footer"><span>{isArabic ? `${changedRows.length} موظف سيتم حفظه. النتائج القديمة تظل محفوظة في السجل.` : `${changedRows.length} employee(s) will be saved. Previous scores remain in the audit history.`}</span><button type="submit" disabled={busy || !changedRows.length || reason.trim().length < 5}>{busy ? (isArabic ? "جارٍ الحفظ…" : "Saving…") : (isArabic ? "حفظ القيم اليدوية" : "Save manual scores")}</button></div>
    </form>
  </section></div>;
}

export default function PerformanceWorkspace() {
  const { isArabic } = useI18n();
  const searchParams = useSearchParams();
  const now = new Date();
  const requestedYear = Number(searchParams.get("year"));
  const requestedMonth = Number(searchParams.get("month"));
  const [year, setYear] = useState(Number.isInteger(requestedYear) && requestedYear >= 2020 && requestedYear <= 2100 ? requestedYear : now.getFullYear());
  const [month, setMonth] = useState(Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12 ? requestedMonth : now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState("workspace");
  const [artworkOpen, setArtworkOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [variant, setVariant] = useState("T01");
  async function load() { try { const response = await fetch(`/api/operations/performance?year=${year}&month=${month}`); setData(await readApiResponse(response, "Performance data could not be loaded")); setError(""); } catch (requestError) { setError(requestError.message); } }
  useEffect(() => { load(); }, [year, month]);
  async function action(body, successMessage = "") { setBusy(true); setError(""); setNotice(""); try { const response = await fetch("/api/operations/performance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); await readApiResponse(response, "Performance action could not be saved"); if (successMessage) setNotice(successMessage); await load(); return true; } catch (requestError) { setError(requestError.message); return false; } finally { setBusy(false); } }
  const competition = data?.competitions[0];
  const pendingAppraisals = data?.appraisals.filter((item) => ["DRAFT", "REVIEWED", "REOPENED"].includes(item.status)) || [];
  const approvedAppraisals = data?.appraisals.filter((item) => item.status === "APPROVED") || [];
  const templateWinner = competition?.winner ? { ...competition, employee: competition.winner, branch: data?.branch?.branchCode || "MOT" } : null;
  const currentScores = data?.appraisals.filter((item) => item.status === "APPROVED").map((item) => item.totalScore) || [];
  const previousScores = data?.previousAppraisals?.map((item) => item.totalScore) || [];
  const average = (scores) => scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null;
  const currentAverage = average(currentScores);
  const previousAverage = average(previousScores);
  function printArtwork() { document.body.dataset.recognitionPrint = "monthly"; const cleanup = () => { delete document.body.dataset.recognitionPrint; window.removeEventListener("afterprint", cleanup); }; window.addEventListener("afterprint", cleanup); window.print(); window.setTimeout(cleanup, 1000); }
  return <section className="performance-workspace">
    <header className="operations-workspace-head">
      <div><span>{isArabic ? "قرارات الأداء والتقدير" : "PERFORMANCE & RECOGNITION"}</span><h2>{isArabic ? "الأداء والخلافة" : "Performance & Succession"}</h2><p>{isArabic ? "التقييم المعتمد، موظف الشهر، وخطة الجاهزية المهنية." : "Approved performance, Employee of the Month and readiness planning."}</p></div>
      <div className="operations-decision-count"><b>{data?.appraisals.filter((item) => item.status !== "APPROVED").length ?? "…"}</b><small>{isArabic ? "تقييم يحتاج إجراء" : "appraisals need action"}</small></div>
    </header>
    <div className="tabs performance-tabs"><button className={section === "workspace" ? "active" : ""} onClick={() => setSection("workspace")}>{isArabic ? "التقييم وموظف الشهر" : "Appraisal & EOTM"}</button><button className={section === "hall" ? "active" : ""} onClick={() => setSection("hall")}>{isArabic ? "قاعة المتميزين" : "Hall of Fame"}</button></div>
    {section === "hall" ? <HallOfFame /> : <>
    {error && <div className="alert danger">{error}</div>}
    {notice && <div className="alert success">{notice}</div>}
    <section className="panel performance-controls"><input aria-label={isArabic ? "السنة" : "Year"} type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} /><select aria-label={isArabic ? "الشهر" : "Month"} value={month} onChange={(event) => setMonth(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option value={index + 1} key={index + 1}>{index + 1}</option>)}</select></section>
    <section className="operations-status-strip" aria-label={isArabic ? "ملخص قرارات الأداء" : "Performance decision summary"}>
      <article><span>{isArabic ? "تقييمات تحتاج إجراء" : "Needs action"}</span><b>{pendingAppraisals.length}</b></article>
      <article><span>{isArabic ? "حالة موظف الشهر" : "EOTM status"}</span><b>{competition?.status || (isArabic ? "لم تبدأ" : "Not started")}</b></article>
      <article><span>{isArabic ? "خطط خلافة نشطة" : "Active succession"}</span><b>{data?.succession.length || 0}</b></article>
    </section>
    <section className="panel performance-trend"><div><span>{isArabic ? "اتجاه الأداء المعتمد" : "APPROVED PERFORMANCE TREND"}</span><h3>{isArabic ? "مقارنة بالشهر السابق" : "Compared with the previous month"}</h3><p>{currentAverage == null ? (isArabic ? "لا توجد تقييمات معتمدة في الفترة المحددة" : "No approved appraisals in this period") : (isArabic ? `متوسط الفترة الحالية: ${currentAverage}` : `Current approved average: ${currentAverage}`)}</p></div>{currentAverage != null && <div className={`performance-trend-value ${(previousAverage == null || currentAverage >= previousAverage) ? "up" : "down"}`}><b>{previousAverage == null ? "—" : `${currentAverage - previousAverage >= 0 ? "+" : ""}${currentAverage - previousAverage}`}</b><small>{previousAverage == null ? (isArabic ? "لا توجد فترة سابقة معتمدة" : "No prior approved period") : `${data.previousPeriod.month}/${data.previousPeriod.year} · ${previousAverage}`}</small></div>}</section>
    <section className="grid two performance-layout">
      <article className="panel"><div className="operations-profile-head"><div><h2>{isArabic ? "التقييم الشهري" : "Monthly Appraisal"}</h2><span>{isArabic ? "الاعتماد يثبت القيم التاريخية كما هي دون إعادة حساب" : "Approval preserves historical values without recalculation"}</span></div><div className="manual-appraisal-trigger"><em>{data?.appraisals.length || 0}</em><button type="button" disabled={busy || !data} onClick={() => setManualOpen(true)}>{isArabic ? "إدخال / تعديل يدوي" : "Manual scores"}</button></div></div>
        {pendingAppraisals.length > 0 && <div className="performance-appraisal-actions"><div><b>{isArabic ? `${pendingAppraisals.length} تقييم بانتظار الاعتماد` : `${pendingAppraisals.length} appraisals await approval`}</b><span>{isArabic ? "راجع النتائج ثم اعتمدها لتفعيل اختيار موظف الشهر." : "Review the scores, then approve them to enable Employee of the Month selection."}</span></div><button type="button" disabled={busy} onClick={() => { if (window.confirm(isArabic ? `اعتماد ${pendingAppraisals.length} تقييم لشهر ${month}/${year} بالقيم الحالية؟` : `Approve ${pendingAppraisals.length} appraisals for ${month}/${year} with their current values?`)) action({ action: "appraisalApproveAll", year, month }, isArabic ? "تم اعتماد تقييمات الشهر ويمكن الآن حساب المرشحين" : "Monthly appraisals approved; candidates can now be calculated"); }}>{isArabic ? "اعتماد كل تقييمات الشهر" : "Approve all monthly appraisals"}</button></div>}
        <div className="record-table-scroll"><table className="record-line-table performance-table"><thead><tr><th>{isArabic ? "الموظف" : "Employee"}</th><th>{isArabic ? "النتيجة" : "Score"}</th><th>{isArabic ? "المصدر" : "Source"}</th><th>{isArabic ? "الحالة" : "Status"}</th><th>{isArabic ? "الإصدار" : "Version"}</th><th>{isArabic ? "الإجراء" : "Action"}</th></tr></thead><tbody>{data?.appraisals.map((item) => <tr key={item.id}><td>{item.employee.name}</td><td>{item.totalScore}</td><td><span className={`badge ${item.entryMode === "MANUAL" ? "warning" : ""}`} title={item.manualReason || ""}>{item.entryMode === "MANUAL" ? (isArabic ? "يدوي" : "Manual") : (isArabic ? "محسوب" : "Calculated")}</span></td><td><span className={`badge ${item.status === "APPROVED" ? "success" : "warning"}`}>{item.status}</span></td><td>v{item.version}</td><td><div className="performance-row-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setManualOpen(true)}>{isArabic ? "تعديل يدوي" : "Override"}</button>{["DRAFT", "REVIEWED", "REOPENED"].includes(item.status) ? <button type="button" disabled={busy} onClick={() => action({ action: "appraisalApprove", appraisalId: item.id }, isArabic ? `تم اعتماد تقييم ${item.employee.name}` : `${item.employee.name}'s appraisal was approved`)}>{isArabic ? "اعتماد" : "Approve"}</button> : <span className="muted">{isArabic ? "معتمد" : "Approved"}</span>}</div></td></tr>)}</tbody></table></div>
        {!data?.appraisals.length && <div className="daily-empty">{isArabic ? "لا توجد تقييمات مسجلة لهذا الشهر." : "No appraisals are recorded for this month."}</div>}
      </article>
      <article className="panel"><div className="operations-profile-head"><div><h2>EOTM</h2><span>{competition ? `${competition.status} · v${competition.version}` : (isArabic ? "لم تبدأ المسابقة" : "Competition not started")}</span></div>{competition?.winner && <em>{competition.winner.name}</em>}</div>
        {!competition ? <div className="eotm-start-panel"><p>{pendingAppraisals.length ? (isArabic ? "اعتمد تقييمات الشهر أولًا، وبعدها سيظهر جميع الموظفين المؤهلين للاختيار." : "Approve the month's appraisals first; all eligible employees will then be available for selection.") : approvedAppraisals.length ? (isArabic ? `${approvedAppraisals.length} تقييم معتمد وجاهز لحساب المرشحين.` : `${approvedAppraisals.length} approved appraisals are ready for candidate calculation.`) : (isArabic ? "لا توجد تقييمات في هذا الشهر لبدء المسابقة." : "There are no appraisals in this month to start the competition.")}</p><button disabled={busy || pendingAppraisals.length > 0 || approvedAppraisals.length === 0} onClick={() => action({ action: "eotmCreate", year, month }, isArabic ? "تم حساب المرشحين؛ اختر موظف الشهر" : "Candidates calculated; select Employee of the Month")}>{isArabic ? "حساب المرشحين" : "Calculate candidates"}</button></div> : <>
          <div className="daily-team-list">{competition.candidates.map((candidate) => <div className="row" key={candidate.id}><b>#{candidate.rank} {candidate.employee.name}</b><span>{candidate.finalScore}</span>{competition.status !== "LOCKED" && <button disabled={busy} onClick={() => action({ action: "eotmWinner", competitionId: competition.id, employeeId: candidate.employeeId }, isArabic ? `تم اختيار ${candidate.employee.name}؛ اقفل النتيجة بعد المراجعة` : `${candidate.employee.name} selected; lock the result after review`)}>{competition.winnerEmployeeId === candidate.employeeId ? (isArabic ? "المختار" : "Selected") : (isArabic ? "اختيار" : "Select")}</button>}</div>)}</div>
          {competition.status === "WINNER_APPROVED" && <button disabled={busy} onClick={() => action({ action: "eotmLock", competitionId: competition.id }, isArabic ? "تم اعتماد وقفل موظف الشهر" : "Employee of the Month was approved and locked")}>{isArabic ? "اعتماد وقفل النتيجة" : "Approve and lock result"}</button>}
          {competition.status === "LOCKED" && <div className="recognition-actions"><button onClick={() => setArtworkOpen(true)}>{isArabic ? "تمبلت جائزة موظف الشهر" : "Employee of the Month template"}</button><button className="secondary" onClick={printArtwork}>{isArabic ? "طباعة / حفظ PDF" : "Print / Save PDF"}</button><button className="danger" onClick={() => { const reason = window.prompt(isArabic ? "سبب إعادة الفتح" : "Reopen reason"); if (reason) action({ action: "eotmReopen", competitionId: competition.id, reason }); }}>{isArabic ? "إعادة فتح مصرح" : "Authorized reopen"}</button></div>}
        </>}
      </article>
    </section>
    <section className="panel"><div className="operations-profile-head"><div><h2>{isArabic ? "خطة الخلافة" : "Succession Plan"}</h2><span>{isArabic ? "الجاهزية قرار إداري يدوي" : "Readiness remains a manual management decision"}</span></div><em>{data?.succession.length || 0}</em></div>
      {data?.succession.length ? <div className="record-table-scroll"><table className="record-line-table succession-table"><thead><tr><th>{isArabic ? "الموظف" : "Employee"}</th><th>{isArabic ? "الحالي" : "Current"}</th><th>{isArabic ? "المستهدف" : "Target"}</th><th>{isArabic ? "الجاهزية" : "Readiness"}</th></tr></thead><tbody>{data.succession.map((item) => <tr key={item.id}><td>{item.employee.name}</td><td>{item.currentRole}</td><td>{item.targetRole}</td><td>{item.readinessStatus}</td></tr>)}</tbody></table></div> : <div className="muted">{isArabic ? "لا توجد خطط خلافة نشطة" : "No active succession plans"}</div>}
    </section>
    </>}
    {artworkOpen && templateWinner && <div className="modal-backdrop recognition-preview-backdrop" role="presentation" onMouseDown={() => setArtworkOpen(false)}><section className="recognition-preview" role="dialog" aria-modal="true" aria-label={isArabic ? "تمبلت موظف الشهر" : "Employee of the Month template"} onMouseDown={(event) => event.stopPropagation()}><div className="recognition-preview-actions"><div className="recognition-template-picker" aria-label={isArabic ? "اختيار القالب" : "Choose template"}>{["T01", "T02", "T03", "T04", "T05"].map((item) => <button className={variant === item ? "active" : "secondary"} key={item} onClick={() => setVariant(item)}>{item}</button>)}</div><button className="secondary" onClick={printArtwork}>{isArabic ? "طباعة / حفظ PDF" : "Print / Save PDF"}</button><button onClick={() => setArtworkOpen(false)}>{isArabic ? "إغلاق" : "Close"}</button></div><MonthlyWinnerArtwork winner={templateWinner} variant={variant} config={data?.artworkConfig} /></section></div>}
    {manualOpen && data && <ManualAppraisalModal data={data} year={year} month={month} isArabic={isArabic} busy={busy} onClose={() => setManualOpen(false)} onSave={action} />}
  </section>;
}
