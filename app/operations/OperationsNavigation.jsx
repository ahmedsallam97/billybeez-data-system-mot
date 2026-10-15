"use client";
import { useUiText } from '@/app/i18n';
import { useState } from "react";
import OperationsIcon from "./OperationsIcon";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useI18n } from "../i18n";
import { visibleNavigation } from "@/lib/operations/dashboard-settings";
import { useOperationsUi } from "./OperationsUiContext";
import styles from "./OperationsNavigation.module.css";
import { useAccount } from '../account/AccountContext';
import {pageId} from '@/lib/operations/page-routes';
import { NAV_PERMISSIONS } from '@/lib/accounts/registry';

export default function OperationsNavigation({ onNavigate, expanded, onToggle, toggleRef }) {
  const localize = useUiText();
  const [tooltip,setTooltip]=useState(null);
  const { isArabic } = useI18n();
  const { config } = useOperationsUi();
  const { user } = useAccount();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = pageId(pathname);
  function showTip(event,label){if(expanded)return;const box=event.currentTarget.getBoundingClientRect();setTooltip({label,top:Math.max(12,Math.min(innerHeight-45,box.top+box.height/2-15)),insetInlineStart:isArabic?innerWidth-box.left+12:box.right+12});}
  return <nav aria-label={isArabic ? "قائمة العمليات" : "Operations menu"} className={styles.navigation} data-expanded={expanded}>
    <button ref={toggleRef} type="button" className={styles.toggle} aria-controls="operations-navigation-items" aria-expanded={expanded} aria-label={isArabic ? "توسيع شريط التنقل" : "Expand navigation rail"} onClick={()=>{setTooltip(null);onToggle();}}><span className="directional-icon" data-collapsing={expanded}><OperationsIcon name="expand"/></span><b>{isArabic?"مساحة العمليات":localize("Operations")}</b></button>
    <div id="operations-navigation-items" className={styles.items}>{visibleNavigation(config).filter(([id])=>Boolean(user?.permissions?.[NAV_PERMISSIONS[id]])).map(([id,en,ar,href])=>{const label=isArabic?ar:en;return <Link key={id} href={href} aria-label={label} aria-current={active===id?"page":undefined} aria-describedby={tooltip?.label===label?"operations-rail-tooltip":undefined} onClick={()=>{setTooltip(null);onNavigate();}} onMouseEnter={event=>showTip(event,label)} onMouseLeave={()=>setTooltip(null)} onFocus={event=>showTip(event,label)} onBlur={()=>setTooltip(null)}><OperationsIcon name={id}/><b>{label}</b></Link>;})}</div>
    {tooltip&&!expanded&&<span id="operations-rail-tooltip" className={styles.tooltip} role="tooltip" style={{top:tooltip.top,insetInlineStart:tooltip.insetInlineStart}}>{tooltip.label}</span>}
  </nav>;
}
