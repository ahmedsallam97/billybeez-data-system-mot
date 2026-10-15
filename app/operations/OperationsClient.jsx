"use client";
import { OperationalError } from "../ui/OperationalFeedback";
import { useUiText } from '@/app/i18n';
import {PageHeader,FilterBar} from '../ui/DesktopLayout';
import ActionButton from "@/app/ActionButton";
import {usePermission} from '@/app/account/AccountContext';
import layoutFixes from "./ComponentLayout.module.css";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import Employee360View from "./Employee360View";
import EmployeeRemovalDialog from "./EmployeeRemovalDialog";
import { readApiResponse } from "@/lib/client/read-api-response";
import { useSearchParams } from "next/navigation";
import { useOperationsUi } from "./OperationsUiContext";

function dateOnly(value) {
  return value ? String(value).slice(0, 10) : "—";
}

export default function OperationsClient({ preview = false, module = "employees" }) {
  const localize = useUiText();
  const { isArabic } = useI18n();
  const viewDetails=usePermission('employees.details');
  const canRemove=usePermission('employees.archive'), canRestore=usePermission('employees.restore');
  const searchParams = useSearchParams();
  const { userId } = useOperationsUi();
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [removalTarget, setRemovalTarget] = useState(null), [notice, setNotice] = useState('');
  const employeeRequest = useRef(0);
  const requestedEmployeeId = useRef("");
  const selectedEmployeeRef = useRef(null);
  const updateSelected = employee => { selectedEmployeeRef.current = employee; setSelected(employee); };
  useEffect(()=>{requestedEmployeeId.current=searchParams.get('employeeId')||'';if(requestedEmployeeId.current)loadEmployees();},[searchParams]);
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
      const payload = await readApiResponse(response, "Employee list could not be loaded");
      setEmployees(payload.employees);
      const requestedEmployee = requestedEmployeeId.current && payload.employees.find((item) => item.id === requestedEmployeeId.current);
      const currentEmployee = selectedEmployeeRef.current;
      const selectedIsVisible = currentEmployee && payload.employees.some((item) => item.id === currentEmployee.id);
      const targetEmployee = requestedEmployee || (selectedIsVisible ? null : payload.employees[0]);
      if (currentEmployee && !selectedIsVisible && !targetEmployee) updateSelected(null);
      if (viewDetails && targetEmployee && currentEmployee?.id !== targetEmployee.id) {
        const detailResponse = await fetch(`/api/operations/employees/${targetEmployee.id}/360`);
        const detail = await readApiResponse(detailResponse, "Employee profile could not be loaded");
        updateSelected(detail.employee);
        if (requestedEmployee) requestedEmployeeId.current = "";
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, [query, status, selected, viewDetails]);

  useEffect(() => {
    const timer = setTimeout(loadEmployees, 180);
    return () => clearTimeout(timer);
  }, [query, status]);

  async function openEmployee(id) {
    if(!viewDetails)return;
    const requestNumber = ++employeeRequest.current;
    setError("");
    try {
      const response = await fetch(`/api/operations/employees/${id}/360`);
      const payload = await readApiResponse(response, "Employee profile could not be loaded");
      if (requestNumber !== employeeRequest.current) return;
      updateSelected(payload.employee);
      const url = new URL(window.location.href);
      url.searchParams.delete("tab");
      url.searchParams.set("employeeId", id);
      window.history.replaceState({}, "", url);
    } catch (requestError) {
      if (requestNumber === employeeRequest.current) setError(requestError.message);
    }
  }

  return (
    <section className={`operations-shell ${layoutFixes.scope}`}>
      <div className="operations-content">

      <PageHeader title={text.employees} description={`${employees.length} ${isArabic?"ملف موظف":"employee profiles"}`} />
      <FilterBar>
        <label><span>{isArabic?"البحث":localize("Search employees")}</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={text.search} />
        </label><label><span>{isArabic?"الحالة":localize("Status")}</span><select aria-label={text.all} value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="ALL">{text.all}</option><option value="ACTIVE">{text.active}</option>
          <option value="INACTIVE">{text.inactive}</option><option value="EXITED">{text.exited}</option>
          <option value="ARCHIVED">{isArabic ? 'المؤرشفون' : localize("Archived")}</option>
        </select>
        </label><label className="ui-filter-wide"><span>{isArabic?"الموظف":localize("Employee")}</span><select className="employee-directory-picker" aria-label={isArabic ? "اختيار الموظف" : localize("Select employee")} value={selected?.id || ""} onChange={(event) => event.target.value && openEmployee(event.target.value)} disabled={loading || !employees.length || !viewDetails}>
          <option value="">{loading ? text.loading : text.select}</option>
          {employees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name} · {employee.hrisNumber || employee.localEmployeeCode || employee.jobTitle || "—"}</option>)}
        </select>
        </label><ActionButton onClick={loadEmployees}>{text.refresh}</ActionButton>
        {selected && !preview && (status === 'ARCHIVED' ? canRestore : canRemove) && <ActionButton className={status === 'ARCHIVED' ? 'secondary' : 'danger'} onClick={() => setRemovalTarget({ ...selected, restore: status === 'ARCHIVED' })}>{status === 'ARCHIVED' ? (isArabic ? 'استعادة الموظف' : 'Restore employee') : (isArabic ? 'حذف الموظف' : 'Delete employee')}</ActionButton>}
      </FilterBar>
      <OperationalError error={error}/>
      {notice && <p role="status" className="alert success">{notice}</p>}
      {removalTarget && <EmployeeRemovalDialog employee={removalTarget} restore={removalTarget.restore} onClose={() => setRemovalTarget(null)} onSaved={result => {
        ++employeeRequest.current; requestedEmployeeId.current=''; updateSelected(null); setRemovalTarget(null);
        setNotice(result.outcome === 'deleted' ? (isArabic ? 'تم حذف الموظف بدون سجلات مرتبطة.' : 'Employee deleted; no related records existed.') : result.outcome === 'archived' ? (isArabic ? 'تمت أرشفة الموظف وإخفاؤه من القائمة. سجلاته وملفاته محفوظة.' : 'Employee archived and hidden; records and files preserved.') : (isArabic ? 'تمت استعادة الموظف بحالته السابقة.' : 'Employee restored with their previous status.'));
        loadEmployees();
      }} />}
      <section className="operations-profile employee-directory-profile">
        {selected && <Employee360View key={selected.id} employee={selected} onReload={() => openEmployee(selected.id)} />}
        {!selected && <div className="panel muted">{loading ? text.loading : employees.length ? text.select : text.noData}</div>}
      </section>
      </div>
    </section>
  );
}

