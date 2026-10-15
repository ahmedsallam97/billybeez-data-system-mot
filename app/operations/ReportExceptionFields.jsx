"use client";
import ActionButton from "../ActionButton";
import styles from "./OperationalReportsWorkspace.module.css";

const sections = [["staffing", "Staffing and attendance", "الفريق والحضور"], ["coverage", "Coverage and actions", "التغطية والإجراءات"], ["cleanliness", "Cleanliness", "النظافة"], ["communication", "Communication", "التواصل"], ["handover", "Handover quality", "جودة تسليم الشيفت"], ["leaderPerformance", "Leader performance", "أداء قائد الفريق"], ["managerComments", "Manager comments", "ملاحظات المدير"]];
const categories = [["COMPLAINT", "Customer complaint", "شكوى عميل"], ["INCIDENT", "Incident", "واقعة"], ["CLEANLINESS", "Cleanliness complaint", "شكوى نظافة"], ["SUPERVISOR", "Trip supervisor problem", "مشكلة مع مشرف الرحلة"], ["COVERAGE", "Coverage problem", "مشكلة تغطية"], ["OTHER", "Other follow-up", "متابعة أخرى"]];

export default function ReportExceptionFields({ draft, setDraft, ar, disabled, employees, reportType }) {
  const t = (en, arabic) => ar ? arabic : en;
  const issues = draft.unresolvedIssues || [];
  const update = (index, patch) => setDraft(current => ({ ...current, unresolvedIssues: current.unresolvedIssues.map((issue, position) => position === index ? { ...issue, ...patch } : issue) }));
  return <>
    {reportType === "SHIFT_LEADERSHIP" && <details className={styles.disclosure}><summary>{t("Shift review · staffing, handover and leadership", "مراجعة الشيفت · الفريق والتسليم والقيادة")}</summary><div className={styles.fieldGrid}>{sections.map(([key, en, arabic]) => <label key={key}>{t(en, arabic)}<textarea aria-label={t(en, arabic)} disabled={disabled} value={draft.sections?.[key] || ""} onChange={event => setDraft(current => ({ ...current, sections: { ...current.sections, [key]: event.target.value } }))} /></label>)}</div></details>}
    <details className={styles.disclosure} open={issues.length > 0}><summary>{t("Exceptions and resolutions", "المشكلات والحلول")} {issues.length ? `(${issues.length})` : t("· none recorded", "· لا توجد مشكلات مسجلة")}</summary>
      <p className={styles.help}>{t("Add an exception only when it occurred. Name the responsible employee and record the action, leader intervention and resolution.", "أضف المشكلة عند حدوثها فقط، وحدد الموظف المسؤول والإجراء وتدخل القائد والحل.")}</p>
      {issues.map((issue, index) => <article className={styles.exception} key={issue.id || index}><div className={styles.fieldGrid}>
        <label>{t("Type", "النوع")}<select aria-label={`${t("Issue type", "نوع المشكلة")} ${index + 1}`} value={issue.category || "OTHER"} disabled={disabled} onChange={event => update(index, { category: event.target.value })}>{categories.filter(([code]) => reportType === "TRIP" || code !== "SUPERVISOR").map(([code, en, arabic]) => <option key={code} value={code}>{t(en, arabic)}</option>)}</select></label>
        <label>{t("Responsible employee", "الموظف المسؤول")}<select aria-label={`${t("Issue employee", "الموظف المرتبط بالمشكلة")} ${index + 1}`} disabled={disabled} value={issue.employeeId || ""} onChange={event => update(index, { employeeId: event.target.value || null })}><option value="">{t("Not specified", "غير محدد")}</option>{employees.map(row => <option key={row.employeeId} value={row.employeeId}>{ar ? row.employee?.nameAr || row.employee?.name : row.employee?.nameEn || row.employee?.name || row.employeeId}</option>)}</select></label>
        <label className={styles.full}>{t("What happened?", "ما الذي حدث؟")}<textarea aria-label={`${t("Issue description", "وصف المشكلة")} ${index + 1}`} disabled={disabled} value={issue.description || ""} onChange={event => update(index, { description: event.target.value })} /></label>
        <label>{t("Action taken", "الإجراء المتخذ")}<textarea aria-label={`${t("Issue action", "إجراء المشكلة")} ${index + 1}`} disabled={disabled} value={issue.action || ""} onChange={event => update(index, { action: event.target.value })} /></label>
        <label>{t("Leader intervention", "تدخل قائد الفريق")}<textarea aria-label={`${t("Leader intervention", "تدخل قائد الفريق")} ${index + 1}`} disabled={disabled} value={issue.leaderIntervention || ""} onChange={event => update(index, { leaderIntervention: event.target.value })} /></label>
        <label className={styles.check}><input type="checkbox" disabled={disabled} checked={Boolean(issue.resolved)} onChange={event => update(index, { resolved: event.target.checked })} />{t("Resolved", "تم الحل")}</label>
        {issue.resolved && <label>{t("Resolution", "الحل")}<textarea aria-label={`${t("Issue resolution", "حل المشكلة")} ${index + 1}`} disabled={disabled} value={issue.resolution || ""} onChange={event => update(index, { resolution: event.target.value })} /></label>}
      </div>{!disabled && <ActionButton className="secondary" type="button" onClick={() => setDraft(current => ({ ...current, unresolvedIssues: current.unresolvedIssues.filter((_, position) => position !== index) }))}>{t("Remove exception", "إزالة المشكلة")}</ActionButton>}</article>)}
      {!disabled && <ActionButton type="button" className="secondary" onClick={() => setDraft(current => ({ ...current, unresolvedIssues: [...(current.unresolvedIssues || []), { id: crypto.randomUUID(), category: "OTHER", description: "", resolved: false, resolution: "" }] }))}>{t("Add exception", "إضافة مشكلة")}</ActionButton>}
    </details>
    <label className={styles.full}>{t("Guest comments", "تعليقات الضيوف")}<textarea aria-label={t("Guest comments", "تعليقات الضيوف")} disabled={disabled} value={draft.guestComments || ""} onChange={event => setDraft(current => ({ ...current, guestComments: event.target.value }))} /></label>
  </>;
}
