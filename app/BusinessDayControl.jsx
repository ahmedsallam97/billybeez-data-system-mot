"use client";

import { useEffect, useState } from "react";
import { useToast } from "./ToastProvider";
import { useI18n } from "./i18n";

export default function BusinessDayControl({ requiresPassword = false }) {
  const toast = useToast();
  const { t, labelBusinessMessage } = useI18n();
  const [businessState, setBusinessState] = useState(null);
  const [password, setPassword] = useState("");
  const [busyAction, setBusyAction] = useState("");

  useEffect(() => {
    loadState();
  }, []);

  async function loadState() {
    const res = await fetch("/api/business-day");
    const data = await res.json();
    if (data.success) setBusinessState(data.businessState);
  }

  async function runAction(action) {
    if (action === "close" && !window.confirm(t("business.confirmClose"))) return;
    if (action === "open" && !window.confirm(t("business.confirmOpen"))) return;

    if (requiresPassword && !password) {
      toast(t("business.passwordRequired"), "error");
      return;
    }

    setBusyAction(action);
    const res = await fetch("/api/business-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, password: requiresPassword ? password : undefined }),
    });
    const data = await res.json();
    setBusyAction("");

    if (!data.success) {
      toast(data.error || t("business.updateFailed"), "error");
      return;
    }

    setPassword("");
    setBusinessState(data.businessState);
    toast(action === "open" ? t("business.opened") : t("business.closedToast"), "info");
    setTimeout(() => window.location.reload(), 350);
  }

  return (
    <section className={`business-day-control ${businessState?.isOpen ? "status-open" : "status-closed"}`}>
      <div>
        <b>{businessState?.isOpen ? t("business.open") : t("business.closed")}</b>
        <span>{businessState?.businessDate || "-"} · {labelBusinessMessage(businessState?.message)}</span>
      </div>
      <div className={`business-day-actions ${requiresPassword ? "requires-password" : ""}`}>
        {requiresPassword && (
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("business.password")}
            type="password"
            name="business-day-control-code"
            aria-label={t("business.password")}
            inputMode="numeric"
            autoComplete="new-password"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
          />
        )}
        <button
          type="button"
          className="btn-confirm"
          disabled={!businessState || Boolean(busyAction) || businessState.isOpen || (requiresPassword && !password)}
          onClick={() => runAction("open")}
        >
          {t("business.openDay")}
        </button>
        <button
          type="button"
          className="danger"
          disabled={!businessState || Boolean(busyAction) || !businessState.isOpen || (requiresPassword && !password)}
          onClick={() => runAction("close")}
        >
          {t("business.closeDay")}
        </button>
      </div>
    </section>
  );
}
