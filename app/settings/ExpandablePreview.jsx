"use client";
import ActionButton from "@/app/ActionButton";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "./PreviewWorkspace.module.css";

export default function ExpandablePreview({ children, className = "", label, isArabic = false, collapsed = false }) {
  const [expanded, setExpanded] = useState(false);
  const modal = useRef(null);
  const trigger = useRef(null);
  const wasExpanded = useRef(false);
  useEffect(() => {
    if (expanded) modal.current?.showModal();
    else if (wasExpanded.current) trigger.current?.focus({ preventScroll: true });
    wasExpanded.current = expanded;
  }, [expanded]);
  const close = () => setExpanded(false);
  return <>
    <aside className={`${className} ${styles.panel}`} aria-label={label} data-preview-panel>
      <details open={!collapsed} data-preview-disclosure><summary>{label || (isArabic?"المعاينة":"Preview")}</summary>
      <div className={styles.actions}><ActionButton ref={trigger} type="button" className="secondary" aria-haspopup="dialog" onClick={() => setExpanded(true)}>{isArabic ? "توسيع المعاينة" : "Expand preview"}</ActionButton></div>
      {!expanded ? children : <p>{isArabic ? "المعاينة مفتوحة في نافذة موسعة." : "Preview is open in the expanded window."}</p>}
      </details>
    </aside>
    {expanded && createPortal(<dialog ref={modal} className={styles.dialog} aria-label={label} dir={isArabic ? "rtl" : "ltr"} onCancel={event => { event.preventDefault(); close(); }} onClose={close}>
      <header className={styles.dialogHead}><strong>{isArabic ? "معاينة موسعة" : "Expanded preview"}</strong><ActionButton autoFocus type="button" className="secondary" onClick={close}>{isArabic ? "إغلاق المعاينة الموسعة" : "Close expanded preview"}</ActionButton></header>
      <div className={`${className} ${styles.dialogBody}`}>{children}</div>
    </dialog>, document.body)}
  </>;
}

