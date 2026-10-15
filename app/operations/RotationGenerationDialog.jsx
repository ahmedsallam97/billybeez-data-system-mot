"use client";
import { useUiText, useI18n } from '@/app/i18n';
import SafeDialog from '../ui/SafeDialog';
import { useState } from 'react';
import ActionButton from '../ActionButton';
import RotationPreview from './RotationPreview';
import styles from './RotationGenerationDialog.module.css';

export default function RotationGenerationDialog({ date, branch, onApplied, onCancel }) {
  const localize = useUiText();
  const { isArabic } = useI18n();
  const [busy, setBusy] = useState(false);
  return <SafeDialog className={`${styles.dialog} no-print`} titleId="rotation-generation-title" onClose={onCancel} busy={busy}>{close => <>
    <header className={styles.header}>
      <div><h2 id="rotation-generation-title">{isArabic ? 'معاينة توزيع الروتيشن' : 'Rotation Distribution Preview'}</h2><p>{date} · {branch}</p></div>
      <ActionButton type="button" icon="cancel" className="secondary" disabled={busy} onClick={close} aria-label={localize("Close rotation generation")}>Close rotation generation</ActionButton>
    </header>
    <p className={styles.intro}>{isArabic ? 'راجع تغطية الشيفتات والمشكلات قبل التطبيق. المعاينة وإعادة توليدها لا تعدّلان الروستر؛ التكليفات اليدوية والمثبتة محفوظة دائمًا.' : 'Review shift coverage and issues before applying. Previewing and regenerating do not change the roster; manual and locked assignments are always preserved.'}</p>
    <RotationPreview date={date} branch={branch} isArabic={isArabic} autoPreview onBusyChange={setBusy} onCancel={close} onApplied={onApplied}/>
  </>}</SafeDialog>;
}
