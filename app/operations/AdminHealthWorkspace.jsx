"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

export default function AdminHealthWorkspace() {
  const { isArabic } = useI18n();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  async function load() { const response = await fetch("/api/operations/health"); const payload = await response.json(); if (!response.ok) setError(payload.error); else setData(payload); }
  useEffect(() => { load(); }, []);
  return <section className="admin-health-workspace">
    <header className="operations-workspace-head">
      <div><span>{isArabic ? "جاهزية النظام المحلي" : "LOCAL SYSTEM READINESS"}</span><h2>{isArabic ? "الإدارة والسلامة" : "Admin & Health"}</h2><p>{isArabic ? "فحص سريع للقاعدة والنسخ الاحتياطية قبل أي إجراء إداري." : "A quick database and backup check before administrative work."}</p></div>
      <div className={`operations-decision-count ${data?.database.integrity === "ok" ? "clear" : "has-attention"}`}><b>{data?.database.integrity === "ok" ? "OK" : "…"}</b><small>{isArabic ? "حالة قاعدة البيانات" : "database status"}</small></div>
    </header>
    {error && <div className="alert danger">{error}</div>}
    <section className="grid three metrics"><article className="card metric"><div className="label">{isArabic ? "سلامة SQLite" : "SQLite integrity"}</div><div className="value">{data?.database.integrity || "..."}</div></article><article className="card metric"><div className="label">{isArabic ? "حجم القاعدة" : "Database size"}</div><div className="value">{data ? `${(data.database.sizeBytes / 1024 / 1024).toFixed(1)} MB` : "..."}</div></article><article className="card metric"><div className="label">{isArabic ? "نسخ احتياطية" : "Backups"}</div><div className="value">{data?.backups.length ?? "..."}</div></article></section>
    <section className="grid two admin-health-layout">
      <article className="panel"><h2>{isArabic ? "النسخ الاحتياطية المحلية" : "Local backups"}</h2>{data?.backups.map((backup) => <div className="row" key={backup.name}><b>{backup.name}</b><span>{(backup.sizeBytes / 1024 / 1024).toFixed(1)} MB</span></div>)}</article>
      <article className="panel"><h2>{isArabic ? "الإدارة" : "Administration"}</h2><p className="muted">{isArabic ? "إدارة المستخدمين والصلاحيات والإعدادات والتدقيق تظل ضمن واجهة المدير الحالية." : "Users, permissions, settings, audit, backup and restore stay in the existing Manager interface."}</p><div className="actions"><Link className="button-link" href="/manager">{isArabic ? "فتح واجهة المدير" : "Open Manager"}</Link><button onClick={load}>{isArabic ? "إعادة فحص السلامة" : "Run health check"}</button></div></article>
    </section>
    <section className="panel operations-audit-feed"><div className="operations-profile-head"><div><h2>{isArabic ? "آخر تغييرات التشغيل" : "Latest operations changes"}</h2><span>{isArabic ? "من سجل التدقيق الفعلي" : "From the real audit trail"}</span></div></div>{data?.recentOperations?.length ? data.recentOperations.map((item) => <div className="row" key={item.id}><span><b>{item.summary}</b><small>{item.action} · {item.user}</small></span><time>{new Intl.DateTimeFormat(isArabic ? "ar-EG" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></div>) : <p className="muted">{isArabic ? "لا توجد تغييرات تشغيلية مسجلة" : "No operational changes recorded"}</p>}</section>
  </section>;
}
