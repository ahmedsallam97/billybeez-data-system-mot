"use client";
import { useUiText } from '@/app/i18n';
import { useEffect, useRef, useState } from 'react';
import styles from './daily-preview/OperationsPoster.module.css';
import ActionButton from '../ActionButton';
import { rotationOptionGroups } from '@/lib/operations/rotation-option-groups';
const reasons = {
  LOCKED: ['Locked assignment', 'تكليف مقفول'], CLOSED: ['Closed or historical roster', 'روستر مغلق أو تاريخي'],
  INACTIVE: ['Inactive employee', 'موظف غير نشط'], FRONT_ASSIGNMENT: ['Fixed front assignment', 'تكليف أمامي ثابت'],
  OVERLAPPING: ['Overlapping assignments need review', 'تكليفات متعارضة تحتاج مراجعة'], OUTSIDE_SHIFT: ['Outside employee shift', 'خارج شيفت الموظف'],
  ABSENT: ['Employee is absent', 'الموظف غائب'], BREAK: ['Employee break', 'استراحة الموظف'], EXCLUDED: ['Excluded from this shift', 'مستبعد من الشيفت'],
  ROLE: ['Role not allowed', 'الوظيفة غير مسموحة'], QUALIFICATION: ['Qualification required', 'التأهيل مطلوب'], MAX_COVERAGE: ['Maximum coverage reached', 'وصل للحد الأقصى للتغطية'],
  COMPONENT_CONFLICT: ['A shared location is already assigned', 'أحد المكانين موزع بالفعل'],
  OVERRIDE_REQUIRED: ['Manual override must be enabled', 'يجب تفعيل التجاوز اليدوي أولًا'],
  TEAM_LEADER: ['Fixed team leader assignment', 'تكليف تيم ليدر ثابت'], HANDOVER_BREAK: ['AM handover break', 'استراحة تسليم الشيفت'], PM_HANDOVER_SUPPORT_ONLY: ['AM support only after PM arrival', 'دعم الصبح بعد حضور الليل'], AFTER_HANDOVER_ONLY: ['Available after the handover break', 'متاح بعد استراحة التسليم'], DATA_EXIT_COVERAGE: ['Other locations must be covered before Data and Exit', 'يجب تغطية باقي المواقع قبل Data وExit'],
};
export const rotationCellReason = (code, ar) => reasons[code]?.[ar ? 1 : 0] || code;
export function RotationCellSelect({ cell, assignment, isArabic, allowDisabled, disabled, onChange }) {
  if (!cell) return <span title={isArabic ? 'خارج ساعات الشيفت' : 'Outside shift hours'}>—</span>;
  const current = cell.options.find(o => o.id === cell.currentPositionId);
  const groups = rotationOptionGroups(cell.options, allowDisabled);
  const previousLabel = (isArabic && current?.labelAr) || assignment?.position?.label || current?.label || (cell.currentPositionId ? cell.currentPositionId : isArabic ? 'بدون تكليف' : 'Unassigned');
  const label = isArabic ? `موقع ${cell.employeeName} ${cell.startTime} إلى ${cell.endTime}` : `Location for ${cell.employeeName} ${cell.startTime} to ${cell.endTime}`;
  const renderOption = option => <option key={option.id} value={option.id} disabled={Boolean(option.displayReason)} data-rotation-current={option.id===cell.currentPositionId?'true':undefined}>{(isArabic && option.labelAr) || option.label || option.code}{option.id===cell.currentPositionId ? (isArabic?' · الحالي':' · Current') : ''}{option.displayReason ? ` — ${rotationCellReason(option.displayReason, isArabic)}` : option.requiresOverride ? (isArabic?' — تجاوز يدوي':' — manual override') : ''}</option>;
  return <>
    <span className="ops-rotation-export-label">{assignment?.position?.label || current?.label || (cell.blocked === 'BREAK' ? (isArabic ? 'استراحة' : 'Break') : '')}</span>
    <select className="ops-rotation-select" aria-label={label} value={cell.currentPositionId} disabled={disabled || Boolean(cell.blocked)} title={cell.blocked ? rotationCellReason(cell.blocked, isArabic) : (current?.label || label)} onChange={event => onChange({ cell, positionId: event.target.value, previousLabel })}>
      <option value="">{cell.blocked ? rotationCellReason(cell.blocked, isArabic) : isArabic ? 'بدون تكليف' : 'Unassigned'}</option>
      {cell.currentPositionId && !current && <option value={cell.currentPositionId} data-rotation-current="true">{previousLabel} · {isArabic?'الحالي':'Current'}</option>}
      {groups.available.length>0&&<optgroup label={isArabic?'المواقع المتاحة':'Available locations'}>{groups.available.map(renderOption)}</optgroup>}
      {groups.unavailable.length>0&&<optgroup label={isArabic?'غير متاح · السبب موضح':'Unavailable locations'}>{groups.unavailable.map(renderOption)}</optgroup>}
    </select>
  </>;
}
export function RotationCellDialog({ pending, isArabic, saving, error, onSave, onCancel }) {
  const localize = useUiText();
  const ref = useRef(null), [reason, setReason] = useState('');
  useEffect(() => { ref.current?.showModal(); }, []);
  const option = pending.cell.options.find(o => o.id === pending.positionId);
  const current = pending.cell.options.find(o=>o.id===pending.cell.currentPositionId);
  const previous = pending.previousLabel || (isArabic&&current?.labelAr) || current?.label || pending.cell.currentPositionId || (isArabic?'بدون تكليف':'Unassigned');
  const next = option ? ((isArabic&&option.labelAr)||option.label) : (isArabic?'بدون تكليف':'Unassigned');
  return <dialog ref={ref} className={styles.editDialog} onCancel={event => { event.preventDefault(); if (!saving) onCancel(); }} aria-labelledby="rotation-edit-heading" dir={isArabic ? 'rtl' : 'ltr'}>
    <form onSubmit={event => { event.preventDefault(); onSave(reason); }}>
      <h2 id="rotation-edit-heading">{isArabic ? 'تعديل تكليف الروتيشن' : 'Change rotation assignment'}</h2>
      <p><b>{pending.cell.employeeName}</b> · <bdi>{pending.cell.startTime}–{pending.cell.endTime}</bdi></p>
      <div className={styles.changeSummary} aria-label={isArabic?'ملخص تغيير الموقع':'Assignment change'}>
        <div data-rotation-change-from><span>{isArabic?'قبل التعديل':localize("Before")}</span><strong>{previous}</strong></div>
        <span className={styles.changeArrow} aria-hidden="true">{isArabic?'←':'→'}</span>
        <div data-rotation-change-to><span>{isArabic?'بعد التعديل':localize("After")}</span><strong>{next}</strong></div>
      </div>
      <p>{isArabic ? 'سيتم حفظ نسخة جديدة مع الاحتفاظ بالنسخة السابقة. التعديل اليدوي لن يُستبدل بالتوليد العادي.' : 'Saves a new version and keeps the previous roster. Normal generation preserves this manual assignment.'}</p>
      {option?.requiresOverride && <p className="alert warning">{isArabic ? 'أنت تؤكد تجاوز استبعاد الموقع من هذا الشيفت.' : 'You are explicitly overriding this location’s exclusion from the shift.'}</p>}
      <label>{isArabic ? 'سبب التعديل' : 'Reason for change'}<textarea aria-label={isArabic ? 'سبب التعديل' : 'Reason for change'} autoFocus required value={reason} onChange={event => setReason(event.target.value)} rows={3} disabled={saving}/></label>
      {error && <p className="alert danger" role="alert">{error}</p>}
      <div className={styles.editActions}><ActionButton type="submit" disabled={saving || !reason.trim()}>{saving ? (isArabic ? 'جارٍ الحفظ…' : 'Saving…') : (isArabic ? 'حفظ التعديل' : 'Save change')}</ActionButton><ActionButton className="secondary" type="button" onClick={onCancel} disabled={saving}>{isArabic ? 'إلغاء' : localize("Cancel")}</ActionButton></div>
    </form>
  </dialog>;
}

