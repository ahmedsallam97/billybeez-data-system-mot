"use client";
import { useUiText } from '@/app/i18n';
import SafeDialog from "../ui/SafeDialog";
import { OperationalError } from "../ui/OperationalFeedback";
import ActionButton from "@/app/ActionButton";
import {PermissionButton} from '@/app/account/PermissionControls';

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { readApiResponse } from "@/lib/client/read-api-response";

const ARABIC_CRITERIA = { UNIFORM: "الزي والمظهر", POSITION: "الأداء في الموقع", SAFETY: "السلامة", BEHAVIOR: "السلوك والعمل الجماعي", GUEST: "التعامل مع الضيوف" };
function localToday() { const now = new Date(); return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }

function draftFor(evaluation, criteria) {
  const deductions = new Map(evaluation.exceptions.map((item) => [item.criterionId, Number(item.deduction) || 0]));
  return {
    scores: Object.fromEntries(criteria.map((criterion) => [criterion.id, Math.max(0, Number(criterion.maxScore) - (deductions.get(criterion.id) || 0))])),
    supervisorNote: evaluation.supervisorNote || "",
    penaltyNote: evaluation.penaltyNote || "",
    guidanceNote: evaluation.guidanceNote || "",
  };
}

function payloadFor(evaluation, criteria, draft) {
  return {
    employeeId: evaluation.employeeId,
    supervisorNote: draft?.supervisorNote || "",
    penaltyNote: draft?.penaltyNote || "",
    guidanceNote: draft?.guidanceNote || "",
    exceptions: criteria.flatMap((criterion) => {
      const deduction = Math.max(0, Number(criterion.maxScore) - Number(draft?.scores?.[criterion.id] ?? criterion.maxScore));
      const existing = evaluation.exceptions.find((item) => item.criterionId === criterion.id);
      return deduction > 0 ? [{ criterionId: criterion.id, reasonId: existing?.reasonId || null, deduction, note: existing?.note || null }] : [];
    }),
  };
}

function EvaluationEditor({ evaluation, criteria, closed, isArabic, penaltyDeduction, guidanceDeduction, onClose, onSave, busy, error }) {
  const localize = useUiText();
  const initial = Object.fromEntries(criteria.map((criterion) => { const existing = evaluation.exceptions.find((item) => item.criterionId === criterion.id); return [criterion.id, { deduction: existing?.deduction || "", reasonId: existing?.reasonId || "", note: existing?.note || "" }]; }));
  const [values, setValues] = useState(initial);
  const [supervisorNote, setSupervisorNote] = useState(evaluation.supervisorNote || "");
  const [penaltyNote, setPenaltyNote] = useState(evaluation.penaltyNote || "");
  const [guidanceNote, setGuidanceNote] = useState(evaluation.guidanceNote || "");
  const [reason, setReason] = useState("");
  const score = Math.max(0, evaluation.maxScore - Object.values(values).reduce((sum, item) => sum + (Number(item.deduction) || 0), 0) - (penaltyNote.trim() ? penaltyDeduction : 0) - (guidanceNote.trim() ? guidanceDeduction : 0));
  function update(id, key, value) { setValues({ ...values, [id]: { ...values[id], [key]: value } }); }
  function save() {
    const exceptions = criteria.flatMap((criterion) => { const value = values[criterion.id]; const deduction = Number(value.deduction || 0); return deduction > 0 ? [{ criterionId: criterion.id, reasonId: value.reasonId || null, deduction, note: value.note }] : []; });
    onSave({ action: closed ? "correct" : "save", reason, evaluations: [{ employeeId: evaluation.employeeId, supervisorNote, penaltyNote, guidanceNote, exceptions }] });
  }
  return <SafeDialog className="evaluation-editor" titleId="evaluation-editor-title" onClose={onClose} busy={busy} dirty={JSON.stringify(values)!==JSON.stringify(initial)||supervisorNote!==(evaluation.supervisorNote||"")||penaltyNote!==(evaluation.penaltyNote||"")||guidanceNote!==(evaluation.guidanceNote||"")||Boolean(reason)}>{close => <><div className="modal-head"><div><span className="badge">{closed ? (isArabic ? "تصحيح بعد الاعتماد" : "Post-approval correction") : (isArabic ? "تعديل التقييم" : "Edit evaluation")}</span><h2 id="evaluation-editor-title">{evaluation.employee.name}</h2><span>{isArabic ? "النتيجة الحالية" : "Current score"}: {score}/{evaluation.maxScore}</span></div><ActionButton disabled={busy} onClick={close}>{isArabic ? "إغلاق" : localize("Close")}</ActionButton></div><OperationalError error={error}/><fieldset disabled={busy} className="ui-dialog-fields"><div className="evaluation-criteria-editor">{criteria.map((criterion) => <section key={criterion.id}><div><b>{isArabic ? (criterion.labelAr || ARABIC_CRITERIA[criterion.code] || criterion.label) : criterion.label}</b><span>{isArabic ? "الحد الأقصى" : "Maximum"}: {criterion.maxScore}</span></div><label>{isArabic ? "الخصم" : "Deduction"}<input aria-label={`${criterion.code} deduction`} type="number" min="0" max={criterion.maxScore} step="0.5" value={values[criterion.id].deduction} onChange={(event) => update(criterion.id, "deduction", event.target.value)} /></label><label>{isArabic ? "السبب" : localize("Reason")}<select aria-label={`${criterion.code} reason`} value={values[criterion.id].reasonId} onChange={(event) => update(criterion.id, "reasonId", event.target.value)}><option value="">—</option>{criterion.reasons.map((item) => <option value={item.id} key={item.id}>{isArabic ? (item.labelAr || item.label) : item.label}</option>)}</select></label><label>{isArabic ? "ملاحظة" : localize("Note")}<input aria-label={`${criterion.code} note`} value={values[criterion.id].note} onChange={(event) => update(criterion.id, "note", event.target.value)} /></label></section>)}</div><div className="evaluation-action-fields"><label className="penalty">{isArabic ? `جزاء (-${penaltyDeduction} نقطة)` : `Penalty (-${penaltyDeduction} points)`}<textarea aria-label={isArabic ? "جزاء الموظف" : "Employee penalty"} placeholder={isArabic ? "اكتب سبب وتفاصيل الجزاء، أو اتركها فارغة" : "Enter the penalty reason and details, or leave blank"} value={penaltyNote} onChange={(event) => setPenaltyNote(event.target.value)} /></label><label className="guidance">{isArabic ? `إجراء توجيهي (-${guidanceDeduction} نقطة)` : `Guidance action (-${guidanceDeduction} points)`}<textarea aria-label={isArabic ? "الإجراء التوجيهي" : "Guidance action"} placeholder={isArabic ? "اكتب الإجراء التوجيهي، أو اتركه فارغًا" : "Enter the guidance action, or leave blank"} value={guidanceNote} onChange={(event) => setGuidanceNote(event.target.value)} /></label></div><p className="muted evaluation-action-note">{isArabic ? "عند الحفظ يُضاف الجزاء أو التوجيه تلقائيًا إلى ملف الموظف مع الخصم المحدد." : "Saving automatically adds the penalty or guidance to the employee file with the configured deduction."}</p><label className="evaluation-supervisor-note">{isArabic ? "ملاحظة المشرف" : localize("Supervisor note")}<textarea aria-label={isArabic ? "ملاحظة المشرف" : localize("Supervisor note")} value={supervisorNote} onChange={(event) => setSupervisorNote(event.target.value)} /></label>{closed && <label className="evaluation-supervisor-note">{isArabic ? "سبب التصحيح بعد الاعتماد" : "Post-approval correction reason"}<textarea aria-label={isArabic ? "سبب التصحيح بعد الاعتماد" : "Post-approval correction reason"} value={reason} onChange={(event) => setReason(event.target.value)} required /></label>}<div className="evaluation-editor-footer"><div><small>{isArabic ? "النتيجة بعد الخصومات" : "Score after deductions"}</small><b>{score}/{evaluation.maxScore}</b></div><PermissionButton permission={closed?"evaluations.unlock":"evaluations.edit"} disabled={closed && !reason.trim()} onClick={save}>{closed ? (isArabic ? "حفظ التصحيح" : "Save correction") : (isArabic ? "حفظ التقييم" : "Save evaluation")}</PermissionButton></div></fieldset></>}</SafeDialog>;
}

export default function DailyEvaluationPanel({ date }) {
  const localize = useUiText();
  const { isArabic } = useI18n();
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [drafts, setDrafts] = useState({});

  async function load() { try { const response = await fetch(`/api/operations/evaluations?date=${date}`); setData(await readApiResponse(response, "Daily evaluation could not be loaded")); } catch (requestError) { setError(requestError.message); } }
  useEffect(() => { load(); }, [date]);
  useEffect(() => {
    if (!data?.day) return setDrafts({});
    const criteria = data.day.criteriaVersion?.criteria || data.criteriaVersion?.criteria || [];
    setDrafts(Object.fromEntries(data.day.evaluations.map((item) => [item.employeeId, draftFor(item, criteria)])));
  }, [data]);
  async function action(body, successMessage = "") { if(saving.current)return; saving.current=true; setBusy(true); setError(""); setNotice(""); try { const response = await fetch("/api/operations/evaluations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, date }) }); await readApiResponse(response, "Daily evaluation could not be saved"); setSelected(null); if (successMessage) setNotice(successMessage); await load(); } catch (requestError) { setError(requestError.message); } finally { saving.current=false; setBusy(false); } }
  const criteria = data?.criteriaVersion?.criteria || [];
  const maximum = useMemo(() => criteria.reduce((sum, item) => sum + Number(item.maxScore), 0), [criteria]);
  const penaltyDeduction = Math.max(0, Number(data?.rules?.penaltyDeduction ?? 0));
  const guidanceDeduction = Math.max(0, Number(data?.rules?.guidanceDeduction ?? 0));
  function updateScore(employeeId, criterion, rawValue) {
    const value = Math.min(Number(criterion.maxScore), Math.max(0, Number(rawValue)));
    setDrafts((current) => ({ ...current, [employeeId]: { ...(current[employeeId] || { scores: {}, supervisorNote: "" }), scores: { ...(current[employeeId]?.scores || {}), [criterion.id]: value } } }));
  }
  function evaluationPayload(item) { return payloadFor(item, criteria, drafts[item.employeeId] || draftFor(item, criteria)); }
  return <section className="panel"><div className="operations-profile-head"><div><h2>{isArabic ? "التقييم اليومي والمظهر" : "Daily Evaluation & Grooming"}</h2><span>{data?.criteriaVersion?.label || ""}</span></div>{data?.day && <em>{localize(data.day.status)}</em>}</div>
    <OperationalError error={error}/>
    {notice && <div className="alert success">{notice}</div>}
    {!data?.day && data?.team.length > 0 && <PermissionButton permission={"evaluations.create"} onClick={() => action({ action: "open" })}>{isArabic ? "فتح تقييم اليوم" : "Open daily evaluation"}</PermissionButton>}
    {data?.day && data.day.status !== "CLOSED" && data.team.length > data.day.evaluations.length && <PermissionButton permission={"evaluations.edit"} onClick={() => action({ action: "syncTeam" })}>{isArabic ? "تحديث فريق التقييم" : "Update evaluation team"}</PermissionButton>}
    {data?.reviewState?.historicalConflict && <div className="alert danger" role="alert">{isArabic ? "هذا اليوم مقفول تاريخيًا وبه درجات افتراضية غير مؤكدة. التاريخ محفوظ؛ يلزم تصحيح معتمد لتأكيد المراجعة." : "Historically closed with unconfirmed default scores. History is preserved; an authorized correction is required."}</div>}
    <div className="evaluation-score-guide">{criteria.map((criterion) => <div key={criterion.id}><span>{isArabic ? (criterion.labelAr || ARABIC_CRITERIA[criterion.code] || criterion.label) : criterion.label}</span><b>{criterion.maxScore}</b></div>)}{criteria.length > 0 && <div className="total"><span>{isArabic ? "الإجمالي" : "Total"}</span><b>{maximum}</b></div>}</div>
    {!data?.day ? <div className="muted">{data?.team.length ? (isArabic ? "التقييم لم يُفتح بعد؛ القيم الافتراضية تحتاج مراجعة وحفظ." : "Evaluation is not open. Default scores require review and saving.") : (isArabic ? "لا يوجد فريق عامل في الجدول المنشور" : "No working team in the published schedule")}</div> : <>
      <div className="record-table-scroll evaluation-table-wrap"><table className="record-line-table evaluation-table evaluation-ready-table"><thead><tr><th>{isArabic ? "الموظف" : localize("Employee")}</th>{criteria.map((criterion) => <th key={criterion.id}>{isArabic ? (criterion.labelAr || ARABIC_CRITERIA[criterion.code] || criterion.label) : criterion.label}<small>{criterion.maxScore}</small></th>)}<th>{isArabic ? "الإجمالي" : "Total"}</th><th>{isArabic ? "الحفظ" : localize("Save")}</th><th>{isArabic ? "التفاصيل" : localize("Details")}</th></tr></thead><tbody>{data.day.evaluations.map((item) => {
        const draft = drafts[item.employeeId] || draftFor(item, criteria);
        const baseTotal = Math.max(0, criteria.reduce((sum, criterion) => sum + Number(draft.scores?.[criterion.id] ?? criterion.maxScore), 0) - (draft.penaltyNote?.trim() ? penaltyDeduction : 0) - (draft.guidanceNote?.trim() ? guidanceDeduction : 0));
        const total = Math.min(maximum, Math.max(0, baseTotal + Number(item.eventImpact?.points || 0)));
        return <tr key={item.id}><td><b>{item.employee.name}</b><small>{item.status === "DEFAULT_FULL" ? (isArabic ? "افتراضي — لم تتم مراجعته" : "Default — not reviewed") : localize(item.status)}</small><span className="evaluation-action-badges">{draft.penaltyNote?.trim() && <i className="penalty">{isArabic ? "جزاء" : localize("Penalty")} -{penaltyDeduction}</i>}{draft.guidanceNote?.trim() && <i className="guidance">{isArabic ? "توجيه" : localize("Guidance")} -{guidanceDeduction}</i>}</span></td>{criteria.map((criterion) => <td key={criterion.id}><input aria-label={`${item.employee.name} ${criterion.code}`} type="number" min="0" max={criterion.maxScore} step="0.5" disabled={busy || data.day.status === "CLOSED"} value={draft.scores?.[criterion.id] ?? criterion.maxScore} onChange={(event) => updateScore(item.employeeId, criterion, event.target.value)} /></td>)}<td><b>{total}/{maximum}</b>{item.eventImpact?.sourceAdjustments?.length > 0 && <small>{isArabic ? "الأساس" : "Base"}: {baseTotal} · {isArabic ? "أثر أحداث معتمدة" : "Approved event impact"}: {item.eventImpact.points > 0 ? "+" : ""}{item.eventImpact.points}</small>}</td><td>{data.day.status !== "CLOSED" && <PermissionButton permission={"evaluations.edit"} onClick={() => action({ action: "save", evaluations: [evaluationPayload(item)] }, isArabic ? `تم حفظ تقييم ${item.employee.name}` : `${item.employee.name} saved`)}>{isArabic ? "حفظ" : localize("Save")}</PermissionButton>}</td><td><ActionButton className="secondary" onClick={() => setSelected(item)}>{data.day.status === "CLOSED" ? (isArabic ? "عرض / تصحيح" : "View / correct") : (isArabic ? "جزاءات وتوجيه" : "Actions & notes")}</ActionButton></td></tr>;
      })}</tbody></table></div>
      {data.day.status !== "CLOSED" && <div className="evaluation-bulk-actions"><PermissionButton permission={"evaluations.edit"} onClick={() => action({ action: "save", evaluations: data.day.evaluations.map(evaluationPayload) }, isArabic ? "تم حفظ تقييمات الفريق كلها" : "All team evaluations saved")}>{isArabic ? "حفظ الكل" : "Save all"}</PermissionButton><PermissionButton permission={"evaluations.approve"} onClick={() => action({ action: "close" })}>{isArabic ? "اعتماد وإقفال التقييم" : "Finalize and close evaluation"}</PermissionButton></div>}
    </>}
    {selected && <EvaluationEditor busy={busy} error={error} evaluation={selected} criteria={criteria} closed={data.day.status === "CLOSED"} isArabic={isArabic} penaltyDeduction={penaltyDeduction} guidanceDeduction={guidanceDeduction} onClose={() => setSelected(null)} onSave={action} />}
  </section>;
}

