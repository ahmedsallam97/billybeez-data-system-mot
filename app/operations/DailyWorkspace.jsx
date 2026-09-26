"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useI18n } from "../i18n";
import DailyEvaluationPanel from "./DailyEvaluationPanel";
import { formatTime12 } from "@/lib/operations/roster";

const STATUSES = [
  "PRESENT",
  "LATE",
  "ABSENT",
  "EARLY_LEAVE",
  "LEAVE",
  "REPLACEMENT_LEAVE",
  "SICK_LEAVE",
  "HOLIDAY",
  "OFF",
  "UNEXPECTED_PRESENT",
  "MISSING",
];
const todayCairo = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const addDays = (v, n) => {
  const d = new Date(`${v}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
function Empty({ children }) {
  return <div className="daily-empty">{children}</div>;
}
function AttendanceRow({ record, finalized, onSave }) {
  const [d, setD] = useState({
    status: record.status,
    actualIn: record.actualIn || "",
    actualOut: record.actualOut || "",
    note: record.note || "",
    reason: "",
  });
  useEffect(
    () =>
      setD({
        status: record.status,
        actualIn: record.actualIn || "",
        actualOut: record.actualOut || "",
        note: record.note || "",
        reason: "",
      }),
    [record],
  );
  return (
    <tr>
      <td>
        <b>{record.employee.name}</b>
      </td>
      <td>
        {record.expectedCode}
        <small className="block">
          {formatTime12(record.expectedStart)} —{" "}
          {formatTime12(record.expectedEnd)}
        </small>
      </td>
      <td>
        <select
          aria-label={`${record.employee.name} attendance status`}
          value={d.status}
          onChange={(e) => setD({ ...d, status: e.target.value })}
        >
          {STATUSES.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </td>
      <td>
        <input
          type="time"
          value={d.actualIn}
          onChange={(e) => setD({ ...d, actualIn: e.target.value })}
        />
      </td>
      <td>
        <input
          type="time"
          value={d.actualOut}
          onChange={(e) => setD({ ...d, actualOut: e.target.value })}
        />
      </td>
      <td>
        <input
          value={d.note}
          placeholder="Note"
          onChange={(e) => setD({ ...d, note: e.target.value })}
        />
        {finalized && (
          <input
            required
            value={d.reason}
            placeholder="Correction reason"
            onChange={(e) => setD({ ...d, reason: e.target.value })}
          />
        )}
      </td>
      <td>
        <button onClick={() => onSave(record, d)}>Save</button>
      </td>
    </tr>
  );
}
export default function DailyWorkspace({ initialView = "attendance" }) {
  const { isArabic } = useI18n();
  const today = todayCairo();
  const evaluationMode = initialView === "evaluation";
  const [date, setDate] = useState(today);
  const [daily, setDaily] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const auto = useRef(new Set());

  async function responseJson(response, fallback) {
    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { /* use fallback */ }
    if (!response.ok || !payload) throw new Error(payload?.error || fallback);
    return payload;
  }

  async function load() {
    setBusy(true);
    setError("");
    try {
      const dailyRequest = fetch(`/api/operations/daily?date=${date}`).then((response) => responseJson(response, "Daily operations could not be loaded"));
      const attendanceRequest = !evaluationMode && date === today
        ? fetch(`/api/operations/attendance?date=${date}`).then((response) => responseJson(response, "Attendance could not be loaded"))
        : Promise.resolve(null);
      const [dailyPayload, attendancePayload] = await Promise.all([dailyRequest, attendanceRequest]);
      setDaily(dailyPayload);
      setAttendance(attendancePayload);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { load(); }, [date, initialView]);

  useEffect(() => {
    const jobs = [];
    if (!evaluationMode && date === today && attendance?.schedule && !attendance.day && !auto.current.has(`a:${date}`)) {
      auto.current.add(`a:${date}`);
      jobs.push(["/api/operations/attendance", "POST", { action: "open", date }]);
    } else if (!evaluationMode && date === today && attendance?.day?.status === "OPEN" && attendance.day.records?.length && attendance.day.records.every((record) => record.status === "MISSING" && record.source === "SYSTEM") && !auto.current.has(`d:${attendance.day.id}`)) {
      auto.current.add(`d:${attendance.day.id}`);
      jobs.push(["/api/operations/attendance", "PATCH", { action: "applyExpectedDefaults", dayId: attendance.day.id }]);
    }
    if (!evaluationMode && date === today && attendance?.day?.status === "OPEN" && !attendance.day.records?.some((record) => record.status === "MISSING" && record.source === "SYSTEM") && attendance.day.records?.some((record) => record.source === "SYSTEM" && ["PRESENT", "MISSING"].includes(record.status) && (!record.actualIn || !record.actualOut)) && !auto.current.has(`t:${attendance.day.id}`)) {
      auto.current.add(`t:${attendance.day.id}`);
      jobs.push(["/api/operations/attendance", "PATCH", { action: "applyExpectedTimes", dayId: attendance.day.id }]);
    }
    if (daily?.schedule && !daily.day && !auto.current.has(`o:${date}`)) {
      auto.current.add(`o:${date}`);
      jobs.push(["/api/operations/daily", "POST", { action: "open", date }]);
    }
    if (daily?.schedule && daily?.day && daily.day.status !== "CLOSED" && !daily.rotation && !auto.current.has(`r:${daily.day.id}`)) {
      auto.current.add(`r:${daily.day.id}`);
      jobs.push(["/api/operations/daily", "POST", { action: "generateRotation", date }]);
    }
    if (!jobs.length) return;
    Promise.all(jobs.map(([url, method, body]) => fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((response) => responseJson(response, "Automatic daily preparation failed"))))
      .then(load)
      .catch((requestError) => setError(requestError.message));
  }, [daily, attendance, date, today, evaluationMode]);

  async function mutate(url, method, body, successMessage) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then((response) => responseJson(response, "Save failed"));
      setNotice(successMessage);
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const records = attendance?.day?.records || [];
  const updateAttendance = (record, values) => {
    const finalized = attendance.day.status === "FINALIZED";
    mutate("/api/operations/attendance", "PATCH", {
      action: finalized ? "correct" : "update",
      recordId: record.id,
      status: values.status,
      actualIn: values.actualIn,
      actualOut: values.actualOut,
      note: values.note,
      reason: values.reason,
    }, isArabic ? "تم حفظ الحضور" : "Attendance saved");
  };

  return <div className="live-ops-workspace">
    <header className="panel live-ops-header">
      <div>
        <span className="daily-preview-eyebrow">BILLY BEEZ · {daily?.branchConfig?.branchCode || daily?.branch || "MOT"}</span>
        <h1>{evaluationMode ? (isArabic ? "التقييم اليومي" : "Daily Evaluation") : (isArabic ? "الحضور اليومي" : "Daily Attendance")}</h1>
        <p>{evaluationMode ? (isArabic ? "درجات اليوم جاهزة للتعديل والحفظ والاعتماد." : "Today's scores are ready to edit, save and approve.") : (isArabic ? "مواعيد الدخول والخروج تُجهز من الشيفت المنشور." : "In and out times are prepared from the published shift.")}</p>
      </div>
    </header>
    <section className="panel daily-controls">
      <b>{daily?.branchConfig?.branchCode || daily?.branch || "MOT"}</b>
      <button type="button" onClick={() => setDate(today)}>{isArabic ? "اليوم" : "Today"}</button>
      <button type="button" onClick={() => setDate(addDays(today, 1))}>{isArabic ? "غدًا" : "Tomorrow"}</button>
      <input aria-label={isArabic ? "التاريخ" : "Date"} type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      <span>{daily?.schedule ? `${isArabic ? "جدول منشور" : "Published schedule"} v${daily.schedule.version}` : (isArabic ? "لا يوجد جدول منشور" : "No published schedule")}</span>
      <button type="button" disabled={busy} onClick={load}>{isArabic ? "تحديث" : "Refresh"}</button>
      <Link className="button-link" href={`/operations/daily-preview?date=${date}`}>{isArabic ? "فتح الروستر" : "Open roster"}</Link>
    </section>
    {error && <div className="alert danger">{error}</div>}
    {notice && <div className="alert success">{notice}</div>}
    {!daily?.schedule ? <section className="panel"><Empty>{isArabic ? "لا يوجد جدول منشور يغطي التاريخ المحدد." : "No published schedule covers this date."}</Empty></section> : evaluationMode ? <DailyEvaluationPanel date={date} /> : date !== today ? <section className="panel"><Empty>{isArabic ? "الحضور الفعلي متاح لليوم الحالي؛ استخدم الروستر لمراجعة الأيام الأخرى." : "Actual attendance is available for today; use the roster for other dates."}</Empty></section> : <section className="panel">
      <h2>{isArabic ? "الحضور الفعلي" : "Actual attendance"}</h2>
      {attendance?.day ? <>
        <div className="record-table-scroll attendance-table-wrap">
          <table className="record-line-table attendance-table">
            <thead><tr><th>{isArabic ? "الموظف" : "Employee"}</th><th>{isArabic ? "المتوقع" : "Expected"}</th><th>{isArabic ? "الحالة" : "Status"}</th><th>In</th><th>Out</th><th>{isArabic ? "ملاحظة" : "Note"}</th><th>{isArabic ? "حفظ" : "Save"}</th></tr></thead>
            <tbody>{records.map((record) => <AttendanceRow key={record.id} record={record} finalized={attendance.day.status === "FINALIZED"} onSave={updateAttendance} />)}</tbody>
          </table>
        </div>
        {attendance.day.status !== "FINALIZED" && <button type="button" disabled={busy || records.some((record) => record.status === "MISSING")} onClick={() => mutate("/api/operations/attendance", "PATCH", { action: "finalize", dayId: attendance.day.id }, isArabic ? "تم اعتماد الحضور" : "Attendance finalized")}>{isArabic ? "اعتماد الحضور" : "Finalize attendance"}</button>}
      </> : <Empty>{isArabic ? "جارٍ تجهيز الحضور من الجدول المنشور…" : "Opening attendance from the published schedule…"}</Empty>}
    </section>}
  </div>;
}
