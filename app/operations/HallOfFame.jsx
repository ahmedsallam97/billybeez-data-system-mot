"use client";
import { useUiText } from '@/app/i18n';
import {PageHeader} from '../ui/DesktopLayout';
import ActionButton from "@/app/ActionButton";
import {PermissionButton} from '@/app/account/PermissionControls';
import {useSearchParams} from 'next/navigation';

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import { HallOfFameArtwork, MonthlyWinnerArtwork } from "./RecognitionArtwork";
import { printRecognitionArtwork } from "@/lib/client/print-recognition";
import { readApiResponse } from "@/lib/client/read-api-response";
import TemplatePreviewFrame from "../settings/TemplatePreviewFrame";

const BREAKDOWN_LABELS = {
  discipline: ["الالتزام", "Discipline"], appearance: ["المظهر", "Appearance"],
  coreDuties: ["المهام الأساسية", "Core duties"], facility: ["العناية بالمكان", "Facility care"],
  totalGrooming: ["إجمالي التقييم", "Evaluation total"], totalBonus: ["الحوافز", "Bonus"],
  totalPenalty: ["الخصومات", "Penalties"], finalScore: ["النتيجة النهائية", "Final score"],
};

function initials(name) {
  return String(name || "BB").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function HallOfFame() {
  const localize = useUiText();
  const { isArabic } = useI18n();
  const params=useSearchParams(),requestedYear=params.get('year');
  const [year, setYear] = useState(/^\d{4}$/.test(requestedYear||'')?requestedYear:String(new Date().getFullYear()));
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [artwork, setArtwork] = useState(null);
  const [variant, setVariant] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError(""); setArtwork(null); setSelected(null); setVariant("");
    const suffix = year === "ALL" ? "?kind=hall" : `?kind=hall&year=${year}`;
    fetch(`/api/operations/recognition${suffix}`,{signal:controller.signal}).then(response=>readApiResponse(response,"Recognition data could not be loaded")).then(data=>{if(!controller.signal.aborted)setData(data);}).catch(error=>{if(error.name!=="AbortError")setError(error.message);});
    return()=>controller.abort();
  }, [year]);
  const activeVariant = variant || data?.artworkConfig?.monthly?.template || "T01";
  const monthFormatter = useMemo(() => new Intl.DateTimeFormat(isArabic ? "ar-EG" : "en-US", { month: "long", timeZone: "UTC" }), [isArabic]);
  const monthName = (month) => monthFormatter.format(new Date(Date.UTC(2026, month - 1, 1)));
  const current = data?.currentWinner;
  const yearLabel = year;
  async function printArtwork(kind) { try { await printRecognitionArtwork(kind); } catch(error) { setError(error.message); } }
  return <><PageHeader description={isArabic?"الفائزون من المسابقات المقفولة فقط.":"Recognition from finalized and locked competitions."}/>
    {error && <div className="alert danger">{error}</div>}
    <section className={`panel eotm-showcase ${current ? "has-winner" : ""}`}>
      <div className="eotm-medal" aria-hidden="true">★</div>
      {current ? <><div className="eotm-avatar" aria-label={current.employee.name}>{initials(current.employee.name)}</div><div className="eotm-showcase-copy"><span className="badge">{isArabic ? "موظف الشهر" : localize("Employee of the Month")}</span><h2>{current.employee.name}</h2>{current.employee.nameAr && <p>{current.employee.nameAr}</p>}<b>{current.employee.jobTitle || (isArabic ? "موظف العمليات" : "Operations employee")}</b><div className="muted">{monthName(current.month)} {current.year}{current.finalScore != null ? ` · ${isArabic ? "النتيجة" : "Score"}: ${current.finalScore}` : ""}</div><div className="recognition-actions"><ActionButton onClick={() => setSelected(current)}>{isArabic ? "عرض التفاصيل" : localize("View details")}</ActionButton><ActionButton className="secondary" onClick={() => setArtwork("monthly")}>{isArabic ? "عرض تصميم الفائز" : "View winner design"}</ActionButton><PermissionButton permission={["hall.print","hall.pdf"]} className="secondary" onClick={() => { setArtwork("monthly"); window.setTimeout(() => printArtwork("monthly"), 0); }}>{isArabic ? "طباعة / حفظ PDF" : "Print / Save PDF"}</PermissionButton></div></div></> : <div className="eotm-empty"><h2>{isArabic ? "موظف الشهر" : localize("Employee of the Month")}</h2><p className="muted">{isArabic ? "لا يوجد فائز نهائي مقفول حتى الآن." : "There is no finalized locked winner yet."}</p></div>}
    </section>
    <section className="panel"><div className="operations-profile-head"><div><h2>{isArabic?"الفائزون خلال السنة":"Annual winners"}</h2><span>{isArabic ? "الفائزون من المسابقات المقفولة فقط" : "Winners from locked competitions only"}</span></div><div className="hall-toolbar"><select aria-label={isArabic ? "تصفية بالسنة" : "Filter by year"} value={year} onChange={(event) => setYear(event.target.value)}>{[...new Set([Number(year), ...(data?.years || [])])].sort((a,b)=>b-a).map((item) => <option value={item} key={item}>{item}</option>)}</select><ActionButton className="secondary" disabled={!data?.winners.length} onClick={() => setArtwork("hall")}>{isArabic ? "عرض تصميم القاعة" : "View Hall design"}</ActionButton><PermissionButton permission={["hall.print","hall.pdf"]} className="secondary" disabled={!data?.winners.length} onClick={() => { setArtwork("hall"); window.setTimeout(() => printArtwork("hall"), 0); }}>{isArabic ? "طباعة / حفظ PDF" : "Print / Save PDF"}</PermissionButton></div></div>
      {!data ? <div className="manager-skeleton"><div className="card skeleton-card" /></div> : data.winners.length ? <div className="grid three hall-grid">{data.winners.map((winner) => <ActionButton className="card hall-winner-card" key={winner.competitionId} onClick={() => setSelected(winner)}><span className="eotm-avatar small">{initials(winner.employee.name)}</span><span className="badge">★ {monthName(winner.month)} {winner.year}</span><b>{winner.employee.name}</b><small>{winner.employee.jobTitle || "—"}</small>{winner.finalScore != null && <strong>{winner.finalScore}</strong>}</ActionButton>)}</div> : <div className="eotm-empty"><b>{isArabic ? "لا توجد نتائج نهائية في الاختيار ده" : "No finalized winners for this selection"}</b></div>}
    </section>
    {selected && <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelected(null)}><section className="detail-modal eotm-detail-modal" role="dialog" aria-modal="true" aria-labelledby="eotm-winner-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="badge">★ {isArabic ? "تكريم موظف الشهر" : "Employee of the Month Recognition"}</span><h2 id="eotm-winner-title">{selected.employee.name}</h2><span>{monthName(selected.month)} {selected.year} · {selected.employee.jobTitle || "—"}</span></div><ActionButton onClick={() => setSelected(null)}>{isArabic ? "إغلاق" : localize("Close")}</ActionButton></div><div className="grid two operations-facts"><div><span>{isArabic ? "حالة المسابقة" : "Competition status"}</span><b>{isArabic ? "نهائي ومقفل" : "Finalized and locked"}</b></div><div><span>{isArabic ? "النتيجة النهائية" : "Final EOTM score"}</span><b>{selected.finalScore ?? "—"}</b></div></div>{Object.keys(selected.scoreBreakdown).length > 0 && <><h3>{isArabic ? "تفاصيل النتيجة" : "Score breakdown"}</h3><div className="record-table-scroll"><table className="record-line-table eotm-breakdown-table"><thead><tr><th>{isArabic ? "البند" : "Component"}</th><th>{isArabic ? "القيمة" : "Value"}</th></tr></thead><tbody>{Object.entries(selected.scoreBreakdown).map(([key, value]) => <tr key={key}><td>{BREAKDOWN_LABELS[key]?.[isArabic ? 0 : 1] || key}</td><td>{value}</td></tr>)}</tbody></table></div></>}</section></div>}
    {artwork && <div className="modal-backdrop recognition-preview-backdrop" role="presentation" onMouseDown={() => setArtwork(null)}><section className="recognition-preview" role="dialog" aria-modal="true" aria-label={artwork === "monthly" ? (isArabic ? "تصميم موظف الشهر" : "Employee of the Month design") : (isArabic ? "تصميم قاعة المتميزين" : "Hall of Fame design")} onMouseDown={(event) => event.stopPropagation()}><div className="recognition-preview-actions">{artwork === "monthly" && <div className="recognition-template-picker" aria-label={isArabic ? "اختيار القالب" : "Choose template"}>{["T01", "T02", "T03", "T04", "T05"].map((item) => <ActionButton className={activeVariant === item ? "active" : "secondary"} key={item} onClick={() => setVariant(item)}>{item}</ActionButton>)}</div>}<PermissionButton permission={["hall.print","hall.pdf"]} className="secondary" onClick={() => printArtwork(artwork)}>{isArabic ? "طباعة / حفظ PDF" : "Print / Save PDF"}</PermissionButton><ActionButton onClick={() => setArtwork(null)}>{isArabic ? "إغلاق" : localize("Close")}</ActionButton></div><TemplatePreviewFrame width={artwork === "monthly" ? 700 : 820}>{artwork === "monthly" ? <MonthlyWinnerArtwork winner={current} variant={activeVariant} config={data?.artworkConfig} /> : <HallOfFameArtwork winners={data?.winners || []} yearLabel={yearLabel} config={data?.artworkConfig} />}</TemplatePreviewFrame></section></div>}
  </>;
}

