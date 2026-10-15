"use client";
import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n';

export default function SafeDialog({ children, titleId, onClose, dirty = false, busy = false, className = '', initialFocus }) {
  const ref = useRef(null), latest = useRef({ onClose, dirty, busy });
  const { isArabic } = useI18n();
  latest.current = { onClose, dirty, busy };
  const close = () => {
    const state = latest.current;
    if (state.busy) return;
    if (state.dirty && !window.confirm(isArabic ? 'توجد تغييرات غير محفوظة. هل تريد إلغاء المسودة وإغلاق النافذة؟' : 'Discard the unsaved changes and close this dialog?')) return;
    state.onClose();
  };
  useEffect(() => {
    const dialog = ref.current, previous = document.activeElement;
    dialog.showModal();
    const frame = requestAnimationFrame(() => (dialog.querySelector(initialFocus || '[autofocus]') || dialog.querySelector('input:not([disabled]), textarea:not([disabled]), select:not([disabled])') || dialog.querySelector('button:not([disabled])') || dialog).focus());
    return () => { cancelAnimationFrame(frame); dialog.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={ref} className={`ui-safe-dialog ${className}`} dir={isArabic ? 'rtl' : 'ltr'} aria-labelledby={titleId} aria-busy={busy} tabIndex={-1} onCancel={event => { event.preventDefault(); close(); }} onClick={event => { if (event.target === ref.current) { const box = ref.current.getBoundingClientRect(); if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) close(); } }} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const items = [...ref.current.querySelectorAll('button, input, textarea, select, summary, iframe, a[href], [tabindex]')].filter(item => !item.matches(':disabled') && item.tabIndex >= 0 && item.getClientRects().length);
    if (!items.length) { event.preventDefault(); ref.current.focus(); return; }
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}><div data-dialog-error-slot/>{typeof children === 'function' ? children(close) : children}</dialog>;
}
