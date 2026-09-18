"use client";

import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

export default function OperationsDashboard({ onNavigate }) {
  const { isArabic } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/operations/summary").then(async (response) => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Request failed");
      setData(payload);
    }).catch((requestError) => setError(requestError.message));
  }, []);
  if (error) return <div className="alert danger">{error}</div>;
  if (!data) return <div className="manager-skeleton"><div className="card skeleton-card" /><div className="card skeleton-tabs" /></div>;
  const insightText = (item) => {
    const ar = {
      SCHEDULE_NOT_PUBLISHED: "لا يوجد روستر معتمد يغطي اليوم.",
      ATTENDANCE_NOT_STARTED: "الحضور لم يبدأ لليوم.",
      MISSING_ATTENDANCE: `${item.message.match(/\d+/)?.[0] || "بعض"} موظف يحتاج تسجيل حضور أو مراجعة.`,
      APPRAISALS_PENDING: `${item.message.match(/\d+/)?.[0] || ""} تقييم شهري يحتاج مراجعة أو اعتماد.`,
      LEAVE_REQUESTS_PENDING: `${item.message.match(/\d+/)?.[0] || ""} طلب إجازة ينتظر القرار.`,
    };
    return isArabic ? (ar[item.code] || item.message) : item.message;
  };
  const actionText = (target) => isArabic ? ({ schedule: "افتح الروستر", daily: "افتح الحضور", performance: "افتح التقييمات", time: "افتح الإجازات" }[target] || "افتح") : "Open";
  const rankRows = (rows, kind) => rows?.length ? rows.map((item, index) => <article className="performance-rank-row" key={item.employee.id}><span>{index + 1}</span><div><b>{item.employee.name}</b><small>{item.employee.jobTitle || "—"} · {item.month}/{item.year}</small></div><strong>{item.score}</strong></article>) : <p className="muted">{isArabic ? "لا توجد تقييمات معتمدة كفاية لإظهار ترتيب موثوق." : "No approved appraisals are available for a reliable ranking."}</p>;
  return <div className="operations-dashboard">
    <section className="operations-performance-summary">
      <article className="panel performance-summary-card top"><header><span>{isArabic ? "أقوى أداء معتمد" : "TOP APPROVED PERFORMANCE"}</span><h2>{isArabic ? "أفضل ٣ موظفين" : "Top 3 employees"}</h2><small>{data.performance?.source ? `${data.performance.source.month}/${data.performance.source.year}` : "—"}</small></header>{rankRows(data.performance?.top, "top")}</article>
      <article className="panel performance-summary-card support"><header><span>{isArabic ? "أولوية دعم" : "SUPPORT PRIORITY"}</span><h2>{isArabic ? "٣ موظفين يحتاجون متابعة" : "3 employees needing support"}</h2><small>{data.performance?.source ? `${data.performance.source.month}/${data.performance.source.year}` : "—"}</small></header>{rankRows(data.performance?.needsSupport, "support")}</article>
    </section>
    <section className="panel operations-insights"><header><div><span>{isArabic ? "إنسايتس تشغيلية" : "OPERATIONAL INSIGHTS"}</span><h2>{isArabic ? "إجراءات لها تأثير الآن" : "Actions with impact now"}</h2></div></header>
      {data.attention.length ? data.attention.map((item) => <article className={`operations-insight ${item.severity}`} key={item.code}><span>{insightText(item)}</span>{item.target && <button onClick={() => onNavigate(item.target)}>{actionText(item.target)}</button>}</article>) : <p className="muted">{isArabic ? "لا توجد مشكلة تشغيلية أو قرار معلّق يحتاج تدخلك الآن." : "No operational issue or pending decision needs attention now."}</p>}
    </section>
  </div>;
}
