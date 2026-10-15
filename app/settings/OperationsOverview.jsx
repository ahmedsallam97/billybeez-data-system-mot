import {PAGES} from '@/lib/operations/page-routes';
import {PageHeader} from '../ui/DesktopLayout';
import Link from "next/link";
import { defaultDashboardSettings, filterAttention } from "@/lib/operations/dashboard-settings";
import styles from "./OperationsDashboard.module.css";

function Icon({ name, className = "" }) {
  const paths = {
    team: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v3" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2m-8 3h2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    review: <><rect x="5" y="4" width="14" height="17" rx="3" /><path d="M9 4V2h6v2M9 11l2 2 4-4m-6 8h6" /></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 3v1" /></>,
    box: <><path d="m12 3 9 5v9l-9 5-9-5V8Zm0 10 9-5M12 13 3 8m9 5v9M7 5l10 6" /></>,
    shield: <><path d="M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6Z" /><path d="m8 12 3 3 5-6" /></>,
  };
  return <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.arrow}</svg>;
}

const actionLabels = {
  SCHEDULE_NOT_PUBLISHED: ["انشر جدول اليوم", "Publish today's schedule", "فتح الجدول", "Open schedule"],
  ATTENDANCE_NOT_STARTED: ["ابدأ متابعة حضور اليوم", "Today's attendance needs attention", "فتح الحضور", "Open attendance"],
  MISSING_ATTENDANCE: ["راجع سجلات الحضور الناقصة", "Review missing attendance", "مراجعة الحضور", "Review attendance"],
  APPRAISALS_PENDING: ["تقييمات تنتظر مراجعتك", "Appraisals awaiting review", "مراجعة التقييمات", "Review appraisals"],
  LEAVE_REQUESTS_PENDING: ["طلبات إجازة تنتظر القرار", "Leave requests awaiting a decision", "مراجعة الطلبات", "Review requests"],
  EMPLOYEE_STATUS_MISMATCH: ["راجع حالة ملفات الموظفين", "Review employee status", "فتح الموظفين", "Open employees"],
  LOW_STOCK: ["راجع الأصناف منخفضة المخزون", "Check low-stock items", "فتح المخزون", "Open stock"],
};
const arabicMessages = {
  SCHEDULE_NOT_PUBLISHED: "لا يوجد جدول منشور يغطي اليوم.",
  ATTENDANCE_NOT_STARTED: "الجدول منشور. افتح الحضور لمراجعة فريق اليوم وتسجيل الحضور الفعلي.",
  MISSING_ATTENDANCE: "توجد سجلات حضور تحتاج إلى استكمال أو مراجعة.",
  APPRAISALS_PENDING: "توجد تقييمات شهرية تنتظر المراجعة أو الاعتماد.",
  LEAVE_REQUESTS_PENDING: "راجع الطلبات المسجلة قبل اتخاذ القرار.",
  EMPLOYEE_STATUS_MISMATCH: "توجد ملفات موظفين بحالة نشاط غير متطابقة.",
  LOW_STOCK: "توجد أصناف وصلت إلى حد التنبيه المسجل.",
};

export default function OperationsOverview({ summary, health, isArabic, actionHref, section, config = defaultDashboardSettings() }) {
  const text = (ar, en) => isArabic ? ar : en;
  const metrics = summary?.metrics || {};
  const planning = summary?.planning || {};
  const attention = filterAttention(summary?.attention || [], config);
  const dayQuery = summary?.today ? `?date=${encodeURIComponent(summary.today)}` : "";
  const dateLabel = summary?.today ? new Intl.DateTimeFormat(isArabic ? "ar-EG" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${summary.today}T12:00:00Z`)) : "";
  const attendanceStatus = summary?.attendanceDay?.status;
  const attendanceLabels = { OPEN: text("مفتوح", "Open"), REOPENED: text("أعيد فتحه", "Reopened"), FINALIZED: text("مكتمل", "Finalized") };
  const attendanceLabel = attendanceStatus ? attendanceLabels[attendanceStatus] || attendanceStatus : text("لم يبدأ", "Not started");
  const pendingReview = (metrics.draftAppraisals || 0) + (metrics.draftLeaveRequests || 0);
  const reviewItem = attention.find(item => item.code === "APPRAISALS_PENDING") || attention.find(item => item.code === "LEAVE_REQUESTS_PENDING");
  const cards = [
    { key: "team", icon: "team", label: text("الفريق النشط", "Active team"), value: metrics.activeEmployees || 0, detail: text(`${metrics.hrisEmployees || 0} موظفي HRIS · ${metrics.partTimeEmployees || 0} دوام جزئي`, `${metrics.hrisEmployees || 0} HRIS · ${metrics.partTimeEmployees || 0} part-time`), action: text("استعرض فريقك", "Explore your team"), href: "/operations/employees", featured: true },
    { key: "attendance", icon: "clock", label: text("حضور اليوم", "Today's attendance"), value: attendanceLabel, detail: text(`${summary?.attendanceDay?.records || 0} سجل حضور لليوم`, `${summary?.attendanceDay?.records || 0} attendance records today`), action: text("متابعة الحضور", "Manage attendance"), href: `/operations/attendance${dayQuery}`, status: true },
    { key: "bookings", icon: "calendar", label: text("حجوزات الأسبوع", "Bookings this week"), value: planning.upcomingBookings || 0, detail: text(`${planning.upcomingTrips || 0} رحلات · ${planning.upcomingEvents || 0} أعياد ميلاد · ${planning.expectedGuests || 0} ضيوف`, `${planning.upcomingTrips || 0} trips · ${planning.upcomingEvents || 0} birthdays · ${planning.expectedGuests || 0} guests`), action: text("التخطيط للحجوزات", "Plan bookings"), href: "/operations/trips" },
    { key: "reviews", icon: "review", label: text("بانتظار المراجعة", "Awaiting review"), value: pendingReview, detail: text(`${metrics.draftAppraisals || 0} تقييمات · ${metrics.draftLeaveRequests || 0} طلبات إجازة`, `${metrics.draftAppraisals || 0} appraisals · ${metrics.draftLeaveRequests || 0} leave requests`), action: text("فتح المراجعات", "Open reviews"), href: reviewItem ? actionHref(reviewItem) : "/operations/evaluations/monthly" },
  ];
  const healthy = ["ok", "reachable"].includes(health?.database?.integrity);
  const backup = health?.backups?.[0];
  const statusRows = [
    { key: "schedule", icon: "calendar", label: text("جدول اليوم", "Today's schedule"), value: summary?.currentSchedule ? text("منشور", "Published") : text("غير منشور", "Not published"), good: Boolean(summary?.currentSchedule), detail: summary?.currentSchedule ? `${summary.currentSchedule.operationalMonth} / ${summary.currentSchedule.operationalYear}` : text("يحتاج إلى متابعة", "Needs attention"), href: "/operations/schedule" },
    { key: "stock", icon: "box", label: text("المخزون", "Stock"), value: planning.lowStock ? text(`${planning.lowStock} تنبيهات`, `${planning.lowStock} alerts`) : text("لا توجد تنبيهات", "No alerts"), good: !planning.lowStock, detail: text("مستويات المخزون المسجلة", "Recorded stock levels"), href: "/operations/stock" },
    { key: "health", icon: "shield", label: text("سلامة النظام", "System health"), value: healthy ? text("سليم", "Healthy") : text("يحتاج مراجعة", "Needs review"), good: healthy, detail: backup ? text(`آخر نسخة: ${new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium" }).format(new Date(backup.modifiedAt))}`, `Backup: ${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(backup.modifiedAt))}`) : text("لا توجد نسخة احتياطية مسجلة", "No recorded backup"), href: "/opmanager/settings?category=safety" },
  ];

  const visibleCards = config.dashboard.cards.filter(item => item.visible).map(item => cards.find(card => card.key === item.id) || { ...statusRows.find(row => row.key === item.id), status: true, action: text("عرض التفاصيل", "View details") });
  const canLink = config.dashboard.showDetailLinks;
  if (section === "header") return <>
    <PageHeader title={text(config.dashboard.titleAr,config.dashboard.titleEn)} description={text(config.dashboard.subtitleAr,config.dashboard.subtitleEn)} context={attention.length>0?<span>{text(`${attention.length} إجراء يحتاج المتابعة`,`${attention.length} action${attention.length===1?"":"s"} require review`)} · {canLink&&attention[0].target?<Link href={actionHref(attention[0])}>{(actionLabels[attention[0].code]||[])[isArabic?0:1]||attention[0].title||attention[0].message}</Link>:attention[0].title||attention[0].message}</span>:undefined} actions={<><time dateTime={summary?.today}><Icon name="calendar" />{dateLabel}</time><Link className={styles.primaryButton} href={`/operations/daily${dayQuery}`}>{text("فتح الروستر اليومي", "Open daily roster")}<Icon name="arrow" className={styles.arrow} /></Link></>}/>

  </>;
  if (section === "pulse") return <section data-layout={config.dashboard.pulseLayout} className={styles.metricGrid} aria-label={text("نظرة على العمليات", "Operations overview")}>
      {visibleCards.map(card => {
        const Tag = canLink ? Link : "article";
        return <Tag {...(canLink ? { href: card.href } : {})} data-card={card.key} className={`${styles.metricCard} ${card.featured ? styles.featuredCard : ""}`} key={card.key}>
          <div key="top" className={styles.metricTop}><span>{card.label}</span><span className={styles.metricIcon}><Icon name={card.icon} /></span></div>
          <strong key="value" className={card.status ? styles.statusValue : styles.metricValue}>{card.value}</strong>
          {config.dashboard.showDescriptions && <p key="description">{card.detail}</p>}{canLink && <span key="action" className={styles.cardAction}>{card.action}<Icon name="arrow" className={styles.arrow} /></span>}
        </Tag>;
      })}
    </section>;
    if (section !== "attention") return null;
    return <>

      <section data-attention-display={config.attention.display} className={styles.priorityPanel} aria-labelledby="operations-priorities-heading">
        <header className={styles.sectionHeader}><div><span className={styles.eyebrow}>{text("الخطوة التالية", "YOUR NEXT STEP")}</span><h2 id="operations-priorities-heading">{text("يحتاج انتباهك", "Needs your attention")}</h2></div><span className={styles.countBadge}>{attention.length}</span></header>
        <div className={styles.actionList}>
          {attention.length ? attention.map(item => {
            const labels = actionLabels[item.code];
            return <article className={styles.actionRow} key={item.code} data-severity={item.severity}>
              <span className={styles.actionIcon}><Icon name="alert" /></span>
              <div className={styles.actionBody}><h3>{labels ? labels[isArabic ? 0 : 1] : item.title || item.message}</h3><p>{isArabic ? arabicMessages[item.code] || item.message : item.message}</p>
                {canLink && item.target && <Link className={styles.actionLink} href={actionHref(item)}>{labels ? labels[isArabic ? 2 : 3] : text("عرض التفاصيل", "View details")}<Icon name="arrow" className={styles.arrow} /></Link>}
              </div>
            </article>;
          }) : <div className={styles.allClear}><Icon name="check" /><div><h3>{summary?.attention?.length ? text("لا توجد تنبيهات تطابق الفلاتر", "No alerts match your filters") : text("كل شيء تحت المتابعة", "You're up to date")}</h3><p>{text("من واقع البيانات المسجلة في النظام.", "Based on recorded Operations data.")}</p></div></div>}
        </div>
        {canLink && <nav className={styles.quickLinks} aria-label={text("روابط سريعة", "Quick links")}>{[["schedule", "calendar", "الجدول الشهري", "Monthly schedule"], ["employees", "team", "ملفات الموظفين", "Employee files"], ["performance", "review", "الأداء والتقييمات", "Performance"]].filter(([id]) => config.navigation.items.some(item => item.id === id && item.visible)).map(([id, icon, ar, en]) => <Link key={id} href={PAGES[id][0]}><Icon name={icon} />{text(ar, en)}</Link>)}</nav>}
      </section>

  </>;
}
