"use client";

import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import HallOfFame from "./HallOfFame";
import { MonthlyWinnerArtwork } from "./RecognitionArtwork";

export default function PerformanceWorkspace() {
  const { isArabic } = useI18n();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [section, setSection] = useState("workspace");
  const [artworkOpen, setArtworkOpen] = useState(false);
  const [variant, setVariant] = useState("T01");
  async function load() { const response = await fetch(`/api/operations/performance?year=${year}&month=${month}`); const payload = await response.json(); if (!response.ok) setError(payload.error); else setData(payload); }
  useEffect(() => { load(); }, [year, month]);
  async function action(body) { setError(""); const response = await fetch("/api/operations/performance", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); const payload = await response.json(); if (!response.ok) return setError(payload.error); await load(); }
  const competition = data?.competitions[0];
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
    <section className="panel performance-controls"><input aria-label={isArabic ? "السنة" : "Year"} type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} /><select aria-label={isArabic ? "الشهر" : "Month"} value={month} onChange={(event) => setMonth(Number(event.target.value))}>{Array.from({ length: 12 }, (_, index) => <option value={index + 1} key={index + 1}>{index + 1}</option>)}</select></section>
    <section className="operations-status-strip" aria-label={isArabic ? "ملخص قرارات الأداء" : "Performance decision summary"}>
      <article><span>{isArabic ? "تقييمات تحتاج إجراء" : "Needs action"}</span><b>{data?.appraisals.filter((item) => item.status !== "APPROVED").length || 0}</b></article>
      <article><span>{isArabic ? "حالة موظف الشهر" : "EOTM status"}</span><b>{competition?.status || (isArabic ? "لم تبدأ" : "Not started")}</b></article>
      <article><span>{isArabic ? "خطط خلافة نشطة" : "Active succession"}</span><b>{data?.succession.length || 0}</b></article>
    </section>
    <section className="panel performance-trend"><div><span>{isArabic ? "اتجاه الأداء المعتمد" : "APPROVED PERFORMANCE TREND"}</span><h3>{isArabic ? "مقارنة بالشهر السابق" : "Compared with the previous month"}</h3><p>{currentAverage == null ? (isArabic ? "لا توجد تقييمات معتمدة في الفترة المحددة" : "No approved appraisals in this period") : (isArabic ? `متوسط الفترة الحالية: ${currentAverage}` : `Current approved average: ${currentAverage}`)}</p></div>{currentAverage != null && <div className={`performance-trend-value ${(previousAverage == null || currentAverage >= previousAverage) ? "up" : "down"}`}><b>{previousAverage == null ? "—" : `${currentAverage - previousAverage >= 0 ? "+" : ""}${currentAverage - previousAverage}`}</b><small>{previousAverage == null ? (isArabic ? "لا توجد فترة سابقة معتمدة" : "No prior approved period") : `${data.previousPeriod.month}/${data.previousPeriod.year} · ${previousAverage}`}</small></div>}</section>
    <section className="grid two performance-layout">
      <article className="panel"><div className="operations-profile-head"><div><h2>{isArabic ? "التقييم الشهري" : "Monthly Appraisal"}</h2><span>{isArabic ? "القيم التاريخية محفوظة دون إعادة حساب" : "Historical values preserved without recalculation"}</span></div><em>{data?.appraisals.length || 0}</em></div>
        <div className="record-table-scroll"><table className="record-line-table performance-table"><thead><tr><th>{isArabic ? "الموظف" : "Employee"}</th><th>{isArabic ? "النتيجة" : "Score"}</th><th>{isArabic ? "الحالة" : "Status"}</th><th>{isArabic ? "الإصدار" : "Version"}</th></tr></thead><tbody>{data?.appraisals.map((item) => <tr key={item.id}><td>{item.employee.name}</td><td>{item.totalScore}</td><td>{item.status}</td><td>v{item.version}</td></tr>)}</tbody></table></div>
      </article>
      <article className="panel"><div className="operations-profile-head"><div><h2>EOTM</h2><span>{competition ? `${competition.status} · v${competition.version}` : (isArabic ? "لم تبدأ المسابقة" : "Competition not started")}</span></div>{competition?.winner && <em>{competition.winner.name}</em>}</div>
        {!competition ? <button disabled={!data?.appraisals.some((item) => item.status === "APPROVED")} onClick={() => action({ action: "eotmCreate", year, month })}>{isArabic ? "حساب المرشحين" : "Calculate candidates"}</button> : <>
          <div className="daily-team-list">{competition.candidates.map((candidate) => <div className="row" key={candidate.id}><b>#{candidate.rank} {candidate.employee.name}</b><span>{candidate.finalScore}</span>{competition.status !== "LOCKED" && <button onClick={() => action({ action: "eotmWinner", competitionId: competition.id, employeeId: candidate.employeeId })}>{isArabic ? "اختيار" : "Select"}</button>}</div>)}</div>
          {competition.status === "WINNER_APPROVED" && <button onClick={() => action({ action: "eotmLock", competitionId: competition.id })}>{isArabic ? "قفل النتيجة" : "Lock result"}</button>}
          {competition.status === "LOCKED" && <div className="recognition-actions"><button onClick={() => setArtworkOpen(true)}>{isArabic ? "تمبلت جائزة موظف الشهر" : "Employee of the Month template"}</button><button className="secondary" onClick={printArtwork}>{isArabic ? "طباعة / حفظ PDF" : "Print / Save PDF"}</button><button className="danger" onClick={() => { const reason = window.prompt(isArabic ? "سبب إعادة الفتح" : "Reopen reason"); if (reason) action({ action: "eotmReopen", competitionId: competition.id, reason }); }}>{isArabic ? "إعادة فتح مصرح" : "Authorized reopen"}</button></div>}
        </>}
      </article>
    </section>
    <section className="panel"><div className="operations-profile-head"><div><h2>{isArabic ? "خطة الخلافة" : "Succession Plan"}</h2><span>{isArabic ? "الجاهزية قرار إداري يدوي" : "Readiness remains a manual management decision"}</span></div><em>{data?.succession.length || 0}</em></div>
      {data?.succession.length ? <div className="record-table-scroll"><table className="record-line-table succession-table"><thead><tr><th>{isArabic ? "الموظف" : "Employee"}</th><th>{isArabic ? "الحالي" : "Current"}</th><th>{isArabic ? "المستهدف" : "Target"}</th><th>{isArabic ? "الجاهزية" : "Readiness"}</th></tr></thead><tbody>{data.succession.map((item) => <tr key={item.id}><td>{item.employee.name}</td><td>{item.currentRole}</td><td>{item.targetRole}</td><td>{item.readinessStatus}</td></tr>)}</tbody></table></div> : <div className="muted">{isArabic ? "لا توجد خطط خلافة نشطة" : "No active succession plans"}</div>}
    </section>
    </>}
    {artworkOpen && templateWinner && <div className="modal-backdrop recognition-preview-backdrop" role="presentation" onMouseDown={() => setArtworkOpen(false)}><section className="recognition-preview" role="dialog" aria-modal="true" aria-label={isArabic ? "تمبلت موظف الشهر" : "Employee of the Month template"} onMouseDown={(event) => event.stopPropagation()}><div className="recognition-preview-actions"><div className="recognition-template-picker" aria-label={isArabic ? "اختيار القالب" : "Choose template"}>{["T01", "T02", "T03", "T04", "T05"].map((item) => <button className={variant === item ? "active" : "secondary"} key={item} onClick={() => setVariant(item)}>{item}</button>)}</div><button className="secondary" onClick={printArtwork}>{isArabic ? "طباعة / حفظ PDF" : "Print / Save PDF"}</button><button onClick={() => setArtworkOpen(false)}>{isArabic ? "إغلاق" : "Close"}</button></div><MonthlyWinnerArtwork winner={templateWinner} variant={variant} config={data?.artworkConfig} /></section></div>}
  </section>;
}
