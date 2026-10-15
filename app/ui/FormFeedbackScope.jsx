"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';
import {fieldLabel,associateFieldError} from '@/lib/client/field-feedback';

// Uses the existing fields and native constraints. No values or domain rules change.
export default function FormFeedbackScope({ children }) {
  const { isArabic: ar } = useI18n(), prefix = useId(), root = useRef(null), queued = useRef(false), sequence=useRef(0);
  const [invalid, setInvalid] = useState([]);
  const fieldName = field => fieldLabel(field,ar?'الحقل':'Field');
  const message = field => field.validity.valueMissing ? (ar?'هذا الحقل مطلوب.':'This field is required.') : field.validity.rangeUnderflow || field.validity.rangeOverflow ? (ar?'اختر قيمة داخل الحدود المحددة.':'Enter a value within the specified limits.') : field.validity.patternMismatch || field.validity.typeMismatch ? (ar?'راجع صيغة القيمة المدخلة.':'Check the format of the entered value.') : (ar?'راجع القيمة المدخلة.':'Check the entered value.');
  useEffect(() => {
    const cleanup=invalid.map(({field,id})=>associateFieldError(field,id));
    return ()=>cleanup.forEach(clear=>clear());
  }, [invalid]);
  useEffect(() => { const observer=new MutationObserver(()=>setInvalid(current=>{const next=current.filter(({field})=>field.isConnected);return next.length===current.length?current:next;})); if(root.current)observer.observe(root.current,{childList:true,subtree:true}); return()=>observer.disconnect(); }, []);
  const summary = invalid.length>0&&<div className="alert danger ui-form-error-summary" role="alert"><b>{ar?'راجع الحقول التالية قبل الحفظ:':'Review these fields before saving:'}</b><ul>{invalid.map(({field,id,name})=><li key={id}><button type="button" onClick={()=>{field.scrollIntoView({block:'center'});field.focus();}}>{name}</button></li>)}</ul></div>;
  const dialogSlot = invalid.find(({field})=>field.closest('dialog'))?.field.closest('dialog')?.querySelector('[data-dialog-error-slot]');
  return <div ref={root} className="ui-form-feedback-scope" onInvalidCapture={event=>{
    event.preventDefault(); const field=event.target;
    const item={field,id:`${prefix}-error-${sequence.current++}`,name:fieldName(field)};
    setInvalid(current=>current.some(item=>item.field===field)?current:[...current,item]);
    if(!queued.current){queued.current=true;queueMicrotask(()=>{queued.current=false;field.form?.querySelector('input:invalid,select:invalid,textarea:invalid')?.focus();});}
  }} onInputCapture={event=>{const field=event.target;if(field.validity?.valid)setInvalid(current=>current.filter(item=>item.field!==field));}} onChangeCapture={event=>{const field=event.target;if(field.validity?.valid)setInvalid(current=>current.filter(item=>item.field!==field));}} onResetCapture={()=>setInvalid([])}>
    {dialogSlot ? createPortal(summary,dialogSlot) : summary}
    {children}
    {invalid.filter(({field})=>field.isConnected).map(({field,id})=>createPortal(<small className="ui-field-error" id={id}>{message(field)}</small>,field.parentElement,id))}
  </div>;
}
