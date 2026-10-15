"use client";
import { useUiText } from '@/app/i18n';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { PermissionButton } from '../account/PermissionControls';
import ActionButton from '../ActionButton';
import { readApiResponse } from '@/lib/client/read-api-response';
import styles from './DayResponsibilities.module.css';
import setupStyles from './RosterSetupCard.module.css';

export default function DayResponsibilities({ date: rosterDate, scheduleId, branch, period, onSaved, compact=false, forceEnglish=false, summary=false }) {
  const localize = useUiText();
  const locale = useI18n();
  const isArabic = !forceEnglish && locale.isArabic;
  const [date, setDate] = useState(rosterDate || period?.startDate || '');
  const [data, setData] = useState(null), [values, setValues] = useState(null), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const generation = useRef(0);
  useEffect(() => { setDate(rosterDate || period?.startDate || ''); }, [rosterDate, period?.startDate, scheduleId]);
  async function load() {
    const version = ++generation.current;
    setBusy(true); setError(''); setMessage(''); setData(null); setValues(null);
    try {
      const query = new URLSearchParams({ date, ...(scheduleId ? { scheduleId } : {}), ...(branch ? { branch } : {}) });
      const result = await readApiResponse(await fetch(`/api/operations/responsibilities?${query}`));
      if (version === generation.current) { setData(result); setValues(result.values); }
    } catch (error) { if (version === generation.current) setError(error.message); }
    finally { if (version === generation.current) setBusy(false); }
  }
  useEffect(() => { if (date) load(); return () => { generation.current++; }; }, [date, scheduleId, branch]);
  async function save() {
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await readApiResponse(await fetch('/api/operations/responsibilities', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ date, branch: data.branch, scheduleId: data.scheduleId, expectedRevision: data.revision, values }) }));
      setData(result); setValues(result.values); setMessage(isArabic ? 'تم حفظ المسؤولين لهذا اليوم' : 'Responsibilities saved for this date');
      await onSaved?.(result);
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  function field(key, label, candidates, group, hint='') {
    const value = group ? values?.[group]?.[key] || '' : values?.[key] || '';
    return <label className={compact?setupStyles.field:undefined} key={`${group || 'shift'}:${key}`}><span className={compact?setupStyles.fieldHeading:undefined}>{label}</span><select aria-label={label} value={value} disabled={busy || !data?.canAssign} onChange={event => setValues(current => group ? { ...current, [group]: { ...current[group], [key]: event.target.value } } : { ...current, [key]: event.target.value })}><option value="">{isArabic ? 'بدون تحديد' : 'Not assigned'}</option>{value && !candidates.some(person => person.id === value) && <option value={value}>{isArabic ? 'الموظف لم يعد متاحًا · اختر بديلًا' : 'Employee unavailable · select a replacement'}</option>}{candidates.map(person => <option key={person.id} value={person.id}>{person.nameEn || person.name}</option>)}</select>{compact&&<small className={setupStyles.hint}>{hint}</small>}</label>;
  }
  const eventFields=data&&<>{data.trips.map(item => field(item.id, `${isArabic ? 'تيم ليدر الرحلة' : 'Trip leader'} · ${item.name}`, data.employees, 'trips', 'Overrides the daily trip leader for this booking.'))}{data.birthdays.map(item => field(item.id, `${isArabic ? 'مسؤول عيد الميلاد' : 'Birthday responsible employee'} · ${item.childName || item.name}`, data.employees, 'birthdays', 'Overrides the daily birthday leader for this booking.'))}</>;
  const body = <section className={`panel no-print ${styles.workspace} ${compact ? setupStyles.card : ""}`} aria-label={localize("Daily responsibilities")}>
    <h2 className={compact?setupStyles.heading:undefined}>{isArabic ? 'مسؤولو اليوم' : localize("Daily responsibilities")}</h2>
    {!rosterDate && <label className={styles.date}>{isArabic ? 'التاريخ' : localize("Date")}<input aria-label={localize("Responsibilities date")} type="date" min={period?.startDate} max={period?.endDate} value={date} disabled={busy} onChange={event => setDate(event.target.value)} /></label>}
    <p className={`muted ${compact?setupStyles.description:''}`}>{isArabic ? 'اختَر من الموظفين العاملين في هذا اليوم. تُحفظ الاختيارات لنفس نسخة الجدول وتظهر في الروستر.' : compact?'Choose today’s shift and event leaders. Saved selections appear in this roster.':'Choose employees working on this date. Selections belong to this schedule revision and appear in the roster.'}</p>
    {error && !data && <p role="alert" className="alert danger">{error}</p>}
    {data && values && <div className={compact?setupStyles.body:undefined}>
      <div className={compact?setupStyles.fields:styles.fields}>
        {field('AM', isArabic ? 'تيم ليدر الصبح' : 'Morning team leader', data.employees.filter(person => person.shiftCode === 'AM'),undefined,'Choose an employee working the morning shift.')}
        {field('PM', isArabic ? 'تيم ليدر بليل' : 'Night team leader', data.employees.filter(person => person.shiftCode === 'PM'),undefined,'Choose an employee working the night shift.')}
        {field('TRIP', isArabic ? 'تيم ليدر الرحلة' : 'Trip Team Leader', data.employees,undefined,'Default leader for today’s trips.')}
        {field('BIRTHDAY', isArabic ? 'تيم ليدر عيد الميلاد' : 'Birthday Team Leader', data.employees,undefined,'Default leader for today’s birthdays.')}
        {!compact&&eventFields}
      </div>
      {compact&&(data.trips.length>0||data.birthdays.length>0)&&<details className={setupStyles.overrides}><summary>{localize("Booking-specific leaders ·")} {data.trips.length+data.birthdays.length}</summary><div className={setupStyles.fields}>{eventFields}</div></details>}
      {data.closed && <p className="muted">{isArabic ? 'اليوم مغلق. أعد فتحه لتعديل المسؤولين.' : 'This day is closed. Reopen it to change responsibilities.'}</p>}
      {error && <p role="alert" className="alert danger">{error}</p>}{message && <p role="status" className="alert success">{message}</p>}
      <div className={compact?setupStyles.actions:styles.actions}><PermissionButton permission="rotations.assign" disabled={busy || !data.canAssign} onClick={save}>{isArabic ? 'حفظ المسؤولين' : 'Save responsibilities'}</PermissionButton><ActionButton type="button" icon="refresh" className="secondary" disabled={busy} onClick={load}>{isArabic ? 'إعادة تحميل' : 'Reload'}</ActionButton></div>
    </div>}{busy && !data && <p role="status">{isArabic ? 'جارٍ التحميل…' : 'Loading…'}</p>}
  </section>;
  return summary ? <details className="ui-compact-disclosure"><summary><b>{isArabic ? 'مسؤولو اليوم' : 'Daily responsibilities'}</b><span>{date} · {['AM','PM','TRIP','BIRTHDAY'].map(key => data?.employees.find(employee => employee.id === values?.[key])?.name).filter(Boolean).join(' · ') || (isArabic ? 'اختيار المسؤولين أو تعديلهم' : 'Choose or edit responsible employees')}</span></summary>{body}</details> : body;
}


