"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useOperationsUi } from "./OperationsUiContext";
import { resolveEntry } from "@/lib/operations/dashboard-settings";
import { useI18n } from "../i18n";

export default function OperationsEntry({ today, children }) {
  const { config, ready, userId } = useOperationsUi();
  const params = useSearchParams();
  const router = useRouter();
  const { isArabic } = useI18n();
  const entering = params.get("uiEntry") === "1";
  useEffect(() => {
    if (!ready || !entering) return;
    let remembered;
    try { remembered = JSON.parse(localStorage.getItem(`ops-last-view:${userId}`)); } catch { /* Storage is optional. */ }
    router.replace(resolveEntry(config, remembered, today));
  }, [ready, entering, config, userId, today, router]);
  if (entering) return <p role="status">{isArabic ? "جارٍ فتح العمليات…" : "Opening Operations…"}</p>;
  return children;
}
