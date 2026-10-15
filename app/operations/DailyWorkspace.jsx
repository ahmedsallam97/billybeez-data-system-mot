"use client";
import { OperationalError } from "../ui/OperationalFeedback";
import { useUiText } from '@/app/i18n';
import {PageHeader} from '../ui/DesktopLayout';
import ActionButton from "@/app/ActionButton";
import {PermissionButton} from '@/app/account/PermissionControls';
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useI18n } from "../i18n";
import timeStyles from "./AttendanceTime.module.css";
import DailyControlPanel from "./DailyControlPanel";
import DailyEvaluationPanel from "./DailyEvaluationPanel";
import { formatTime12 } from "@/lib/operations/roster";
import { readApiResponse } from "@/lib/client/read-api-response";

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
const WORKED_STATUSES=["PRESENT","LATE","EARLY_LEAVE","UNEXPECTED_PRESENT","MISSING"];
function AttendanceRow({ record, finalized, onSave, busy, isArabic }) {
  const localize = useUiText();
  const useShiftDefault=!finalized && record.source==="SYSTEM" && WORKED_STATUSES.includes(record.status) && !record.actualIn && !record.actualOut;
  const [d, setD] = useState({
    status: record.status,
    actualIn: record.actualIn || (useShiftDefault ? record.expectedStart || "" : ""),
    actualOut: record.actualOut || (useShiftDefault ? record.expectedEnd || "" : ""),
    note: record.note || "",
    reason: "",
  });
  useEffect(
    () =>
      setD({
        status: record.status,
        actualIn: record.actualIn || (useShiftDefault ? record.expectedStart || "" : ""),
        actualOut: record.actualOut || (useShiftDefault ? record.expectedEnd || "" : ""),
        note: record.note || "",
        reason: "",
      }),
    [record, useShiftDefault],
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
          disabled={busy}
          onChange={(e) => setD({ ...d, status: e.target.value, ...(!WORKED_STATUSES.includes(e.target.value)?{actualIn:"",actualOut:""}:{}) })}
        >
          {STATUSES.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </td>
      <td>
        <label className={timeStyles.time}><strong>{localize("In:")} {d.actualIn?formatTime12(d.actualIn):"—"}</strong><input
          aria-label={record.employee.name+localize(" In")} type="time" step="60" disabled={busy||!WORKED_STATUSES.includes(d.status)}
          value={d.actualIn}
          onChange={(e) => setD({ ...d, actualIn: e.target.value })}
        /></label>
      </td>
      <td>
        <label className={timeStyles.time}><strong>{localize("Out:")} {d.actualOut?formatTime12(d.actualOut):"—"}</strong><input
          aria-label={record.employee.name+localize(" Out")} type="time" step="60" disabled={busy||!WORKED_STATUSES.includes(d.status)}
          value={d.actualOut}
          onChange={(e) => setD({ ...d, actualOut: e.target.value })}
        /></label>
      </td>
      <td>
        <input
          value={d.note}
          placeholder={localize("Note")}
          onChange={(e) => setD({ ...d, note: e.target.value })}
        />
        {finalized && (
          <input
            required
            value={d.reason}
            placeholder={localize("Correction reason")}
            onChange={(e) => setD({ ...d, reason: e.target.value })}
          />
        )}
      </td>
      <td>
        <PermissionButton permission={finalized?'attendance.unlock':'attendance.edit'} disabled={busy} onClick={() => onSave(record, d)}>{isArabic?"حفظ":localize("Save")}</PermissionButton>
      </td>
    </tr>
  );
}
export default function DailyWorkspace({ initialView = "attendance" }) {
  const localize = useUiText();
  const { isArabic } = useI18n();
  const today = todayCairo();
  const evaluationMode = initialView === "evaluation";
  const [date, setDate] = useState(today);
  const [daily, setDaily] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const requestedDate = new URLSearchParams(window.location.search).get("date");
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(requestedDate || ""))) setDate(requestedDate);
  }, []);

  const loadVersion=useRef(0);
  const savingRef=useRef(false);
  async function load() {
    const version=++loadVersion.current;
    setBusy(true);
    setError("");
    try {
      const dailyRequest = fetch(`/api/operations/daily?date=${date}&view=${evaluationMode?'evaluation':'attendance'}`).then((response) => readApiResponse(response, "Daily context could not be loaded"));
      const attendanceRequest = !evaluationMode
        ? fetch(`/api/operations/attendance?date=${date}`).then((response) => readApiResponse(response, "Attendance could not be loaded"))
        : Promise.resolve(null);
      const [dailyPayload, attendancePayload] = await Promise.all([dailyRequest, attendanceRequest]);
      if(version!==loadVersion.current)return;
      setDaily(dailyPayload);
      setAttendance(attendancePayload);
    } catch (requestError) {
      if(version===loadVersion.current)setError(requestError.message);
    } finally {
      if(version===loadVersion.current)setBusy(false);
    }
  }

  useEffect(() => { setDaily(null);setAttendance(null);load();return()=>{loadVersion.current++;}; }, [date, initialView]);

  async function mutate(url, method, body, successMessage) {
    if(savingRef.current)return;
    savingRef.current=true;setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }).then((response) => readApiResponse(response, "Save failed"));
      setNotice(successMessage);
      await load();
      if (result.leadershipReports?.warnings?.length) setError((isArabic ? "تم فتح اليوم، لكن بعض تقارير قيادة الشيفت لم تُنشأ: " : "The day opened, but some Shift Leadership reports could not be created: ") + result.leadershipReports.warnings.map(item => `${item.shiftCode}: ${item.message}`).join(" · "));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      savingRef.current=false;setBusy(false);
    }
  }

  const records = attendance?.day?.records || [];
  const chooseDate = (nextDate) => {
    if(!nextDate||savingRef.current)return;
    setDate(nextDate);
    const url = new URL(window.location.href);
    url.searchParams.set("date", nextDate);
    window.history.replaceState({}, "", url);
  };
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
    <PageHeader description={evaluationMode?(isArabic?"درجات اليوم جاهزة للتعديل والحفظ والاعتماد.":"Today’s scores are ready to edit, save and approve."):(isArabic?"سجّل الحضور والراحة والتسليم وإغلاق اليوم من الشيفت المنشور.":"Record attendance, breaks, handover and closing for the published shift.")} context={daily?.branchConfig?.branchCode||daily?.branch||"MOT"}/>
    <section className="panel daily-controls">
      <b>{daily?.branchConfig?.branchCode || daily?.branch || "MOT"}</b>
      <ActionButton type="button" onClick={() => chooseDate(today)}>{isArabic ? "اليوم" : localize("Today")}</ActionButton>
      <ActionButton type="button" onClick={() => chooseDate(addDays(today, 1))}>{isArabic ? "غدًا" : "Tomorrow"}</ActionButton>
      <input aria-label={isArabic ? "التاريخ" : localize("Date")} type="date" value={date} onChange={(event) => chooseDate(event.target.value)} />
      <span>{daily?.schedule ? `${isArabic ? "جدول منشور" : "Published schedule"} v${daily.schedule.version}` : (isArabic ? "لا يوجد جدول منشور" : "No published schedule")}</span>
      <ActionButton type="button" disabled={busy} onClick={load}>{isArabic ? "تحديث" : localize("Refresh")}</ActionButton>
      <Link className="button-link" href={`/operations/daily-preview?date=${date}`}>{isArabic ? "فتح الروستر" : "Open roster"}</Link>
    </section>
    <OperationalError error={error}/>
    {notice && <div className="alert success">{notice}</div>}
    {!daily?.schedule ? <section className="panel"><Empty>{isArabic ? "لا يوجد جدول منشور يغطي التاريخ المحدد." : "No published schedule covers this date."}</Empty></section> : evaluationMode ? <DailyEvaluationPanel date={date} /> : <section className="panel">
      <h2>{isArabic ? "الحضور الفعلي" : "Actual attendance"}</h2>
      {attendance?.day ? <>
        <p className={timeStyles.hint}>{isArabic?"أوقات الشيفت تظهر كاقتراح للصفوف الجديدة. راجع وعدّل ثم احفظ لتسجيل الحضور الفعلي.":"New rows suggest the shift times. Review or adjust them, then save to record actual attendance."}</p>
        <div className="record-table-scroll attendance-table-wrap">
          <table className="record-line-table attendance-table">
            <thead><tr><th>{isArabic ? "الموظف" : localize("Employee")}</th><th>{isArabic ? "المتوقع" : "Expected"}</th><th>{isArabic ? "الحالة" : localize("Status")}</th><th>{localize("In")}</th><th>{localize("Out")}</th><th>{isArabic ? "ملاحظة" : localize("Note")}</th><th>{isArabic ? "حفظ" : localize("Save")}</th></tr></thead>
            <tbody>{records.map((record) => <AttendanceRow key={record.id} record={record} finalized={attendance.day.status === "FINALIZED"} onSave={updateAttendance} busy={busy} isArabic={isArabic} />)}</tbody>
          </table>
        </div>
        {attendance.day.status !== "FINALIZED" && <PermissionButton permission={"attendance.approve"} type="button" disabled={busy || records.some((record) => record.status === "MISSING")} onClick={() => mutate("/api/operations/attendance", "PATCH", { action: "finalize", dayId: attendance.day.id }, isArabic ? "تم اعتماد الحضور" : "Attendance finalized")}>{isArabic ? "اعتماد الحضور" : "Finalize attendance"}</PermissionButton>}
      </> : <div className="daily-empty-action"><Empty>{isArabic ? "لم يتم فتح حضور هذا اليوم بعد." : "Attendance has not been opened for this date."}</Empty><PermissionButton permission={"attendance.create"} type="button" disabled={busy} onClick={() => mutate("/api/operations/attendance", "POST", { action: "open", date }, isArabic ? "تم فتح حضور اليوم المحدد" : "Attendance opened for the selected date")}>{isArabic ? "فتح حضور اليوم المحدد" : "Open selected date attendance"}</PermissionButton></div>}
    </section>}
  </div>;
}

