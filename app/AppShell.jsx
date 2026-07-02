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
  const canManageBusinessDay = title === "title.manager" && (user.role === "ADMIN" || user.role === "MANAGER");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-block">
          <img src="/bb-logo.png" alt="Billy Beez" className="brand-logo" />
          <div>
            <div className="brand">{shellTitle}</div>
            <div className="muted">{user.name} · {labelRole(user.role)}</div>
          </div>
        </div>
        <nav className="nav">
          {(user.role === "ADMIN" || user.role === "MANAGER") && <Link className="nav-manager" href="/manager">{t("nav.manager")}</Link>}
          {(user.role === "ADMIN" || user.role === "CASHIER") && <Link className="nav-cashier" href="/cashier">{t("nav.cashier")}</Link>}
          {(user.role === "ADMIN" || user.role === "KITCHEN") && <Link className="nav-kitchen" href="/kitchen">{t("nav.kitchen")}</Link>}
          <button className="danger" onClick={logout}>{t("nav.logout")}</button>
          <PreferenceIconButtons />
        </nav>
      </header>
      <main className="container">
        <BusinessDayControl showActions={canManageBusinessDay} />
        {children}
      </main>
    </div>
  );
}
