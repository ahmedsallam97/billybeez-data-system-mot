"use client";

import { useI18n } from "./i18n";

export default function PreferenceIconButtons({ className = "" }) {
  const { t, theme, labelTheme, toggleLanguage, toggleTheme } = useI18n();
  const themeOrder = ["classic", "red", "blue", "orange"];
  const nextTheme = themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length] || "classic";
  const nextThemeLabel = labelTheme(nextTheme);

  return (
    <div className={`preference-icons ${className}`}>
      <button className="icon-toggle" type="button" onClick={toggleLanguage} aria-label={t("nav.languageLabel")} title={t("nav.languageLabel")}>
        <span className="icon-globe" aria-hidden="true" />
      </button>
      <button className="icon-toggle" type="button" onClick={toggleTheme} aria-label={nextThemeLabel} title={nextThemeLabel}>
        <span className="icon-palette" aria-hidden="true" />
      </button>
    </div>
  );
}
