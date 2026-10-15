"use client";
import { settingsHistoryGuard } from "@/lib/client/settings-history-guard";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import PreferenceIconButtons from "./PreferenceIconButtons";
import { useI18n } from "./i18n";
import { OperationsUiProvider, useOperationsUi } from "./operations/OperationsUiContext";
import ShellProfile from "./ShellProfile";
import {PAGES,pageId} from '@/lib/operations/page-routes';
import PageIdentity from './operations/PageIdentity';
import {PageShell} from './ui/DesktopLayout';
import OperationsNavigation from "./operations/OperationsNavigation";
import shellStyles from "./operations/OperationsShell.module.css";
import { AccountProvider, useAccount } from './account/AccountContext';


export default function AppShell({ title, user, children, initialSettings }) {
  useEffect(() => { settingsHistoryGuard(); }, []);
  const pathname = usePathname();
  const enabled = (pathname === '/account' || pathname === "/opmanager" || pathname.startsWith("/opmanager/") || pathname === "/settings" || pathname.startsWith("/operations"));
  return <AccountProvider user={user}><OperationsUiProvider user={user} enabled={enabled} initialSettings={initialSettings}><AppShellContent title={title} user={user}><PageIdentity />{children}</AppShellContent></OperationsUiProvider></AccountProvider>;
}
function AppShellContent({ title, user, children }) {
  const { user: liveUser } = useAccount();
  user = liveUser || user;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const operationsWorkspace = pathname === '/account' || pathname === "/opmanager" || pathname.startsWith("/opmanager/") || pathname === "/settings" || pathname.startsWith("/operations");
  const { config, error } = useOperationsUi();
  const { t, isArabic, setPreferredLanguage } = useI18n();
  useEffect(()=>{if(user.profile?.preferredLanguage)setPreferredLanguage(user.profile.preferredLanguage);},[user.id,user.profile?.preferredLanguage]);
  const moduleId=pageId(pathname);
  const shellTitle = moduleId ? PAGES[moduleId][isArabic?2:1] : title?.startsWith("title.") ? t(title) : title;
  const [navigationOpen, setNavigationOpen] = useState(false);
  const navigationButton = useRef(null);
  const [mobile,setMobile]=useState(false);
  useEffect(()=>{const media=window.matchMedia("(max-width:620px)");const sync=()=>{setMobile(media.matches);setNavigationOpen(false);};sync();media.addEventListener("change",sync);return()=>media.removeEventListener("change",sync);},[]);
  const workspaceContent = useRef(null);
  useEffect(() => {
    setNavigationOpen(false);
  }, [pathname, searchParams]);
  useEffect(() => {
    if (!navigationOpen) return;
    const close = event => { if (event.key === "Escape") { setNavigationOpen(false); requestAnimationFrame(()=>navigationButton.current?.focus()); } };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [navigationOpen]);
  const content = <>
    {operationsWorkspace && error && <div role="alert" className="alert danger">{error}</div>}
    {operationsWorkspace ? <PageShell>{children}</PageShell> : children}
  </>;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const navbar = (      <header className="topbar">
        {operationsWorkspace && mobile && <button ref={navigationButton} type="button" className={shellStyles.mobileToggle} aria-controls="operations-navigation" aria-expanded={navigationOpen} onClick={()=>setNavigationOpen(value=>!value)}>{isArabic?"☰ القائمة":"☰ Menu"}</button>}
        <div className="brand-block">
          <img src="/bb-logo-fast.png" alt="Billy Beez" className="brand-logo" width="240" height="74" fetchPriority="high" />
          <div>
            <div className="brand">{operationsWorkspace?(isArabic?'بيلي بيز':'Billy Beez'):shellTitle}</div>
            <div className="muted">{isArabic ? 'بيلي بيز · العمليات' : 'Billy Beez · Operations'}</div>
          </div>
        </div>
        <nav className="nav" aria-label={isArabic ? "التنقل الرئيسي" : "Main navigation"}>
          {user.permissions?.['settings.view'] && <Link className="nav-manager" href="/opmanager/settings" aria-current={pathname.startsWith("/opmanager/settings") ? "page" : undefined} onClick={() => setNavigationOpen(false)}>{isArabic ? "الإعدادات" : "Settings"}</Link>}
          {!operationsWorkspace && ["ADMIN","MANAGER"].includes(user.role) && <Link href="/operations">{t("nav.operations")}</Link>}
          <ShellProfile user={user} expanded onLogout={logout} navbar />
          <PreferenceIconButtons />
        </nav>
      </header>);
  if (!operationsWorkspace) return <div className="shell">{navbar}<main className="container">{content}</main></div>;
  return <div className={`shell ${shellStyles.application}`} dir={isArabic?"rtl":"ltr"} data-operations-application="true" data-navigation-open={navigationOpen}>
    {mobile&&navigationOpen&&<button className={shellStyles.backdrop} type="button" aria-label={isArabic?"إغلاق قائمة العمليات":"Close Operations menu"} onClick={()=>{setNavigationOpen(false);requestAnimationFrame(()=>navigationButton.current?.focus());}}/>}
    <aside id="operations-navigation" className={shellStyles.sidebar} hidden={mobile&&!navigationOpen}><OperationsNavigation expanded={navigationOpen} toggleRef={mobile?undefined:navigationButton} onToggle={()=>setNavigationOpen(value=>!value)} onNavigate={()=>{setNavigationOpen(false);workspaceContent.current?.scrollTo({top:0});}}/></aside>
    <div className={shellStyles.mainShell} inert={mobile&&navigationOpen}>
      {navbar}
      <main ref={workspaceContent} className={`container ${shellStyles.content}`} dir={isArabic?"rtl":"ltr"} data-workspace-width={pathname==="/opmanager"?config.appearance.width:undefined}>{content}</main>
    </div>
  </div>;
}
