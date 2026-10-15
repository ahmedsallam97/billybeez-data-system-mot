"use client";
import { useI18n } from "../i18n";
import { ProfilePanel } from "./EmployeeProfileCards";
import { workspaceLabel } from "@/lib/operations/succession-workspace";

export default function EmployeeReportEvidence({ employee, endDate, year }) {
  const { isArabic: ar } = useI18n();
  const t = (en, arabic) => ar ? arabic : en;
  if (employee.sectionPermissions?.['reports.view'] === false) return null;
  const records = (employee.operationalEvidence || []).filter(row => !endDate || row.date <= endDate && row.date.slice(0, 4) === String(year));
  return <ProfilePanel title={t("Approved event evidence", "أدلة الأحداث المعتمدة")}>
    <p className="muted">{t("Approved reports show the employee's actual responsibility. Event points flow once through the daily result; attendance is not deducted again.", "التقارير المعتمدة توضح مسؤولية الموظف الفعلية. نقاط الحدث تنتقل مرة واحدة عبر التقييم اليومي ولا يُخصم الحضور مرة أخرى.")}</p>
    {!records.length && <p>{t("No approved event evidence for this employee in the selected period.", "لا توجد أدلة أحداث معتمدة لهذا الموظف في الفترة المختارة.")}</p>}
    {records.map(row => <details key={row.id}><summary>{workspaceLabel(row.reportType, ar)} · {row.sourceName} · <time dir="ltr">{row.date}</time> · {workspaceLabel(row.role, ar)}</summary><div>
      <p>{t("Approval", "الاعتماد")}: <time dir="ltr">{row.approvedAt?.slice(0, 10)}</time> · {t("Revision", "النسخة")}: {row.revision}</p>
      <ul>{row.adjustments.map(adjustment => <li key={adjustment.id}><b dir="ltr">{adjustment.points == null ? "—" : `${adjustment.points > 0 ? "+" : ""}${adjustment.points}`}</b> {t("points", "نقطة")} · {adjustment.comment || "—"}</li>)}</ul>
      {row.guestComments && <p>{t("Guest comments", "تعليقات الضيوف")}: {row.guestComments}</p>}
      {row.issues.map((issue, index) => <p key={index}>{issue.description} · {issue.resolved ? t("Resolved", "تم الحل") : t("Follow-up required", "تحتاج متابعة")}{issue.resolution ? ` · ${issue.resolution}` : ""}</p>)}
      <a href={`/operations/reports/operational?date=${row.date}&reportId=${encodeURIComponent(row.id)}`}>{t("Open source report", "فتح التقرير المصدر")}</a>
    </div></details>)}
  </ProfilePanel>;
}
