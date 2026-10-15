'use client';
import { useUiText } from '@/app/i18n';
import ActionButton from "@/app/ActionButton";
import { useState } from 'react';
import {usePermission} from '@/app/account/AccountContext';
import {reportPermission} from '@/lib/accounts/registry';
export default function ReportEvidenceUpload({ reportId, reportType, value = [], onChange, disabled, ar, imageOnly = false }) {
  const localize = useUiText();
  const canUpload=usePermission('reports.upload'),canDownload=usePermission('reports.download');
  const canModuleUpload=usePermission(reportPermission(reportType,'upload')),canModuleDownload=usePermission(reportPermission(reportType,'download'));
  disabled=disabled||!canUpload||!canModuleUpload;
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function upload(event) {
    const file = event.target.files?.[0]; if (!file) return;
    setBusy(true); setError('');
    try {
      if (imageOnly && !file.type.startsWith('image/')) throw new Error(ar ? 'اختر صورة للاستبيان' : 'Choose a survey image');
      const form = new FormData(); form.set('reportId', reportId); form.set('file', file);
      const response = await fetch('/api/operations/reports/files', { method: 'POST', body: form });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      onChange(imageOnly ? [result.file] : [...value, result.file]);
    } catch (e) { setError(e.message); } finally { event.target.value = ''; setBusy(false); }
  }
  return <div style={{display:'grid',gap:8,minWidth:0}}><label>{ar ? 'رفع دليل (حتى 8 ميجابايت)' : 'Upload evidence (up to 8 MB)'}<input type="file" accept={imageOnly ? 'image/jpeg,image/png,image/webp' : 'image/jpeg,image/png,image/webp,application/pdf'} onChange={upload} disabled={disabled || busy}/></label>{busy && <span role="status">{ar ? 'جارٍ الرفع…' : localize("Uploading…")}</span>}{error && <p role="alert">{error}</p>}{value.map((file,i) => <div key={file.id || i} style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>{canDownload&&canModuleDownload?<a href={file.reference} target="_blank" rel="noreferrer">{file.name || (ar ? 'عرض الدليل' : 'View evidence')}</a>:<span>{file.name || (ar ? 'دليل' : 'Evidence')}</span>}{!disabled && <ActionButton type="button" className="secondary" disabled={busy} onClick={() => onChange(value.filter((_,index)=>index!==i))}>{ar ? 'إزالة الرابط' : 'Remove link'}</ActionButton>}</div>)}</div>;
}

