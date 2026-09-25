"use client";

const ENGLISH_MONTHS = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const THEME_PRESETS = {
  CLASSIC: { primary: "#54209a", secondary: "#210067", accent: "#f8c800", background: "#ffffff", text: "#210067" },
  ROYAL: { primary: "#173f7a", secondary: "#0c254d", accent: "#d6aa3b", background: "#fffdf6", text: "#0c254d" },
  CELEBRATION: { primary: "#b61f55", secondary: "#4c164f", accent: "#f2b632", background: "#fff8fb", text: "#35153f" },
};
const DEFAULT_MONTHLY = {
  template: "T01", brandTagline: "PLAY · LEARN · GROW", titleLine1: "Employee", titleLine2: "of The Month",
  congratulations: "Congratulations, {firstName}!", message: "We are proud to have you on our team.",
  leftMessage: "SAME\nTEAM\nBIGGER\nSMILES", rightMessage: "GREAT\nPEOPLE\nBRIGHTER\nTOMORROWS",
  nameFontFamily: '"Avenir Next", "Segoe UI", Arial, sans-serif', nameFontSize: 34, nameFontWeight: 950,
  nameLetterSpacing: 0, nameColor: "#ffffff", nameBackground: "linear-gradient(100deg,#7a36bd,#2c076b)",
  nameMaxLines: 2, photoFit: "cover", photoPosition: "center",
};
const DEFAULT_HALL = {
  slogan: "GREAT\nPEOPLE\nBRIGHTER\nTOMORROWS", title: "HALL OF FAME", subtitle: "OUR EMPLOYEES OF THE MONTH",
  intro: "A YEAR OF DEDICATION, PASSION AND IMPACT", messageTitle: "To Our Amazing Team,",
  messageParagraph1: "As we close another incredible year, we proudly celebrate our Employees of the Month — individuals who truly represent the spirit of Billy Beez. Your hard work, positive attitude, and commitment to excellence make a real difference every day.",
  messageParagraph2: "Each of you has shown what it means to go above and beyond. Your dedication helps us build a brighter, happier, and more successful Billy Beez.",
  messageHighlight: "Thank you for being the heart of our success!", messageFooter: "Here’s to an even more exciting year ahead — more growth, more achievements, and many more smiles together!",
  signatureLabel: "With Appreciation,", signature: "Billy Beez Management", awaitingWinner: "Awaiting finalized winner",
  nameFontFamily: '"Avenir Next", "Segoe UI", Arial, sans-serif', nameFontSize: 11, nameFontWeight: 900,
  nameLetterSpacing: 0, nameColor: "#210067", nameMaxLines: 2, photoFit: "cover", photoPosition: "center",
  oddMonthColor: "#54209a", evenMonthColor: "#f8c800",
};

function initials(name) { return String(name || "BB").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function rawDisplayName(employee) { return employee?.nameEn || employee?.operationalName || employee?.name || "BILLY BEEZ STAR"; }
function displayName(employee, config) { return config?.employeeNameOverrides?.[employee?.id] || rawDisplayName(employee); }
function lines(value) { return String(value || "").split("\n").map((line, index) => <span key={`${line}-${index}`}>{line}</span>); }
function resolveConfig(config = {}) {
  const preset = THEME_PRESETS[config.theme] || THEME_PRESETS.CLASSIC;
  const global = { logoUrl: "/bb-logo-fast.png", fontFamily: '"Avenir Next", "Segoe UI", Arial, sans-serif', ...preset, ...(config.global || {}) };
  return { ...config, global, monthly: { ...DEFAULT_MONTHLY, ...(config.monthly || {}) }, hall: { ...DEFAULT_HALL, ...(config.hall || {}) } };
}
function artworkStyle(config, kind) {
  const resolved = resolveConfig(config); const detail = resolved[kind];
  return {
    "--rec-primary": resolved.global.primary, "--rec-secondary": resolved.global.secondary,
    "--rec-accent": resolved.global.accent, "--rec-background": resolved.global.background,
    "--rec-text": resolved.global.text, "--rec-font": resolved.global.fontFamily,
    "--rec-name-font": detail.nameFontFamily, "--rec-name-size": `${Number(detail.nameFontSize) || 12}px`,
    "--rec-name-weight": Number(detail.nameFontWeight) || 900, "--rec-name-spacing": `${Number(detail.nameLetterSpacing) || 0}px`,
    "--rec-name-color": detail.nameColor || resolved.global.text, "--rec-name-lines": Math.max(1, Number(detail.nameMaxLines) || 2),
    "--rec-photo-fit": detail.photoFit || "cover", "--rec-photo-position": detail.photoPosition || "center",
  };
}
function EmployeePhoto({ employee, hall = false, config }) {
  const photoUrl = employee?.photoUrl || employee?.imageUrl || employee?.photo || ""; const name = displayName(employee, config);
  return <div className={`eotm-master-photo ${hall ? "hall-photo" : ""}`}><span aria-label={employee ? `Photo placeholder for ${name}` : "Awaiting winner photo"}>{employee ? initials(name) : "—"}</span>{photoUrl && <img src={photoUrl} alt={name} onError={(event) => { event.currentTarget.style.display = "none"; }} />}</div>;
}
function Brand({ config, tagline }) { const resolved = resolveConfig(config); return <div className="eotm-master-brand"><img src={resolved.global.logoUrl} alt="Billy Beez" /><span>{tagline}</span></div>; }

export function MonthlyWinnerArtwork({ winner, variant, config }) {
  if (!winner) return null;
  const resolved = resolveConfig(config); const monthly = resolved.monthly; const activeVariant = variant || monthly.template || "T01";
  const name = displayName(winner.employee, resolved); const firstName = name.trim().split(/\s+/)[0];
  const replaceName = (value) => String(value || "").replaceAll("{firstName}", firstName).replaceAll("{name}", name);
  return <article className={`recognition-artwork eotm-master-artwork eotm-${activeVariant.toLowerCase()}`} style={{ ...artworkStyle(resolved, "monthly"), "--rec-name-background": monthly.nameBackground }} data-recognition-kind="monthly" dir="ltr">
    <div className="eotm-corner corner-one" aria-hidden="true" /><div className="eotm-corner corner-two" aria-hidden="true" /><div className="eotm-burst burst-one" aria-hidden="true">•••</div><div className="eotm-burst burst-two" aria-hidden="true">•••</div>
    <Brand config={resolved} tagline={monthly.brandTagline} /><div className="eotm-master-title"><b>{monthly.titleLine1}</b><strong>{monthly.titleLine2}</strong><i aria-hidden="true" /></div>
    <div className="eotm-photo-frame"><EmployeePhoto employee={winner.employee} config={resolved} /></div><div className="eotm-name-ribbon">{name}</div>
    <div className="eotm-master-period"><i />{ENGLISH_MONTHS[winner.month - 1]} {winner.year}<b>·</b>{winner.branch || "MOT"}<i /></div>
    <div className="eotm-master-message"><b>{replaceName(monthly.congratulations)}</b><span>{replaceName(monthly.message)}</span></div>
    <div className="eotm-side-copy side-left">{lines(monthly.leftMessage)}</div><div className="eotm-side-copy side-right">{lines(monthly.rightMessage)}</div><div className="eotm-bee-watermark" aria-hidden="true">B</div>
  </article>;
}

export function HallOfFameArtwork({ winners, yearLabel, config }) {
  const resolved = resolveConfig(config); const hall = resolved.hall; const year = Number(yearLabel) || new Date().getFullYear();
  const slots = ENGLISH_MONTHS.map((month, index) => ({ month, winner: winners.find((item) => item.year === year && item.month === index + 1) || null }));
  return <article className="recognition-artwork hall-master-artwork" style={{ ...artworkStyle(resolved, "hall"), "--hall-odd": hall.oddMonthColor, "--hall-even": hall.evenMonthColor }} data-recognition-kind="hall" dir="ltr">
    <div className="hall-wave hall-wave-top" aria-hidden="true" /><div className="hall-wave hall-wave-bottom" aria-hidden="true" />
    <header><div className="hall-slogan">{lines(hall.slogan)}</div><Brand config={resolved} tagline={resolved.monthly.brandTagline} /><b>{year}</b></header>
    <div className="hall-master-heading"><div className="hall-crown" aria-hidden="true">♛</div><h2>{hall.title}</h2><h3>{hall.subtitle}</h3><p>{hall.intro}</p></div>
    <div className="hall-month-grid">{slots.map(({ month, winner }, index) => <section className={`hall-month-card ${index % 2 ? "yellow" : "purple"}`} key={month}><div className="hall-month-label">{month}</div><EmployeePhoto employee={winner?.employee} hall config={resolved} /><b>{winner ? displayName(winner.employee, resolved) : "TBA"}</b><span>{winner ? `${winner.branch || "MOT"} Branch` : hall.awaitingWinner}</span></section>)}</div>
    <section className="hall-appreciation"><h3>{hall.messageTitle}</h3><p>{hall.messageParagraph1}</p><p>{hall.messageParagraph2}</p><strong>{hall.messageHighlight}</strong><small>{hall.messageFooter}</small></section>
    <footer className="hall-values"><div><b>♢</b><span>Safety<br />Always</span></div><div><b>♚</b><span>Stronger<br />Together</span></div><div><b>▥</b><span>Bigger<br />Possibilities</span></div><div><b>♥</b><span>Happier<br />Guests</span></div><div><b>★</b><span>Brighter<br />Future</span></div><section><small>{hall.signatureLabel}</small><strong>{hall.signature}</strong></section></footer>
  </article>;
}
