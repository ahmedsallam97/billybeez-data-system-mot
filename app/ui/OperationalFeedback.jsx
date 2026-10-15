"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n, useUiText } from '../i18n';
import { operationalMessage } from '@/lib/operational-copy';
import {fieldLabel,associateFieldError} from '@/lib/client/field-feedback';

export function OperationalError({ error, recovery, children }) {
  const { isArabic } = useI18n(), localize = useUiText();
  const ref=useRef(null),id=useId(),[field,setField]=useState(null);
  useEffect(()=>{
    setField(null);if(!error||!ref.current)return;
    const raw=String(error?.message||error),scope=ref.current.closest('dialog,[data-desktop-layout]')||ref.current.parentElement;
    const pattern=/hris number/i.test(raw)?/HRIS.*number|رقم.*HRIS/i:/unique catalog code|كود.*فريد/i.test(raw)?/stable code|الكود الثابت/i:/contract end/i.test(raw)?/contract end|نهاية العقد/i:/contract|signed HRIS/i.test(raw)?/contract|عقد/i:/reason.*required|enter a reason/i.test(raw)?/reason|سبب/i:/date|expiry|overlap/i.test(raw)?/date|تاريخ/i:/rating/i.test(raw)?/rating|تقييم/i:null;
    if(!pattern)return;
    const input=[...scope.querySelectorAll('input,select,textarea')].find(item=>!item.disabled&&item.getClientRects().length&&pattern.test(fieldLabel(item,'')));
    if(!input)return;setField(input);const release=associateFieldError(input,id);
    const clear=()=>{setField(null);release();};
    input.addEventListener('input',clear,{once:true});input.addEventListener('change',clear,{once:true});return()=>{input.removeEventListener('input',clear);input.removeEventListener('change',clear);clear();};
  },[error,id]);
  if (!error) return null;
  const text = operationalMessage(error, isArabic ? 'ar' : 'en', localize);
  return <div ref={ref} className="alert danger ui-operational-error" role="alert"><b>{text.message}</b><p>{recovery || text.recovery}</p>{field&&<button type="button" className="secondary" onClick={()=>{field.scrollIntoView({block:'center'});field.focus();}}>{isArabic?'مراجعة الحقل المتأثر':'Review affected field'}</button>}{text.technical && <details><summary>{isArabic ? 'التفاصيل الفنية' : 'Technical details'}</summary><code dir="ltr">{text.technical}</code></details>}{children}{field?.isConnected&&createPortal(<small id={id} className="ui-field-error">{text.message}</small>,field.parentElement,id)}</div>;
}
export function OperationalStatus({ value }) { const localize = useUiText(); return <span className="ui-status" data-status={String(value || '').toLowerCase()}>{localize(String(value || '').replaceAll('_', ' '))}</span>; }
