"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import BusinessDayControl from "./BusinessDayControl";
import PreferenceIconButtons from "./PreferenceIconButtons";
import { useI18n } from "./i18n";

export default function AppShell({ title, user, children }) {
  const router = useRouter();
  const { t, labelRole } = useI18n();
  const shellTitle = title?.startsWith("title.") ? t(title) : title;
  const requiresDayPassword = title !== "title.manager" || ["CASHIER", "KITCHEN", "DATA"].includes(user.role);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-block">
          <img src="/bb-logo-fast.png" alt="Billy Beez" className="brand-logo" width="240" height="74" fetchPriority="high" />
          <div>
            <div className="brand">{shellTitle}</div>
            <div className="muted"><span className={user.employeeId ? "" : "general-account-name"}>{user.name}</span> · {labelRole(user.role)}</div>
          </div>
        </div>
        <nav className="nav">
          {(user.role === "ADMIN" || user.role === "MANAGER") && <Link className="nav-manager" href="/manager">{t("nav.manager")}</Link>}
          {(user.role === "ADMIN" || user.role === "CASHIER" || user.role === "DATA") && <Link className="nav-data" href="/data">{t("nav.data")}</Link>}
          {(user.role === "ADMIN" || user.role === "KITCHEN") && <Link className="nav-kitchen" href="/kitchen">{t("nav.kitchen")}</Link>}
          {(user.role === "ADMIN" || user.role === "MANAGER") && (
            <a className="nav-database" href="http://127.0.0.1:5555" target="_blank" rel="noreferrer">
              {t("nav.database")}
            </a>
          )}
          <button className="danger" onClick={logout}>{t("nav.logout")}</button>
          <PreferenceIconButtons />
        </nav>
      </header>
      <main className="container">
        <BusinessDayControl requiresPassword={requiresDayPassword} />
        {children}
      </main>
    </div>
  );
}
