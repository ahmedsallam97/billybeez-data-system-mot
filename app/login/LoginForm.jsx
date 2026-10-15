"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PreferenceIconButtons from "../PreferenceIconButtons";
import { useI18n } from "../i18n";
import {PageShell,PageHeader} from '../ui/DesktopLayout';

export default function LoginForm() {
  const router = useRouter();
  const { t, isArabic } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json().catch(()=>null);

    if (!res.ok || !data?.success) {
      setMessage(res.status === 401 || res.status === 400
        ? (isArabic ? "اسم المستخدم أو كلمة المرور غير صحيحة. راجع البيانات وحاول مرة أخرى." : "The username or password is incorrect. Check your credentials and try again.")
        : (isArabic ? "خدمة الدخول غير متاحة مؤقتًا. حاول مرة أخرى بعد قليل." : "Sign-in is temporarily unavailable. Try again shortly."));
      return;
    }

    router.replace(data.home);
    } catch {
      setMessage(isArabic ? "تعذر الاتصال بالخادم. تحقق من اتصالك ثم أعد المحاولة." : "Could not connect to the server. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <PreferenceIconButtons className="login-tools" />
      <PageShell className="login-layout">
      <form className="login-box stack" onSubmit={submit}>
        <img src="/bb-logo-fast.png" alt="BillyBeez" className="logo" width="240" height="74" fetchPriority="high" />
        <PageHeader title={t("login.submit")} description={t("login.title")} breadcrumb={false}/>
        <label>{t("login.username")}
        <input
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder={t("login.username")}
          autoComplete="username"
          required
        />
        </label>
        <label>{t("login.password")}
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t("login.password")}
          type="password"
          autoComplete="current-password"
          required
        />
        </label>
        <button type="submit" disabled={loading}>{loading ? t("common.loading") : t("login.submit")}</button>
        {message && <div className="message" role="alert">{message}</div>}
      </form>
      </PageShell>
    </main>
  );
}
