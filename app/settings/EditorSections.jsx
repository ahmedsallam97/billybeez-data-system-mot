"use client";
import ActionButton from "@/app/ActionButton";
import { Children, isValidElement, useEffect, useId, useRef, useState } from "react";
import styles from "./TemplateEditor.module.css";

// Preserve mounted controls and their drafts when changing editor categories.
export default function EditorSections({ children, labels, initialIndex = 0, isArabic }) {
  const [active, setActive] = useState(initialIndex);
  const id = useId();
  const root = useRef(null);
  const panels = Children.toArray(children).flatMap(child => isValidElement(child) && child.props.className === "grid two" ? Children.toArray(child.props.children) : [child]);
  useEffect(() => {
    const target = window.location.hash && document.getElementById(window.location.hash.slice(1));
    const index = target ? [...root.current.querySelectorAll('[role="tabpanel"]')].findIndex(panel => panel.contains(target)) : -1;
    if (index >= 0) setActive(index);
  }, []);
  return <div ref={root} className={styles.sections}>
    <div className={styles.tabs} role="tablist" aria-label={isArabic ? "أقسام المحرر" : "Editor sections"}>
      {labels.map((label, index) => <ActionButton key={index} id={`${id}-tab-${index}`} role="tab" type="button" aria-selected={index === active} aria-controls={`${id}-panel-${index}`} tabIndex={index === active ? 0 : -1} onClick={() => setActive(index)} onKeyDown={event => {
        let next;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = labels.length - 1;
        if (["ArrowLeft", "ArrowRight"].includes(event.key)) next = (index + (event.key === (isArabic ? "ArrowLeft" : "ArrowRight") ? 1 : -1) + labels.length) % labels.length;
        if (next !== undefined) { event.preventDefault(); setActive(next); document.getElementById(`${id}-tab-${next}`)?.focus(); }
      }}>{label}</ActionButton>)}
    </div>
    {panels.map((panel, index) => <div key={index} id={`${id}-panel-${index}`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`} hidden={index !== active}>{panel}</div>)}
  </div>;
}

