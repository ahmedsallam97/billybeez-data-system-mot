"use client";
import { useEffect, useMemo, useRef, useState } from "react";
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
function PlanCard({ title, items, empty, children }) {
  return (
    <article className="panel plan-card">
      <h2>{title}</h2>
      {items?.length ? (
        items.map((x) => (
          <div
            className={`planning-row ${(x.priority || "").toLowerCase()}`}
            key={x.id}
          >
            <b>{x.name || x.title || x.wristbandType}</b>
            <span>
              {x.message ||
                x.details ||
                x.startTime ||
                `${Math.max(0, x.availableStock - x.allocated - x.issued)} remaining`}
            </span>
            {x.priority && <em>{x.priority}</em>}
          </div>
        ))
      ) : (
        <Empty>{empty}</Empty>
      )}
      {children}
    </article>
  );
}
function attentionWorkspace(code) {
  if (String(code || "").startsWith("ATTENDANCE")) return "attendance";
  if (["COVERAGE_SHORTAGE", "AM_CASHIER", "PM_CASHIER", "CRITICAL_COVERAGE", "ROTATION", "BREAKS"].includes(code)) return "deployment";
  if (["TRIP_STAFFING", "WRISTBANDS", "CRITICAL_NOTICES"].includes(code)) return "planning";
  return "close";
}

export default function DailyWorkspace({ initialView = "command" }) {
  const { isArabic } = useI18n(),
    today = todayCairo();
  const [date, setDate] = useState(today),
    [daily, setDaily] = useState(null),
    [attendance, setAttendance] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [workspaceView, setWorkspaceView] = useState(initialView);
  const auto = useRef(new Set());
  const [manual, setManual] = useState({
      employeeId: "",
      operationalPositionId: "",
      startTime: "09:00",
      endTime: "10:00",
      reason: "",
    }),
    [brk, setBrk] = useState({
      employeeId: "",
      startTime: "13:00",
      endTime: "13:30",
      note: "",
    });
  async function load() {
    setBusy(true);
    setError("");
    try {
      const rs = await Promise.all([
          fetch(`/api/operations/daily?date=${date}`),
          ...(date === today
            ? [fetch(`/api/operations/attendance?date=${date}`)]
            : []),
        ]),
        ps = await Promise.all(rs.map((r) => r.json()));
      if (!rs[0].ok) throw new Error(ps[0].error);
      if (rs[1] && !rs[1].ok) throw new Error(ps[1].error);
      setDaily(ps[0]);
      setAttendance(ps[1] || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, [date]);
  useEffect(() => {
    setWorkspaceView(initialView);
  }, [initialView]);
  useEffect(() => {
    const jobs = [];
    if (
      date === today &&
      attendance?.schedule &&
      !attendance.day &&
      !auto.current.has(`a:${date}`)
    ) {
      auto.current.add(`a:${date}`);
      jobs.push([
        "/api/operations/attendance",
        "POST",
        { action: "open", date },
      ]);
    } else if (
      date === today &&
      attendance?.day?.status === "OPEN" &&
      attendance.day.records?.length &&
      attendance.day.records.every(
        (r) => r.status === "MISSING" && r.source === "SYSTEM",
      ) &&
      !auto.current.has(`d:${attendance.day.id}`)
    ) {
      auto.current.add(`d:${attendance.day.id}`);
      jobs.push([
        "/api/operations/attendance",
        "PATCH",
        { action: "applyExpectedDefaults", dayId: attendance.day.id },
      ]);
    }
    if (
      date === today &&
      attendance?.day?.status === "OPEN" &&
      !attendance.day.records?.some((record) => record.status === "MISSING" && record.source === "SYSTEM") &&
      attendance.day.records?.some(
        (record) => record.source === "SYSTEM" && ["PRESENT", "MISSING"].includes(record.status) && (!record.actualIn || !record.actualOut),
      ) &&
      !auto.current.has(`t:${attendance.day.id}`)
    ) {
      auto.current.add(`t:${attendance.day.id}`);
      jobs.push([
        "/api/operations/attendance",
        "PATCH",
        { action: "applyExpectedTimes", dayId: attendance.day.id },
      ]);
    }
    if (daily?.schedule && !daily.day && !auto.current.has(`o:${date}`)) {
      auto.current.add(`o:${date}`);
      jobs.push(["/api/operations/daily", "POST", { action: "open", date }]);
    }
    if (
      daily?.schedule &&
      daily?.day &&
      daily.day.status !== "CLOSED" &&
      !daily.rotation &&
      !auto.current.has(`r:${daily.day.id}`)
    ) {
      auto.current.add(`r:${daily.day.id}`);
      jobs.push(["/api/operations/daily", "POST", { action: "generateRotation", date }]);
    }
    if (jobs.length)
      Promise.all(
        jobs.map(([u, m, b]) =>
          fetch(u, {
            method: m,
            headers: { "content-type": "application/json" },
            body: JSON.stringify(b),
          }).then(async (r) => {
            if (!r.ok) throw new Error((await r.json()).error);
          }),
        ),
      )
        .then(load)
        .catch((e) => setError(e.message));
  }, [daily, attendance, date, today]);
  async function mutate(url, method, body, msg = "Saved") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(url, {
          method,
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        p = await r.json();
      if (!r.ok)
        throw new Error(
          p.blockers ? `${p.error}: ${p.blockers.join("; ")}` : p.error,
        );
      setNotice(msg);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const working = daily?.team?.filter((x) => x.working) || [],
    nonWorking = daily?.team?.filter((x) => !x.working) || [],
    records = attendance?.day?.records || [],
    closed = daily?.day?.status === "CLOSED";
  const qmap = useMemo(
    () =>
      (daily?.qualifications || []).reduce(
        (m, q) => ((m[q.employeeId] ||= []).push(q), m),
        {},
      ),
    [daily],
  );
  const submit = (e, action) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    mutate("/api/operations/daily", "POST", { action, date, ...body });
    e.currentTarget.reset();
  };
  const updateAttendance = (record, d) => {
    const finalized = attendance.day.status === "FINALIZED";
    if (finalized && !d.reason.trim())
      return setError("Correction reason required");
    mutate("/api/operations/attendance", "PATCH", {
      action: finalized ? "correct" : "update",
      recordId: record.id,
      status: d.status,
      actualIn: d.actualIn,
      actualOut: d.actualOut,
      note: d.note,
      reason: d.reason,
    });
  };
  return (
    <div className="live-ops-workspace">
      <header className="panel live-ops-header">
        <div>
          <span className="daily-preview-eyebrow">BILLY BEEZ · MOT</span>
          <h1>
            {isArabic ? "التشغيل اليومي المباشر" : "Live Daily Operations"}
          </h1>
          <p>
            {daily?.liveMode === "PLANNING"
              ? "Planning mode — attendance is not required"
              : "Live operating mode"}
          </p>
        </div>
        <div className="live-ops-status">
          <b>{daily?.day?.status || "READY"}</b>
          <strong>{daily?.readiness?.score ?? 0}%</strong>
          <span>Readiness</span>
        </div>
      </header>
      <section className="panel daily-controls">
        <b>MOT</b>
        <button onClick={() => setDate(today)}>Today</button>
        <button onClick={() => setDate(addDays(today, 1))}>Tomorrow</button>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <span>
          {daily?.schedule
            ? `Published schedule v${daily.schedule.version}`
            : "No published schedule"}
        </span>
        <button disabled={busy} onClick={load}>
          Refresh
        </button>
        <button
          disabled={busy || !daily?.day || closed}
          onClick={() =>
            mutate(
              "/api/operations/daily",
              "POST",
              { action: "generateRotation", date },
              "Rotation generated",
            )
          }
        >
          Generate rotation
        </button>
        <Link
          className="button-link"
          href={`/operations/daily-preview?date=${date}`}
        >
          Preview / Print / PDF
        </Link>
      </section>
      <nav className="daily-command-tabs" aria-label="Daily operations workspace">
        {[
          ["command", isArabic ? "مركز القرار" : "Command center"],
          ["deployment", isArabic ? "الفريق والروتيشن" : "Team & rotation"],
          ["planning", isArabic ? "التخطيط" : "Planning"],
          ["attendance", isArabic ? "الحضور" : "Attendance"],
          ["evaluation", isArabic ? "التقييم اليومي" : "Daily evaluation"],
          ["timeline", isArabic ? "سجل اليوم" : "Day timeline"],
          ["close", isArabic ? "إقفال اليوم" : "Close day"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={workspaceView === id ? "active" : ""}
            onClick={() => setWorkspaceView(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {error && <div className="alert danger">{error}</div>}
      {notice && <div className="alert success">{notice}</div>}
      {!daily?.schedule ? (
        <section className="panel">
          <Empty>No published schedule covers this date.</Empty>
        </section>
      ) : (
        <>
          <section className="daily-next-action" aria-live="polite">
            <span>{isArabic ? "الإجراء التشغيلي التالي" : "Next operational action"}</span>
            <b>
              {daily.attention?.[0]?.message ||
                (isArabic ? "لا يوجد إجراء تشغيلي عاجل" : "No urgent operational action is waiting")}
            </b>
          </section>
          {workspaceView === "command" && (
            <>
          <section className="daily-shift-strip" aria-label="Shift readiness">
            {["AM", "BW", "PM"].map((shiftCode) => {
              const members = working.filter((item) => item.shiftCode === shiftCode);
              const present = members.filter((item) => ["PRESENT", "LATE", "EARLY_LEAVE", "UNEXPECTED_PRESENT"].includes(item.attendanceState)).length;
              const action = members.filter((item) => ["MISSING", "ABSENT"].includes(item.attendanceState)).length;
              return <article key={shiftCode} className={action ? "needs-action" : ""}><span>{shiftCode} · {formatTime12(daily.shifts?.[shiftCode]?.startTime)} — {formatTime12(daily.shifts?.[shiftCode]?.endTime)}</span><b>{present}/{members.length}</b><small>{action ? (isArabic ? `${action} يحتاج متابعة` : `${action} needs action`) : (isArabic ? "الفريق جاهز" : "team clear")}</small></article>;
            })}
          </section>
          <section className="daily-metrics">
            <div>
              <span>Expected team</span>
              <b>{working.length}</b>
            </div>
            <div>
              <span>Actual attendance</span>
              <b>{daily.liveMode === "PLANNING" ? "N/A" : records.length}</b>
            </div>
            <div>
              <span>Coverage</span>
              <b>
                {daily.coverage?.filter((x) => !x.shortage).length || 0}/
                {daily.coverage?.length || 0}
              </b>
            </div>
            <div>
              <span>Critical alerts</span>
              <b>
                {daily.attention?.filter((x) => x.severity === "CRITICAL")
                  .length || 0}
              </b>
            </div>
          </section>
          <section className="grid two live-ops-grid">
            <article className="panel">
              <h2>Expected team & actual state</h2>
              {["AM", "BW", "PM"].map((s) => (
                <section
                  className={`team-shift team-${s.toLowerCase()}`}
                  key={s}
                >
                  <h3>
                    {s} · {formatTime12(daily.shifts?.[s]?.startTime)} —{" "}
                    {formatTime12(daily.shifts?.[s]?.endTime)}
                  </h3>
                  {working
                    .filter((x) => x.shiftCode === s)
                    .map((x) => (
                      <div className="team-member" key={x.assignmentId}>
                        <span>
                          <b>{x.employee.name}</b>
                          <small>{x.employee.jobTitle}</small>
                        </span>
                        <em>{x.code}</em>
                        <strong>{x.attendanceState}</strong>
                        <small>
                          {qmap[x.employeeId]
                            ?.filter((q) => q.status === "QUALIFIED")
                            .map((q) => q.position.code)
                            .join(", ") ||
                            "No operational qualifications recorded"}
                        </small>
                      </div>
                    ))}
                </section>
              ))}
              {nonWorking.length > 0 && (
                <section className="team-shift">
                  <h3>Not working today</h3>
                  {nonWorking.map((x) => (
                    <div className="team-member" key={x.assignmentId}>
                      <b>{x.employee.name}</b>
                      <em>{x.code}</em>
                    </div>
                  ))}
                </section>
              )}
            </article>
            <article className="panel attention-panel">
              <h2>Needs Attention</h2>
              {daily.attention?.length ? (
                daily.attention.map((x, i) => (
                  <button
                    className={`attention-item ${x.severity.toLowerCase()}`}
                    key={`${x.code}-${i}`}
                    type="button"
                    onClick={() => setWorkspaceView(attentionWorkspace(x.code))}
                  >
                    <b>{x.severity}</b>
                    <span>{x.message}</span>
                    <small>{isArabic ? "فتح الحل" : "Open resolution"}</small>
                  </button>
                ))
              ) : (
                <Empty>No attention items</Empty>
              )}
            </article>
          </section>
          <section className="panel">
            <h2>Coverage & rotation</h2>
            <div className="coverage-grid">
              {daily.coverage?.map((x) => {
                const qualifiedNames = working.filter((member) => member.shiftCode === x.shiftCode && (qmap[member.employeeId]?.some((qualification) => qualification.position?.id === x.positionId && qualification.status === "QUALIFIED") || !daily.positions.find((position) => position.id === x.positionId)?.requiresQualification)).map((member) => member.employee.name);
                return <div
                  className={`coverage-card ${x.shortage ? "shortage" : "covered"} ${x.highlight ? "strong" : ""}`}
                  key={`${x.shiftCode}-${x.positionId}`}
                >
                  <b>
                    {x.shiftCode} · {x.positionLabel}
                  </b>
                  <span>
                    {x.assigned}/{x.required} covered
                  </span>
                  <small>{x.qualified} qualified</small>
                  {x.shortage > 0 && <small className="coverage-suggestion">{isArabic ? "المؤهلون في الشيفت: " : "Qualified this shift: "}{qualifiedNames.length ? qualifiedNames.join(", ") : (isArabic ? "لا توجد مؤهلات مسجلة" : "none recorded")}</small>}
                </div>
              })}
            </div>
            {daily.rotation?.assignments?.length ? (
              <div className="record-table-scroll">
                <table className="record-line-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Employee</th>
                      <th>Position</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daily.rotation.assignments.map((x) => (
                      <tr key={x.id}>
                        <td>
                          {x.startTime} — {x.endTime}
                        </td>
                        <td>{x.employee.name}</td>
                        <td
                          className={
                            ["DROP", "TOWER", "DATA"].includes(x.position.code)
                              ? "strong-position"
                              : ""
                          }
                        >
                          {x.position.label}
                        </td>
                        <td>{x.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>
                No rotation generated. Qualification shortages are listed above.
              </Empty>
            )}
          </section>
            </>
          )}
          {workspaceView === "deployment" && (
            <>
          <section className="grid two live-ops-grid">
            <article className="panel">
              <h2>Manual rotation override</h2>
              <form
                className="compact-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutate("/api/operations/daily", "POST", {
                    action: "manualAssignment",
                    date,
                    ...manual,
                  });
                }}
              >
                <select
                  aria-label="Working employee"
                  required
                  value={manual.employeeId}
                  onChange={(e) =>
                    setManual({ ...manual, employeeId: e.target.value })
                  }
                >
                  <option value="">Working employee</option>
                  {working.map((x) => (
                    <option key={x.employeeId} value={x.employeeId}>
                      {x.employee.name} · {x.shiftCode}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="Operational position"
                  required
                  value={manual.operationalPositionId}
                  onChange={(e) =>
                    setManual({
                      ...manual,
                      operationalPositionId: e.target.value,
                    })
                  }
                >
                  <option value="">Position</option>
                  {daily.positions.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                      {x.requiresQualification
                        ? " · qualification required"
                        : ""}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  value={manual.startTime}
                  onChange={(e) =>
                    setManual({ ...manual, startTime: e.target.value })
                  }
                />
                <input
                  type="time"
                  value={manual.endTime}
                  onChange={(e) =>
                    setManual({ ...manual, endTime: e.target.value })
                  }
                />
                <input
                  required
                  placeholder="Override reason"
                  value={manual.reason}
                  onChange={(e) =>
                    setManual({ ...manual, reason: e.target.value })
                  }
                />
                <button disabled={closed}>Save override</button>
              </form>
            </article>
            <article className="panel">
              <h2>Break management</h2>
              <form
                className="compact-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  mutate("/api/operations/daily", "POST", {
                    action: "addBreak",
                    date,
                    ...brk,
                  });
                }}
              >
                <select
                  aria-label="Break employee"
                  required
                  value={brk.employeeId}
                  onChange={(e) =>
                    setBrk({ ...brk, employeeId: e.target.value })
                  }
                >
                  <option value="">Employee</option>
                  {working.map((x) => (
                    <option key={x.employeeId} value={x.employeeId}>
                      {x.employee.name}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  value={brk.startTime}
                  onChange={(e) =>
                    setBrk({ ...brk, startTime: e.target.value })
                  }
                />
                <input
                  type="time"
                  value={brk.endTime}
                  onChange={(e) => setBrk({ ...brk, endTime: e.target.value })}
                />
                <input
                  placeholder="Note"
                  value={brk.note}
                  onChange={(e) => setBrk({ ...brk, note: e.target.value })}
                />
                <button disabled={closed}>Add break</button>
              </form>
              {daily.breaks?.length ? (
                daily.breaks.map((x) => (
                  <div className="planning-row" key={x.id}>
                    <b>{x.employee.name}</b>
                    <span>
                      {x.startTime} — {x.endTime}
                    </span>
                    <em>{x.status}</em>
                  </div>
                ))
              ) : (
                <Empty>No breaks recorded</Empty>
              )}
            </article>
          </section>
            </>
          )}
          {workspaceView === "planning" && (
          <section className="planning-grid">
            <PlanCard
              title="Trips"
              items={daily.trips}
              empty="No trips planned"
            >
              <form
                className="compact-form"
                onSubmit={(e) => submit(e, "createTrip")}
              >
                <input name="name" required placeholder="Trip name" />
                <input name="startTime" type="time" />
                <input
                  name="expectedChildren"
                  type="number"
                  min="0"
                  placeholder="Children"
                />
                <input
                  name="staffingRequired"
                  type="number"
                  min="0"
                  placeholder="Staff"
                />
                <button disabled={closed}>Add</button>
              </form>
            </PlanCard>
            <PlanCard
              title="Events"
              items={daily.events}
              empty="No events planned"
            >
              <form
                className="compact-form"
                onSubmit={(e) => submit(e, "createEvent")}
              >
                <input name="name" required placeholder="Event name" />
                <input name="startTime" type="time" />
                <input
                  name="expectedGuests"
                  type="number"
                  min="0"
                  placeholder="Guests"
                />
                <input name="location" placeholder="Location" />
                <button disabled={closed}>Add</button>
              </form>
            </PlanCard>
            <PlanCard
              title="Offers"
              items={daily.offers}
              empty="No active offers"
            >
              <form
                className="compact-form"
                onSubmit={(e) => submit(e, "createOffer")}
              >
                <input name="title" required placeholder="Title" />
                <input name="details" placeholder="Details" />
                <input
                  name="effectiveFrom"
                  required
                  type="date"
                  defaultValue={date}
                />
                <input
                  name="effectiveTo"
                  required
                  type="date"
                  defaultValue={date}
                />
                <button disabled={closed}>Add</button>
              </form>
            </PlanCard>
            <PlanCard
              title="Operational notices"
              items={daily.notices}
              empty="No notices recorded"
            >
              <form
                className="compact-form"
                onSubmit={(e) => submit(e, "createNotice")}
              >
                <input name="title" required placeholder="Title" />
                <input name="message" required placeholder="Message" />
                <select aria-label="Notice priority" name="priority">
                  <option>INFO</option>
                  <option>WARNING</option>
                  <option>CRITICAL</option>
                </select>
                <input
                  name="effectiveFrom"
                  required
                  type="date"
                  defaultValue={date}
                />
                <button disabled={closed}>Add</button>
              </form>
            </PlanCard>
            <PlanCard
              title="Wristband stock"
              items={daily.wristbands}
              empty="No wristband stock recorded"
            >
              <form
                className="compact-form"
                onSubmit={(e) => submit(e, "setWristband")}
              >
                <input name="wristbandType" required placeholder="Type" />
                <input name="color" placeholder="Color" />
                <input
                  name="availableStock"
                  required
                  type="number"
                  min="0"
                  placeholder="Available"
                />
                <button disabled={closed}>Save</button>
              </form>
            </PlanCard>
          </section>
          )}
          {workspaceView === "attendance" && (
            <>
          {date === today && (
            <section className="panel">
              <h2>Actual attendance</h2>
              {attendance?.day ? (
                <>
                  <div className="record-table-scroll">
                    <table className="record-line-table attendance-table">
                      <thead>
                        <tr>
                          <th>Employee</th>
                          <th>Expected</th>
                          <th>Status</th>
                          <th>In</th>
                          <th>Out</th>
                          <th>Note</th>
                          <th>Save</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((r) => (
                          <AttendanceRow
                            key={r.id}
                            record={r}
                            finalized={attendance.day.status === "FINALIZED"}
                            onSave={updateAttendance}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {attendance.day.status !== "FINALIZED" && (
                    <button
                      disabled={records.some((r) => r.status === "MISSING")}
                      onClick={() =>
                        mutate("/api/operations/attendance", "PATCH", {
                          action: "finalize",
                          dayId: attendance.day.id,
                        })
                      }
                    >
                      Finalize attendance
                    </button>
                  )}
                </>
              ) : (
                <Empty>Opening attendance from the published schedule…</Empty>
              )}
            </section>
          )}
            </>
          )}
          {workspaceView === "evaluation" && <DailyEvaluationPanel date={date} />}
          {workspaceView === "timeline" && (
            <section className="panel daily-timeline">
              <div className="operations-profile-head">
                <div><h2>{isArabic ? "سجل اليوم" : "Day timeline"}</h2><span>{isArabic ? `الإجراءات التشغيلية المسجلة بتاريخ ${date}` : `Recorded operational actions for ${date}`}</span></div>
                <em>{daily.timeline?.length || 0}</em>
              </div>
              {daily.timeline?.length ? daily.timeline.map((item) => (
                <article key={item.id} className="daily-timeline-item">
                  <time>{new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</time>
                  <div><b>{item.summary}</b><small>{item.action} · {item.user}</small></div>
                </article>
              )) : <Empty>{isArabic ? "لا توجد إجراءات تشغيلية مسجلة لهذا اليوم." : "No recorded operational actions for this day."}</Empty>}
            </section>
          )}
          {workspaceView === "close" && (
          <section className="panel close-day-panel">
            <div>
              <h2>Close Day checklist</h2>
              {daily.readiness?.checks.map((x) => (
                <p key={x.code}>
                  <b>{x.ok ? "✓" : "!"}</b>
                  <span>{x.label}</span>
                  <em>{x.ok ? "PASS" : x.critical ? "BLOCKER" : "WARNING"}</em>
                </p>
              ))}
            </div>
            <div>
              <strong>
                {daily.close?.ready ? "Ready to close" : "Not ready to close"}
              </strong>
              {daily.close?.blockers?.map((x) => (
                <small key={x}>{x}</small>
              ))}
              {closed ? (
                <button
                  onClick={() => {
                    const reason = prompt("Reopen reason");
                    if (reason)
                      mutate("/api/operations/daily", "PATCH", {
                        action: "reopen",
                        dayId: daily.day.id,
                        reason,
                      });
                  }}
                >
                  Reopen day
                </button>
              ) : (
                <button
                  disabled={!daily.day}
                  onClick={() =>
                    mutate("/api/operations/daily", "PATCH", {
                      action: "close",
                      dayId: daily.day.id,
                    })
                  }
                >
                  Close day
                </button>
              )}
            </div>
          </section>
          )}
        </>
      )}
    </div>
  );
}
