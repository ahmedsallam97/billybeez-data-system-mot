"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { useI18n } from "../i18n";
import ManagerClient from "../manager/ManagerClient";
import OperationsSettingsClient from "./OperationsSettingsClient";

export default function SettingsPortal() {
  const params = useSearchParams();
  const { isArabic } = useI18n();
  const [section, setSection] = useState(params.get("section") === "business" ? "business" : "operations");
  return <div className="settings-portal">
    <nav className="panel settings-portal-nav" aria-label={isArabic ? "أقسام الإعدادات" : "Settings sections"}>
      <button type="button" className={section === "operations" ? "active" : ""} onClick={() => setSection("operations")}>{isArabic ? "إعدادات العمليات والإنسايتس" : "Operations settings & insights"}</button>
      <button type="button" className={section === "business" ? "active" : ""} onClick={() => setSection("business")}>{isArabic ? "إعدادات الإدارة" : "Business administration"}</button>
    </nav>
    {section === "operations" ? <OperationsSettingsClient /> : <ManagerClient />}
  </div>;
}
