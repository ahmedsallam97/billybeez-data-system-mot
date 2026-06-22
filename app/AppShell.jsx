"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import BusinessDayControl from "./BusinessDayControl";

export default function AppShell({ title, user, children }) {
  const router = useRouter();

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
            <div className="brand">{title}</div>
            <div className="muted">{user.name} · {user.role}</div>
          </div>
        </div>
        <nav className="nav">
          {(user.role === "ADMIN" || user.role === "MANAGER") && <Link href="/manager">Manager</Link>}
          {(user.role === "ADMIN" || user.role === "MANAGER" || user.role === "CASHIER") && <Link href="/cashier">Cashier</Link>}
          {(user.role === "ADMIN" || user.role === "MANAGER" || user.role === "KITCHEN") && <Link href="/kitchen">Kitchen</Link>}
          <button className="danger" onClick={logout}>Logout</button>
        </nav>
      </header>
      <main className="container">
        <BusinessDayControl />
        {children}
      </main>
    </div>
  );
}
