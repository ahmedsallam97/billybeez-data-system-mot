"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PermissionSection, PermissionFieldset } from '@/app/account/PermissionControls';
import { readApiResponse } from '@/lib/client/read-api-response';
import styles from './RosterBraceletSelections.module.css';
import setupStyles from './RosterSetupCard.module.css';
import ActionButton from '../ActionButton';

export default function RosterBraceletSelections({ date, branch, value, isArabic, onSaved, compact=false }) {
  const t = (en, ar) => isArabic ? ar : en;
  const initial = () => Object.fromEntries((value?.rows || []).map(row => [row.code, row.selection || row.stockId || '']));
  const [selections, setSelections] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => { setSelections(initial()); }, [date, branch, value]);
  useEffect(() => { setError(''); setMessage(''); }, [date, branch]);
  if (!value?.rows?.length) return null;
  const pending = value.rows.filter(row => row.state !== 'READY').length;
  const dirty = value.rows.some(row => selections[row.code] !== (row.selection || row.stockId || ''));
  const save = async event => {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      await readApiResponse(await fetch('/api/operations/daily', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'setRosterBracelets', date, branch, selections, expectedRevision: value.revision }) }));
      await onSaved(); setMessage(t('Bracelet stock selections saved for this date.', 'تم حفظ أصناف البريسلت لهذا اليوم.'));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const Heading=compact?'h2':'summary';
  return <PermissionSection permission="stock.edit" as={compact?'section':'details'} className={`panel no-print ${styles.workspace} ${compact?setupStyles.card:''}`} data-bracelet-selections>
    <Heading className={compact?setupStyles.heading:undefined}>{t('Roster bracelet stock', 'البريسلت المستخدم في روستر اليوم')} {pending > 0 && <span className={compact?setupStyles.badge:undefined}>{t(`${pending} need attention`, `${pending} تحتاج مراجعة`)}</span>}</Heading>
    <p className={compact?setupStyles.description:undefined}>{t(compact?'Choose today’s stock variants. Colors appear in the roster; stock quantities stay unchanged.':'Choose the stock variant used today. Its actual color and material appear in the roster, print and image export. This selection does not issue or reserve stock.', 'اختار صنف الستوك المستخدم اليوم؛ لونه وخامته يظهروا في الروستر والطباعة والصورة. الاختيار لا يصرف ولا يحجز مخزون.')} <Link href="/operations/stock">{t('Manage stock', 'فتح الستوك')}</Link></p>
    <form onSubmit={save} className={compact?setupStyles.body:undefined}>
      <PermissionFieldset permission="stock.edit" disabled={busy || value.closed} className={compact?setupStyles.fields:styles.fields}>
        {value.rows.map(row => <label className={compact?setupStyles.field:undefined} key={row.code}><span className={compact?setupStyles.fieldHeading:undefined}>{row.label} {row.required && <small>{t('Required', 'إجباري')}</small>}</span>
          <select aria-label={`${t('Stock for', 'صنف الستوك لـ')} ${row.label}`} value={selections[row.code] || ''} onChange={event => setSelections(current => ({ ...current, [row.code]: event.target.value }))}>
            <option value="">{t('Automatic · one available variant', 'تلقائي عند وجود صنف واحد متاح')}</option>
            {row.options.map(item => <option key={item.id} value={item.id} disabled={item.remaining <= 0}>{item.material} · {item.colorName} · {item.remaining} {t('available', 'متاح')}</option>)}
          </select>
          <small className={compact?setupStyles.hint:undefined}>{!row.options.some(item=>item.remaining>0)?t('Add available stock for this type first.', 'أضف مخزونًا متاحًا لهذا النوع أولًا.'):row.state==='SELECT_STOCK'?t('Multiple variants available. Choose today’s variant.', 'يوجد أكثر من صنف؛ اختار المستخدم اليوم.'):t('Color and material come from the selected stock.', 'اللون والخامة من صنف الستوك المختار.')}</small>
        </label>)}
      </PermissionFieldset>
      {value.closed && <p role="status">{t('This day is closed. Its bracelet colors are preserved; reopen the day to change selections.', 'اليوم مغلق؛ ألوانه محفوظة. افتح اليوم مجددًا لتغيير الاختيارات.')}</p>}
      {error && <p className="alert danger" role="alert">{error}</p>}{message && <p className="alert success" role="status">{message}</p>}
      <footer className={compact?setupStyles.actions:undefined}><ActionButton type="submit" disabled={busy || value.closed || !dirty}>{busy ? t('Saving…', 'جاري الحفظ…') : t('Save today’s bracelet selections', 'حفظ بريسلت اليوم')}</ActionButton><ActionButton type="button" className="secondary" disabled={busy || !dirty} onClick={() => { setSelections(initial()); setError(''); setMessage(''); }}>{t('Cancel changes', 'إلغاء التعديل')}</ActionButton><ActionButton type="button" className="secondary" disabled={busy} onClick={async () => { setBusy(true); setMessage(''); try { await onSaved(); setError(''); } catch(e) { setError(e.message); } finally { setBusy(false); } }}>{t('Reload selections', 'تحديث الاختيارات')}</ActionButton></footer>
    </form>
  </PermissionSection>;
}

