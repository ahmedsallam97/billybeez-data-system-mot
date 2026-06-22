"use client";

import { useEffect, useState } from "react";
import { useToast } from "./ToastProvider";

export default function BusinessDayControl() {
  const toast = useToast();
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
    setBusyAction(action);
    const res = await fetch("/api/business-day", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, password }),
    });
    const data = await res.json();
    setBusyAction("");

    if (!data.success) {
      toast(data.error || "Business day update failed", "error");
      return;
    }

    setPassword("");
    setBusinessState(data.businessState);
    toast(action === "open" ? "Business day opened" : "Business day closed", "info");
    setTimeout(() => window.location.reload(), 350);
  }

  return (
    <section className="business-day-control">
      <div>
        <b>{businessState?.isOpen ? "اليوم مفتوح" : "اليوم مقفول"}</b>
        <span>{businessState?.businessDate || "-"} · {businessState?.message || "Loading..."}</span>
      </div>
      <div className="business-day-actions">
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Manager password"
          type="password"
        />
        <button className="btn-confirm" disabled={busyAction === "open"} onClick={() => runAction("open")}>Open Day</button>
        <button className="danger" disabled={busyAction === "close"} onClick={() => runAction("close")}>Close Day</button>
      </div>
    </section>
  );
}
