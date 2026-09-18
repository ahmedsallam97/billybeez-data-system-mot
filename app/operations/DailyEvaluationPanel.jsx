"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";

const ARABIC_CRITERIA = { UNIFORM: "الزي والمظهر", POSITION: "الأداء في الموقع", SAFETY: "السلامة", BEHAVIOR: "السلوك والعمل الجماعي", GUEST: "التعامل مع الضيوف" };
function localToday() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

function draftFor(evaluation, criteria) {
  const deductions = new Map(evaluation.exceptions.map((item) => [item.criterionId, Number(item.deduction) || 0]));
  return {
    scores: Object.fromEntries(criteria.map((criterion) => [criterion.id, Math.max(0, Number(criterion.maxScore) - (deductions.get(criterion.id) || 0))])),
    supervisorNote: evaluation.supervisorNote || "",
  };
}

function payloadFor(evaluation, criteria, draft) {
  return {
    employeeId: evaluation.employeeId,
    supervisorNote: draft?.supervisorNote || "",
    exceptions: criteria.flatMap((criterion) => {
      const deduction = Math.max(0, Number(criterion.maxScore) - Number(draft?.scores?.[criterion.id] ?? criterion.maxScore));
      const existing = evaluation.exceptions.find((item) => item.criterionId === criterion.id);
      return deduction > 0 ? [{ criterionId: criterion.id, reasonId: existing?.reasonId || null, deduction, note: existing?.note || null }] : [];
    }),
  };
}

function EvaluationEditor({ evaluation, criteria, closed, isArabic, onClose, onSave }) {
  const initial = Object.fromEntries(criteria.map((criterion) => { const existing = evaluation.exceptions.find((item) => item.criterionId === criterion.id); return [criterion.id, { deduction: existing?.deduction || "", reasonId: existing?.reasonId || "", note: existing?.note || "" }]; }));
  const [values, setValues] = useState(initial);
  const [supervisorNote, setSupervisorNote] = useState(evaluation.supervisorNote || "");
  const [reason, setReason] = useState("");
  const score = Math.max(0, evaluation.maxScore - Object.values(values).reduce((sum, item) => sum + (Number(item.deduction) || 0), 0));
  function update(id, key, value) { setValues({ ...values, [id]: { ...values[id], [key]: value } }); }
  function save() {
    const exceptions = criteria.flatMap((criterion) => { const value = values[criterion.id]; const deduction = Number(value.deduction || 0); return deduction > 0 ? [{ criterionId: criterion.id, reasonId: value.reasonId || null, deduction, note: value.note }] : []; });
    onSave({ action: closed ? "correct" : "save", reason, evaluations: [{ employeeId: evaluation.employeeId, supervisorNote, exceptions }] });
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="detail-modal evaluation-editor" role="dialog" aria-modal="true" aria-labelledby="evaluation-editor-title" onMouseDown={(event) => event.stopPropagation()}><div className="modal-head"><div><span className="badge">{closed ? (isArabic ? "تصحيح بعد الاعتماد" : "Post-approval correction") : (isArabic ? "تعديل التقييم" : "Edit evaluation")}</span><h2 id="evaluation-editor-title">{evaluation.employee.name}</h2><span>{isArabic ? "النتيجة الحالية" : "Current score"}: {score}/{evaluation.maxScore}</span></div><button onClick={onClose}>{isArabic ? "إغلاق" : "Close"}</button></div><div className="evaluation-criteria-editor">{criteria.map((criterion) => <section key={criterion.id}><div><b>{isArabic ? (criterion.labelAr || ARABIC_CRITERIA[criterion.code] || criterion.label) : criterion.label}</b><span>{isArabic ? "الحد الأقصى" : "Maximum"}: {criterion.maxScore}</span></div><label>{isArabic ? "الخصم" : "Deduction"}<input aria-label={`${criterion.code} deduction`} type="number" min="0" max={criterion.maxScore} step="0.5" value={values[criterion.id].deduction} onChange={(event) => update(criterion.id, "deduction", event.target.value)} /></label><label>{isArabic ? "السبب" : "Reason"}<select aria-label={`${criterion.code} reason`} value={values[criterion.id].reasonId} onChange={(event) => update(criterion.id, "reasonId", event.target.value)}><option value="">—</option>{criterion.reasons.map((item) => <option value={item.id} key={item.id}>{isArabic ? (item.labelAr || item.label) : item.label}</option>)}</select></label><label>{isArabic ? "ملاحظة" : "Note"}<input aria-label={`${criterion.code} note`} value={values[criterion.id].note} onChange={(event) => update(criterion.id, "note", event.target.value)} /></label></section>)}</div><label className="evaluation-supervisor-note">{isArabic ? "ملاحظة المشرف" : "Supervisor note"}<textarea aria-label={isArabic ? "ملاحظة المشرف" : "Supervisor note"} value={supervisorNote} onChange={(event) => setSupervisorNote(event.target.value)} /></label>{closed && <label className="evaluation-supervisor-note">{isArabic ? "سبب التصحيح بعد الاعتماد" : "Post-approval correction reason"}<textarea aria-label={isArabic ? "سبب التصحيح بعد الاعتماد" : "Post-approval correction reason"} value={reason} onChange={(event) => setReason(event.target.value)} required /></label>}<div className="evaluation-editor-footer"><div><small>{isArabic ? "النتيجة بعد الخصومات" : "Score after deductions"}</small><b>{score}/{evaluation.maxScore}</b></div><button disabled={closed && !reason.trim()} onClick={save}>{closed ? (isArabic ? "حفظ التصحيح" : "Save correction") : (isArabic ? "حفظ التقييم" : "Save evaluation")}</button></div></section></div>;
}

export default function DailyEvaluationPanel({ date }) {
  const { isArabic } = useI18n();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState({});
  const automaticOpen = useRef(new Set());
  async function load() { const response = await fetch(`/api/operations/evaluations?date=${date}`); const payload = await response.json(); if (!response.ok) setError(payload.error); else setData(payload); }
  useEffect(() => { load(); }, [date]);
  useEffect(() => { if (!data || data.day || !data.team.length || automaticOpen.current.has(date)) return; automaticOpen.current.add(date); action({ action: "open" }); }, [data, date]);
  useEffect(() => {
    if (!data?.day || data.day.status === "CLOSED" || data.team.length <= data.day.evaluations.length || automaticOpen.current.has(`sync:${data.day.id}`)) return;
    automaticOpen.current.add(`sync:${data.day.id}`);
    action({ action: "syncTeam" });
  }, [data, date]);
  useEffect(() => {
    if (!data?.day) return setDrafts({});
    const criteria = data.day.criteriaVersion?.criteria || data.criteriaVersion?.criteria || [];
    setDrafts(Object.fromEntries(data.day.evaluations.map((item) => [item.employeeId, draftFor(item, criteria)])));
  }, [data?.day?.id, data?.day?.updatedAt]);
  async function action(body, successMessage = "") { setError(""); setNotice(""); const response = await fetch("/api/operations/evaluations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, date }) }); const payload = await response.json(); if (!response.ok) return setError(payload.error); setSelected(null); if (successMessage) setNotice(successMessage); await load(); }
  const criteria = data?.criteriaVersion?.criteria || [];
  const maximum = useMemo(() => criteria.reduce((sum, item) => sum + Number(item.maxScore), 0), [criteria]);
  function updateScore(employeeId, criterion, rawValue) {
    const value = Math.min(Number(criterion.maxScore), Math.max(0, Number(rawValue)));
    setDrafts((current) => ({ ...current, [employeeId]: { ...(current[employeeId] || { scores: {}, supervisorNote: "" }), scores: { ...(current[employeeId]?.scores || {}), [criterion.id]: value } } }));
  }
  function evaluationPayload(item) { return payloadFor(item, criteria, drafts[item.employeeId] || draftFor(item, criteria)); }
  return <section className="panel"><div className="operations-profile-head"><div><h2>{isArabic ? "التقييم اليومي والمظهر" : "Daily Evaluation & Grooming"}</h2><span>{data?.criteriaVersion?.label || ""}</span></div>{data?.day && <em>{data.day.status}</em>}</div>
    {error && <div className="alert danger">{error}</div>}
    {notice && <div className="alert success">{notice}</div>}
    <div className="evaluation-score-guide">{criteria.map((criterion) => <div key={criterion.id}><span>{isArabic ? (criterion.labelAr || ARABIC_CRITERIA[criterion.code] || criterion.label) : criterion.label}</span><b>{criterion.maxScore}</b></div>)}{criteria.length > 0 && <div className="total"><span>{isArabic ? "الإجمالي" : "Total"}</span><b>{maximum}</b></div>}</div>
    {!data?.day ? <div className="muted">{data?.team.length ? (isArabic ? "جارٍ تجهيز تقييمات الفريق تلقائيًا بدرجة 10/10..." : "Preparing the team evaluations automatically at 10/10...") : (isArabic ? "لا يوجد فريق عامل في الجدول المنشور" : "No working team in the published schedule")}</div> : <>
      <div className="record-table-scroll"><table className="record-line-table evaluation-table evaluation-ready-table"><thead><tr><th>{isArabic ? "الموظف" : "Employee"}</th>{criteria.map((criterion) => <th key={criterion.id}>{isArabic ? (criterion.labelAr || ARABIC_CRITERIA[criterion.code] || criterion.label) : criterion.label}<small>{criterion.maxScore}</small></th>)}<th>{isArabic ? "الإجمالي" : "Total"}</th><th>{isArabic ? "الحفظ" : "Save"}</th><th>{isArabic ? "التفاصيل" : "Details"}</th></tr></thead><tbody>{data.day.evaluations.map((item) => {
        const draft = drafts[item.employeeId] || draftFor(item, criteria);
        const total = criteria.reduce((sum, criterion) => sum + Number(draft.scores?.[criterion.id] ?? criterion.maxScore), 0);
        return <tr key={item.id}><td><b>{item.employee.name}</b><small>{item.status === "DEFAULT_FULL" ? (isArabic ? "جاهز بالقيمة الافتراضية" : "Ready at default") : item.status}</small></td>{criteria.map((criterion) => <td key={criterion.id}><input aria-label={`${item.employee.name} ${criterion.code}`} type="number" min="0" max={criterion.maxScore} step="0.5" disabled={data.day.status === "CLOSED"} value={draft.scores?.[criterion.id] ?? criterion.maxScore} onChange={(event) => updateScore(item.employeeId, criterion, event.target.value)} /></td>)}<td><b>{total}/{maximum}</b></td><td>{data.day.status !== "CLOSED" && <button onClick={() => action({ action: "save", evaluations: [evaluationPayload(item)] }, isArabic ? `تم حفظ تقييم ${item.employee.name}` : `${item.employee.name} saved`)}>{isArabic ? "حفظ" : "Save"}</button>}</td><td><button className="secondary" onClick={() => setSelected(item)}>{data.day.status === "CLOSED" ? (isArabic ? "عرض / تصحيح" : "View / correct") : (isArabic ? "أسباب وملاحظات" : "Reasons & notes")}</button></td></tr>;
      })}</tbody></table></div>
      {data.day.status !== "CLOSED" && <div className="evaluation-bulk-actions"><button onClick={() => action({ action: "save", evaluations: data.day.evaluations.map(evaluationPayload) }, isArabic ? "تم حفظ تقييمات الفريق كلها" : "All team evaluations saved")}>{isArabic ? "حفظ الكل" : "Save all"}</button><button onClick={() => action({ action: "close" })}>{isArabic ? "اعتماد وإقفال التقييم" : "Finalize and close evaluation"}</button></div>}
    </>}
    {selected && <EvaluationEditor evaluation={selected} criteria={criteria} closed={data.day.status === "CLOSED"} isArabic={isArabic} onClose={() => setSelected(null)} onSave={action} />}
  </section>;
}
