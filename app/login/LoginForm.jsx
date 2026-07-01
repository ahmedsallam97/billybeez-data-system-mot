"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import PreferenceIconButtons from "../PreferenceIconButtons";
import { useI18n } from "../i18n";

export default function LoginForm() {
  const router = useRouter();
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();

    setLoading(false);

    if (!data.success) {
      setMessage(data.error || t("login.failed"));
      return;
    }

    router.replace(data.home);
  }

  return (
    <div className="login-page">
      <PreferenceIconButtons className="login-tools" />
      <form className="login-box stack" onSubmit={submit}>
        <img src="/bb-logo.png" alt="BillyBeez" className="logo" />
        <h1>{t("login.title")}</h1>
        <input
          name="username"
          aria-label={t("login.username")}
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder={t("login.username")}
          autoComplete="username"
          required
        />
        <input
          name="password"
          aria-label={t("login.password")}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={t("login.password")}
          type="password"
          autoComplete="current-password"
          required
        />
        <button type="submit" disabled={loading}>{loading ? t("common.loading") : t("login.submit")}</button>
        <div className="message">{message}</div>
      </form>
    </div>
  );
}
