"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";
import OperationsDashboard from "./OperationsDashboard";
import ScheduleWorkspace from "./ScheduleWorkspace";
import DailyWorkspace from "./DailyWorkspace";
import LeaveTimeWorkspace from "./LeaveTimeWorkspace";
import PerformanceWorkspace from "./PerformanceWorkspace";
import AdminHealthWorkspace from "./AdminHealthWorkspace";
import Employee360View from "./Employee360View";
import DailyApprovalPreview from "./daily-preview/DailyApprovalPreview";
import DailySetupWorkspace from "./DailySetupWorkspace";

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : "—";
}

export default function OperationsClient() {
  const { isArabic } = useI18n();
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("roster");
  const [navigationOpen, setNavigationOpen] = useState(true);
  const tabKeys = ["roster", "daily", "evaluation", "schedule", "trips", "birthdays", "offers", "stock", "time", "employees", "performance", "dashboard", "rosterSettings", "admin"];

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (tabKeys.includes(requestedTab)) setTab(requestedTab);
  }, []);
  function navigate(nextTab) {
    if (!tabKeys.includes(nextTab)) return;
    setTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.replaceState({}, "", url);
  }

  const text = useMemo(() => isArabic ? {
    employees: "ملفات الموظفين 360°", search: "بحث بالاسم أو الرقم", all: "كل الحالات",
    active: "نشط", inactive: "غير نشط", exited: "ترك العمل", loading: "جارٍ التحميل...",
    noData: "لا توجد بيانات", select: "اختر موظفًا لعرض الملف", identifier: "الرقم الوظيفي",
    type: "نوع التوظيف", title: "المسمى الوظيفي", periods: "فترات العمل", assignments: "التعيينات",
    schedules: "خلايا الجدول", attendance: "سجلات الحضور", appraisals: "التقييمات الشهرية",
    profile: "الملف الأساسي", national: "الرقم القومي", hire: "تاريخ التعيين", join: "تاريخ الانضمام",
    history: "السجل الوظيفي", current: "الحالي", refresh: "تحديث",
  } : {
    employees: "Employee 360 profiles", search: "Search name or employee number", all: "All statuses",
    active: "Active", inactive: "Inactive", exited: "Exited", loading: "Loading...",
    noData: "No data", select: "Select an employee to view the profile", identifier: "Employee number",
    type: "Employment type", title: "Job title", periods: "Employment periods", assignments: "Assignments",
    schedules: "Schedule cells", attendance: "Attendance records", appraisals: "Monthly appraisals",
    profile: "Core profile", national: "National ID", hire: "Hire date", join: "Join date",
    history: "Employment history", current: "Current", refresh: "Refresh",
  }, [isArabic]);

  const loadEmployees = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("q", query.trim());
      if (status !== "ALL") params.set("status", status);
      const response = await fetch(`/api/operations/employees?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Request failed");
      setEmployees(payload.employees);
      if (selected && !payload.employees.some((item) => item.id === selected.id)) setSelected(null);
      if (!selected && payload.employees[0]) {
        const detailResponse = await fetch(`/api/operations/employees/${payload.employees[0].id}/360`);
        const detail = await detailResponse.json();
        if (detailResponse.ok) setSelected(detail.employee);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [query, status, selected]);

  useEffect(() => {
    const timer = setTimeout(loadEmployees, 180);
    return () => clearTimeout(timer);
  }, [query, status]);

  async function openEmployee(id) {
    setError("");
    const response = await fetch(`/api/operations/employees/${id}/360`);
    const payload = await response.json();
    if (!response.ok) return setError(payload.error || "Request failed");
    setSelected(payload.employee);
  }

  const tabs = isArabic
    ? [["roster", "01", "الروستر اليومي", "الطباعة والروتيشن"], ["daily", "02", "الحضور", "حضور اليوم"], ["evaluation", "03", "التقييم اليومي", "الأداء والمظهر"], ["schedule", "04", "الجدول الشهري", "جدول الفريق"], ["trips", "05", "الرحلات", "المدارس والأكاديميات"], ["birthdays", "06", "أعياد الميلاد", "الحجوزات والوجبات"], ["offers", "07", "العروض", "المواعيد والتفاصيل"], ["stock", "08", "الستوك", "البريسلت والشرابات والرولات"], ["time", "09", "الإجازات والوقت", "الطلبات والأرصدة"], ["employees", "10", "الموظفون", "ملفات 360°"], ["performance", "11", "الأداء والتقدير", "التقييم والجوائز"]]
    : [["roster", "01", "Daily Roster", "Print and rotations"], ["daily", "02", "Attendance", "Today's attendance"], ["evaluation", "03", "Daily Evaluation", "Performance and grooming"], ["schedule", "04", "Monthly Schedule", "Team schedule"], ["trips", "05", "Trips", "Schools and academies"], ["birthdays", "06", "Birthdays", "Bookings and meals"], ["offers", "07", "Offers", "Timing and details"], ["stock", "08", "Stock", "Bracelets, socks and rolls"], ["time", "09", "Leave & Time", "Requests and balances"], ["employees", "10", "Employees", "Employee 360"], ["performance", "11", "Performance & Recognition", "Reviews and awards"]];

  return (
    <section className={`operations-shell ${navigationOpen ? "operations-nav-open" : "operations-nav-collapsed"}`}>
      <nav className="operations-main-nav" aria-label={isArabic ? "أقسام العمليات" : "Operations areas"}>
        <button className="operations-nav-toggle" type="button" aria-label={isArabic ? "فتح أقسام العمليات" : "Open operations areas"} aria-expanded={navigationOpen} onClick={() => setNavigationOpen((value) => !value)}><span aria-hidden="true">☰</span><i>{isArabic ? "أقسام العمليات" : "Operations areas"}</i></button>
        {navigationOpen && tabs.map(([key, number, label, description]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => navigate(key)}><small>{number}</small><b>{label}</b><span>{description}</span></button>)}
      </nav>
      <div className="operations-content">
      {tab === "roster" && <DailyApprovalPreview />}
      {tab === "trips" && <DailySetupWorkspace section="trips" />}
      {tab === "birthdays" && <DailySetupWorkspace section="birthdays" />}
      {tab === "offers" && <DailySetupWorkspace section="offers" />}
      {tab === "stock" && <DailySetupWorkspace section="stock" />}
      {tab === "rosterSettings" && <DailySetupWorkspace section="rosterSettings" />}
      {tab === "dashboard" && <OperationsDashboard onNavigate={navigate} />}
      {tab === "schedule" && <ScheduleWorkspace />}
      {tab === "daily" && <DailyWorkspace initialView="attendance" />}
      {tab === "evaluation" && <DailyWorkspace initialView="evaluation" />}
      {tab === "time" && <LeaveTimeWorkspace />}
      {tab === "performance" && <PerformanceWorkspace />}
      {tab === "admin" && <AdminHealthWorkspace />}
      {tab === "employees" && <>
      <section className="panel operations-toolbar">
        <div><h2>{text.employees}</h2><span className="muted">{employees.length}</span></div>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.search} />
        <select aria-label={text.all} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="ALL">{text.all}</option><option value="ACTIVE">{text.active}</option>
          <option value="INACTIVE">{text.inactive}</option><option value="EXITED">{text.exited}</option>
        </select>
        <button onClick={loadEmployees}>{text.refresh}</button>
      </section>
      {error && <div className="alert danger">{error}</div>}
      <div className="operations-workspace">
        <section className="panel operations-employee-list">
          {loading ? <div className="muted">{text.loading}</div> : employees.length ? employees.map((employee) => (
            <button className={`operations-employee-row ${selected?.id === employee.id ? "active" : ""}`} key={employee.id} onClick={() => openEmployee(employee.id)}>
              <b>{employee.name}</b><span>{employee.nameAr || "—"}</span>
              <small>{employee.hrisNumber || employee.localEmployeeCode || "—"} · {employee.jobTitle || "—"}</small>
            </button>
          )) : <div className="muted">{text.noData}</div>}
        </section>
        <section className="operations-profile">
          {selected && <Employee360View employee={selected} onReload={() => openEmployee(selected.id)} />}
          {!selected && <div className="muted">{text.select}</div>}
        </section>
      </div>
      </>}
      </div>
    </section>
  );
}
