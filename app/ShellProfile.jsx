"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useI18n } from "./i18n";
import PreferenceIconButtons from "./PreferenceIconButtons";
import { Avatar } from './account/AccountContext';

export default function ShellProfile({ user, expanded, onLogout, navbar = false }) {
  const { isArabic, labelRole, t } = useI18n();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({});
  const trigger = useRef(null), menu = useRef(null);
  const branch = user.profile?.allBranches ? (isArabic ? 'جميع الفروع' : 'All branches') : user.profile?.branches?.join(', ') || user.employee?.branch;
  const name = user.profile?.displayName || user.name;
  const role = user.roleName || labelRole(user.role);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const box = trigger.current.getBoundingClientRect();
      const width = Math.min(288, window.innerWidth - 24);
      const left = Math.max(12, Math.min(window.innerWidth - width - 12, isArabic ? box.right - width : box.left));
      setPosition({ left, width, ...(navbar ? { top:box.bottom+8,maxHeight:Math.max(120,window.innerHeight-box.bottom-20) } : { bottom: Math.max(12, window.innerHeight - box.top + 8), maxHeight: Math.max(120, box.top - 24) }) });
    };
    place(); menu.current?.querySelector("a,button")?.focus();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, isArabic]);
  useEffect(() => {
    if (!open) return;
    const pointer = event => { if (!menu.current?.contains(event.target) && !trigger.current?.contains(event.target)) setOpen(false); };
    const key = event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key !== "Tab") return;
      const controls = [...menu.current.querySelectorAll("a,button")];
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
    };
    document.addEventListener("pointerdown", pointer); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", key); };
  }, [open]);
  useEffect(() => { setOpen(false); }, [expanded]);
  return <div className={`shell-profile ${navbar ? 'navbar-profile' : ''}`}>
    <button ref={trigger} type="button" className="shell-profile-trigger" aria-label={isArabic ? "الحساب الشخصي" : "User account"} aria-expanded={open} aria-controls="shell-profile-menu" onClick={() => setOpen(value => !value)}>
      <Avatar user={user}/>
      {expanded && <span className="shell-profile-summary"><strong>{name}</strong><small>{role}</small></span>}
    </button>
    {open && createPortal(<section ref={menu} id="shell-profile-menu" role="dialog" aria-label={isArabic ? "الحساب الشخصي" : "User account"} className="shell-profile-menu" dir={isArabic ? "rtl" : "ltr"} style={position}>
      <header><strong>{name}</strong><span>{role}</span><small>{branch || (isArabic ? "الفرع غير محدد" : "Branch unassigned")}</small></header>
      <Link href="/account" onClick={()=>setOpen(false)}>{isArabic?'ملفي الشخصي':'My Profile'}</Link>
      <Link href="/account?section=password#password" onClick={()=>setOpen(false)}>{isArabic?'تغيير كلمة المرور':'Change Password'}</Link>
      {user.permissions?.['users.view'] && <Link href="/opmanager/settings?category=access" onClick={()=>setOpen(false)}>{isArabic?'إعدادات الحسابات':'Account Settings'}</Link>}
      {user.employeeId && user.permissions?.['employees.view'] && <Link href={`/operations/employees?employeeId=${encodeURIComponent(user.employeeId)}`} onClick={() => setOpen(false)}>{isArabic ? "ملفي الوظيفي" : "My employee profile"}</Link>}
      {user.permissions?.['settings.view'] && <Link href="/opmanager/settings" onClick={() => setOpen(false)}>{isArabic ? "الإعدادات" : "Settings"}</Link>}
      <div className="shell-profile-preferences"><span>{isArabic ? "اللغة والألوان" : "Language and theme"}</span><PreferenceIconButtons /></div>
      <button type="button" className="danger" onClick={onLogout}>{t("nav.logout")}</button>
      <button type="button" className="secondary" onClick={close}>{t("common.close")}</button>
    </section>, document.body)}
  </div>;
}
