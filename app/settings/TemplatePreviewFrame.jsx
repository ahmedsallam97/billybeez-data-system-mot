"use client";
import ActionButton from "@/app/ActionButton";
import { useEffect, useRef, useState } from "react";
import styles from "./TemplateEditor.module.css";
import { useI18n } from "../i18n";
export default function TemplatePreviewFrame({ children, width = 840 }) {
  const container = useRef(null); const [available, setAvailable] = useState(width); const [fit, setFit] = useState(true);
  const { isArabic } = useI18n();
  useEffect(() => { const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width)); observer.observe(container.current); return () => observer.disconnect(); }, [width]);
  const scale = fit ? Math.min(1, Math.max(.1, available / width)) : 1;
  return <><div className={styles.zoomControls}><ActionButton type="button" className="secondary" aria-pressed={!fit} onClick={() => setFit(false)}>{isArabic ? "الحجم الفعلي" : "Actual size"}</ActionButton><ActionButton type="button" className="secondary" aria-pressed={fit} onClick={() => setFit(true)}>{isArabic ? "ملاءمة المعاينة" : "Fit preview"}</ActionButton><span>{Math.round(scale * 100)}%</span></div><div ref={container} className={styles.frame} tabIndex={0} role="region" aria-label={isArabic ? "معاينة الطباعة القابلة للتمرير" : "Scrollable print preview"}><div className={styles.canvas} style={{ width, zoom: scale }}>{children}</div></div></>;
}

