"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  formatTime12,
  frontAssignment,
  scheduleGroup,
  WORKING_SHIFTS,
} from "@/lib/operations/roster";
import { previewCardLines } from "@/lib/operations/daily-preview";
import { useI18n } from "@/app/i18n";
import { employeeGenderClass } from "@/app/employeeDisplay";

const cardLabels = {
  trips: "TODAY'S TRIP(S)",
  birthdays: "TODAY'S BIRTHDAY(IES)",
  offers: "TODAY'S OFFERS",
  bracelets: "BRACELET COLORS",
};
const sectionLabels = {
  roster: "Daily roster",
  leaves: "Today's leaves / off",
  notes: "Operational notes",
  footer: "Footer",
};
const fallback = {
  logoUrl: "/bb-logo-fast.png",
  branchName: "MOT Branch",
  title: "DAILY OPERATIONS",
  subtitle: "Great teams make great days.",
  footerMotto: "Great teams make great days.",
  primary: "#301848",
  accent: "#f8c800",
  text: "#20113d",
  amColor: "#cfe8ff",
  bwColor: "#fff2ac",
  pmColor: "#eadcff",
  cardOrder: ["trips", "birthdays", "offers", "bracelets"],
  visibleCards: { trips: true, birthdays: true, offers: true, bracelets: true },
  sectionOrder: ["roster", "leaves", "notes", "footer"],
  visibleSections: {
    roster: true,
    leaves: true,
    notes: true,
    footer: true,
    attendance: true,
    breaks: true,
    rotation: true,
  },
  cardContent: {
    trips: "No trips added",
    birthdays: "No birthdays added",
    offers: "No offers added",
    bracelets:
      "Kids: Red\nToddlers: Light blue\nTrip: Green\nS.N: Purple\nVisitor: Brown",
  },
  operationalNotes:
    "• Follow your assigned rotation.\n• Fill break times when leaving and returning.\n• Contact the shift leader for any changes.",
  fillerRows: { AM: 5, BW: 4, PM: 5 },
  rotationHours: ["10", "11", "12", "1", "2", "3", "4", "5"],
};
function mergeConfig(value) {
  const input = value && typeof value === "object" ? value : {};
  return {
    ...fallback,
    ...input,
    visibleCards: { ...fallback.visibleCards, ...input.visibleCards },
    visibleSections: { ...fallback.visibleSections, ...input.visibleSections },
    cardContent: { ...fallback.cardContent, ...input.cardContent },
    fillerRows: { ...fallback.fillerRows, ...input.fillerRows },
    cardOrder: Array.isArray(input.cardOrder)
      ? input.cardOrder
      : fallback.cardOrder,
    sectionOrder: Array.isArray(input.sectionOrder)
      ? input.sectionOrder
      : fallback.sectionOrder,
    rotationHours: Array.isArray(input.rotationHours)
      ? input.rotationHours
      : fallback.rotationHours,
  };
}
function localIsoDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}
function addDays(value, days) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}
function rosterName(employee = {}) {
  if (employee.operationalName?.trim()) return employee.operationalName.trim();
  return String(employee.nameEn || employee.name || "").trim().split(/\s+/).slice(0, 2).join(" ");
}

function rosterRole(person) {
  const cashier = person?.employee?.department === "CASHIER" || frontAssignment(person?.metadata) === "FRONT_CASHIER";
  const leader = Boolean(person?.employee?.operationsTeamLeader);
  if (cashier && leader) return { label: "Front Cashier | Team Leader", tone: "cashier-leader" };
  if (cashier) return { label: "Front Cashier", tone: "cashier" };
  if (leader) return { label: "Team Leader", tone: "leader" };
  return null;
}

function employeeTone(person) {
  const role = rosterRole(person);
  if (role) return role.tone;
  if (person?.employee?.gender === "FEMALE") return "female";
  if (person?.employee?.gender === "MALE") return "male";
  return employeeGenderClass(person?.employee?.nameEn || person?.employee?.name) === "employee-name-female" ? "female" : "male";
}

function OfferCardContent({ offers = [] }) {
  if (!offers.length) return <p>No active offers</p>;
  return offers.map((offer) => (
    <div className="ops-offer-item" key={offer.id}>
      <b>{offer.title}</b>
      {(offer.priceBefore != null || offer.priceAfter != null) && (
        <span className="ops-offer-price">
          {offer.priceBefore != null && <del>{offer.priceBefore} EGP</del>}
          {offer.priceAfter != null && <strong>{offer.priceAfter} EGP</strong>}
        </span>
      )}
      {offer.details && <small>{offer.details}</small>}
    </div>
  ));
}
async function readApiJson(response, fallbackMessage) {
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : null; } catch { throw new Error(fallbackMessage); }
  if (!body) throw new Error(fallbackMessage);
  if (!response.ok) throw new Error(body.error || fallbackMessage);
  return body;
}
async function posterPngBlob({ data, config, weekday, grouped }) {
  const width = 1500;
  const margin = 28;
  const contentWidth = width - margin * 2;
  const assignments = data.rotation?.assignments || [];
  const nonWorking = Object.entries(grouped)
    .filter(([key]) => !WORKING_SHIFTS.includes(key))
    .flatMap(([group, people]) => people.map((person) => ({ ...person, group })));
  const visibleCards = config.cardOrder.filter((card) => config.visibleCards[card] && (card !== "trips" || data.trips?.length) && (card !== "birthdays" || data.events?.length));
  const rosterRows = WORKING_SHIFTS.reduce((total, shift) => total + (grouped[shift]?.length ? grouped[shift].length + 2 : 0), 0);
  const cardHeight = visibleCards.length ? 152 : 0;
  const leavesHeight = config.visibleSections.leaves ? 52 + Math.max(1, nonWorking.length) * 34 : 0;
  const notesHeight = config.visibleSections.notes ? 82 : 0;
  const height = 150 + cardHeight + 76 + rosterRows * 42 + leavesHeight + notesHeight + 86;
  const xml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
  const short = (value, limit = 34) => { const text = String(value || ""); return text.length > limit ? `${text.slice(0, limit - 1)}…` : text; };
  const nodes = [];
  const rect = (x, y, w, h, fill, stroke = "none", radius = 0) => nodes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`);
  const text = (value, x, y, size = 20, weight = 700, fill = config.text, anchor = "start") => nodes.push(`<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${xml(value)}</text>`);
  let y = 0;
  rect(0, 0, width, height, "#ffffff");
  rect(0, 0, width, 126, config.primary);
  text(config.title, width / 2, 53, 38, 900, "#ffffff", "middle");
  text(data.motivationalPhrase || config.subtitle, width / 2, 88, 17, 800, config.accent, "middle");
  text(config.branchName, margin, 48, 24, 900, "#ffffff");
  text(weekday, margin, 82, 16, 700, "#ffffff");
  y = 146;

  if (visibleCards.length) {
    const gap = 12;
    const cardWidth = (contentWidth - gap * (visibleCards.length - 1)) / visibleCards.length;
    visibleCards.forEach((card, index) => {
      const x = margin + index * (cardWidth + gap);
      const tone = card === "offers" ? "#d98a31" : card === "trips" ? "#3182bd" : card === "birthdays" ? "#4f8c5c" : "#2e7da5";
      rect(x, y, cardWidth, 132, "#fffdf8", tone, 12);
      rect(x, y, cardWidth, 38, tone, "none", 10);
      text(cardLabels[card], x + cardWidth / 2, y + 26, 17, 900, "#ffffff", "middle");
      const lines = card === "offers"
        ? (data.offers || []).map((offer) => `${offer.title}${offer.priceAfter != null ? ` · ${offer.priceAfter} EGP` : ""}`)
        : previewCardLines(card, data);
      (lines.length ? lines : [config.cardContent?.[card] || "—"]).slice(0, 4).forEach((line, lineIndex) => text(short(line, 42), x + 14, y + 65 + lineIndex * 21, 14, 700));
    });
    y += 152;
  }

  const numberWidth = 46, nameWidth = 230, attendanceWidth = 118, breakWidth = 118;
  const rotationX = margin + numberWidth + nameWidth + attendanceWidth + breakWidth;
  const rotationWidth = contentWidth - numberWidth - nameWidth - attendanceWidth - breakWidth;
  rect(margin, y, contentWidth, 54, config.primary);
  text("#", margin + numberWidth / 2, y + 34, 15, 900, "#ffffff", "middle");
  text("EMPLOYEE", margin + numberWidth + nameWidth / 2, y + 34, 15, 900, "#ffffff", "middle");
  text("ATTENDANCE  IN / OUT", margin + numberWidth + nameWidth + attendanceWidth / 2, y + 34, 13, 900, "#ffffff", "middle");
  text("BREAK  FROM / TO", margin + numberWidth + nameWidth + attendanceWidth + breakWidth / 2, y + 34, 13, 900, "#ffffff", "middle");
  text("ROTATION (HOURLY)", rotationX + rotationWidth / 2, y + 34, 15, 900, "#ffffff", "middle");
  y += 54;

  WORKING_SHIFTS.forEach((shift) => {
    const people = grouped[shift] || [];
    if (!people.length) return;
    const shiftColor = shift === "AM" ? config.amColor : shift === "BW" ? config.bwColor : config.pmColor;
    const startHour = Number(data?.shifts?.[shift]?.startTime?.slice(0, 2) || (shift === "PM" ? 15 : 10));
    const hours = Array.from({ length: 8 }, (_, index) => String((startHour + index - 1) % 12 + 1));
    rect(margin, y, contentWidth, 38, shiftColor, "#8b8794");
    text(shift === "AM" ? "MORNING SHIFT (AM)" : shift === "BW" ? "BETWEEN SHIFT (BW)" : "NIGHT SHIFT (PM)", margin + 12, y + 25, 16, 900);
    text(`${formatTime12(data?.shifts?.[shift]?.startTime)} — ${formatTime12(data?.shifts?.[shift]?.endTime)}`, margin + contentWidth - 12, y + 25, 15, 800, config.text, "end");
    y += 38;
    rect(margin, y, contentWidth, 30, "#f3edf8", "#8b8794");
    text("ROTATION TIME", margin + numberWidth + nameWidth + (attendanceWidth + breakWidth) / 2, y + 20, 12, 900, config.text, "middle");
    hours.forEach((hour, index) => text(hour, rotationX + rotationWidth / 8 * (index + 0.5), y + 20, 13, 900, config.text, "middle"));
    y += 30;
    people.forEach((person, personIndex) => {
      const role = rosterRole(person);
      const tone = employeeTone(person);
      const nameTone = tone === "cashier" ? "#b9e2c3" : tone === "leader" ? "#c3e9f6" : tone === "cashier-leader" ? "#d5b9ec" : tone === "female" ? "#fff0a8" : "#e7d6f6";
      rect(margin, y, contentWidth, 42, "#ffffff", "#bcb5c3");
      rect(margin + numberWidth, y, nameWidth, 42, nameTone, "#bcb5c3");
      text(personIndex + 1, margin + numberWidth / 2, y + 27, 14, 900, config.text, "middle");
      text(short(rosterName(person.employee), 25), margin + numberWidth + 10, y + 27, 15, 900);
      if (role) {
        rect(rotationX, y, rotationWidth, 42, nameTone, "#bcb5c3");
        text(role.label, rotationX + rotationWidth / 2, y + 27, 15, 900, config.text, "middle");
      } else {
        hours.forEach((hour, index) => {
          const slotHour = (startHour + index) % 24;
          const assignment = assignments.find((item) => item.employeeId === person.employee.id && Number(item.startTime?.slice(0, 2)) === slotHour);
          const cellX = rotationX + rotationWidth / 8 * index;
          if (index) nodes.push(`<line x1="${cellX}" y1="${y}" x2="${cellX}" y2="${y + 42}" stroke="#bcb5c3"/>`);
          text(short(assignment?.position?.code || "", 10), cellX + rotationWidth / 16, y + 27, 12, 800, config.text, "middle");
        });
      }
      y += 42;
    });
  });

  if (config.visibleSections.leaves) {
    y += 14; rect(margin, y, contentWidth, 38, config.primary, "none", 8); text("TODAY'S LEAVES / OFF", margin + contentWidth - 14, y + 25, 16, 900, "#ffffff", "end"); y += 38;
    (nonWorking.length ? nonWorking : [{ group: "—", employee: { name: "No leave / off in the published schedule" } }]).forEach((item) => { rect(margin, y, contentWidth, 34, "#fff", "#d4ced8"); text(item.group, margin + 14, y + 23, 13, 900); text(rosterName(item.employee), margin + 110, y + 23, 14, 700); y += 34; });
  }
  if (config.visibleSections.notes) {
    y += 14; rect(margin, y, contentWidth, 38, config.primary, "none", 8); text("OPERATIONAL NOTES", margin + contentWidth - 14, y + 25, 16, 900, "#ffffff", "end"); y += 38;
    const notes = data.notices?.length ? data.notices.map((item) => item.title) : ["No operational notices recorded"];
    text(short(notes.join(" · "), 150), margin + 14, y + 27, 14, 700); y += 42;
  }
  y += 22; rect(margin, y, contentWidth, 5, config.accent); text(data.motivationalPhrase || config.footerMotto, width / 2, y + 35, 15, 900, config.text, "middle");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${nodes.join("")}</svg>`;
  const image = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0);
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image generation failed")), "image/png"));
  } finally { URL.revokeObjectURL(url); }
}
function move(list, item, direction) {
  const index = list.indexOf(item);
  const next = index + direction;
  if (next < 0 || next >= list.length) return list;
  const copy = [...list];
  [copy[index], copy[next]] = [copy[next], copy[index]];
  return copy;
}

function TemplateEditor({ config, onChange, phrases, onPhrasesChange, save, saving, isArabic }) {
  const update = (key, value) => onChange({ ...config, [key]: value });
  const color = (key, label) => (
    <label className="template-field" key={key}>
      {label}
      <span>
        <input
          type="color"
          value={config[key]}
          onChange={(e) => update(key, e.target.value)}
        />
        <input
          value={config[key]}
          onChange={(e) => update(key, e.target.value)}
        />
      </span>
    </label>
  );
  const reorder = (key, item, direction) =>
    update(key, move(config[key], item, direction));
  return (
    <aside className="panel daily-template-editor no-print">
      <div className="daily-template-editor-head">
        <div>
          <b>{isArabic ? "محرر التيمبلت المباشر" : "Live template editor"}</b>
          <small>
            {isArabic
              ? "المعاينة تتغير فورًا، والحفظ عند الضغط على حفظ."
              : "Preview changes instantly; settings save when you choose Save."}
          </small>
        </div>
        <button onClick={save} disabled={saving}>
          {saving
            ? isArabic
              ? "جارٍ الحفظ..."
              : "Saving..."
            : isArabic
              ? "حفظ التيمبلت"
              : "Save template"}
        </button>
      </div>
      <div className="template-editor-grid">
        <label className="template-field template-wide">
          {isArabic ? "الجمل التحفيزية اليومية — سطر لكل جملة" : "Daily motivational phrases — one per line"}
          <textarea
            aria-label={isArabic ? "الجمل التحفيزية اليومية" : "Daily motivational phrases"}
            value={phrases.join("\n")}
            onChange={(e) => onPhrasesChange(e.target.value.split("\n").map((x) => x.trim()).filter(Boolean))}
          />
        </label>
        <label className="template-field">
          {isArabic ? "رابط اللوجو" : "Logo URL / local path"}
          <input
            value={config.logoUrl}
            onChange={(e) => update("logoUrl", e.target.value)}
          />
        </label>
        <label className="template-field">
          {isArabic ? "اسم الفرع" : "Branch"}
          <input
            value={config.branchName}
            onChange={(e) => update("branchName", e.target.value)}
          />
        </label>
        <label className="template-field">
          {isArabic ? "العنوان" : "Title"}
          <input
            value={config.title}
            onChange={(e) => update("title", e.target.value)}
          />
        </label>
        <label className="template-field">
          {isArabic ? "السطر الفرعي" : "Subtitle"}
          <input
            value={config.subtitle}
            onChange={(e) => update("subtitle", e.target.value)}
          />
        </label>
        {color("primary", isArabic ? "اللون الأساسي" : "Primary")}
        {color("accent", isArabic ? "لون التمييز" : "Accent")}
        {color("amColor", "AM band")}
        {color("bwColor", "BW band")}
        {color("pmColor", "PM band")}
      </div>
      <div className="template-editor-columns">
        <section>
          <b>{isArabic ? "ترتيب كروت أعلى الصفحة" : "Top-card order"}</b>
          {config.cardOrder.map((card) => (
            <div className="template-sort-row" key={card}>
              <label>
                <input
                  type="checkbox"
                  checked={config.visibleCards[card]}
                  onChange={(e) =>
                    update("visibleCards", {
                      ...config.visibleCards,
                      [card]: e.target.checked,
                    })
                  }
                />{" "}
                {cardLabels[card]}
              </label>
              <span>
                <button onClick={() => reorder("cardOrder", card, -1)}>
                  ↑
                </button>
                <button onClick={() => reorder("cardOrder", card, 1)}>↓</button>
              </span>
            </div>
          ))}
        </section>
        <section>
          <b>{isArabic ? "ترتيب الأقسام" : "Section order"}</b>
          {config.sectionOrder.map((part) => (
            <div className="template-sort-row" key={part}>
              <label>
                <input
                  type="checkbox"
                  checked={config.visibleSections[part]}
                  onChange={(e) =>
                    update("visibleSections", {
                      ...config.visibleSections,
                      [part]: e.target.checked,
                    })
                  }
                />{" "}
                {sectionLabels[part]}
              </label>
              <span>
                <button onClick={() => reorder("sectionOrder", part, -1)}>
                  ↑
                </button>
                <button onClick={() => reorder("sectionOrder", part, 1)}>
                  ↓
                </button>
              </span>
            </div>
          ))}
          <b className="template-subhead">
            {isArabic ? "أعمدة جدول الموظفين" : "Employee table columns"}
          </b>
          {[
            ["attendance", isArabic ? "حضور" : "Attendance"],
            ["breaks", isArabic ? "بريك" : "Break"],
            ["rotation", isArabic ? "روتيشن" : "Rotation"],
          ].map(([key, label]) => (
            <label className="template-toggle" key={key}>
              <input
                type="checkbox"
                checked={config.visibleSections[key]}
                onChange={(e) =>
                  update("visibleSections", {
                    ...config.visibleSections,
                    [key]: e.target.checked,
                  })
                }
              />{" "}
              {label}
            </label>
          ))}
        </section>
      </div>
      <div className="template-editor-grid">
        {config.cardOrder.map((card) => (
          <label className="template-field" key={card}>
            {cardLabels[card]}
            <textarea
              aria-label={cardLabels[card]}
              value={config.cardContent[card] || ""}
              onChange={(e) =>
                update("cardContent", {
                  ...config.cardContent,
                  [card]: e.target.value,
                })
              }
            />
          </label>
        ))}
        <label className="template-field template-wide">
          {isArabic ? "ملاحظات التشغيل" : "Operational notes"}
          <textarea
            aria-label={isArabic ? "ملاحظات التشغيل" : "Operational notes"}
            value={config.operationalNotes}
            onChange={(e) => update("operationalNotes", e.target.value)}
          />
        </label>
      </div>
    </aside>
  );
}

function OperationsPoster({ config, weekday, data, grouped }) {
  const style = {
    "--ops-primary": config.primary,
    "--ops-accent": config.accent,
    "--ops-text": config.text,
    "--ops-am": config.amColor,
    "--ops-bw": config.bwColor,
    "--ops-pm": config.pmColor,
  };
  const columnParts = [
    "36px",
    "200px",
    ...(config.visibleSections.attendance ? ["63px", "63px"] : []),
    ...(config.visibleSections.breaks ? ["63px", "63px"] : []),
    ...(config.visibleSections.rotation
      ? Array(8).fill(
          "minmax(21px, 1fr)",
        )
      : []),
  ];
  const rowStyle = { gridTemplateColumns: columnParts.join(" ") };
  const nonWorking = Object.entries(grouped)
    .filter(([key]) => !WORKING_SHIFTS.includes(key))
    .flatMap(([group, people]) =>
      people.map((person) => ({ ...person, group })),
    );
  const show = config.visibleSections;
  const assignments = data.rotation?.assignments || [];
  const shiftBlock = (shift) => {
    const people = grouped[shift] || [];
    if (!people.length) return null;
    const startHour = Number(data?.shifts?.[shift]?.startTime?.slice(0, 2) || 10);
    const rotationHours = Array.from({ length: 8 }, (_, index) => String((startHour + index - 1) % 12 + 1));
    const total = people.length;
    const leadingColumns = 2 + (show.attendance ? 2 : 0) + (show.breaks ? 2 : 0);
    return (
      <section
        className={`ops-shift ops-shift-${shift.toLowerCase()}`}
        key={shift}
      >
        <header>
          <b>
            {shift === "AM"
              ? "MORNING SHIFT (AM)"
              : shift === "BW"
                ? "BETWEEN SHIFT (BW)"
                : "NIGHT SHIFT (PM)"}
          </b>
          <span>
            {formatTime12(data?.shifts?.[shift]?.startTime)} —{" "}
            {formatTime12(data?.shifts?.[shift]?.endTime)}
          </span>
        </header>
        {show.rotation && <div className="ops-shift-hours" style={rowStyle}>
          <b className="ops-rotation-time-label" style={{ gridColumn: `span ${leadingColumns}` }}>ROTATION TIME</b>
          {rotationHours.map((hour, index) => <b key={`${shift}-${hour}-${index}`}>{hour}</b>)}
        </div>}
        {Array.from({ length: total }, (_, index) => {
          const person = people[index];
          const role = rosterRole(person);
          const tone = employeeTone(person);
          return (
            <div className="ops-row" style={rowStyle} key={person?.id || index}>
              <b>{index + 1}</b>
              <strong className={`ops-employee-name ops-employee-${tone}`}>{rosterName(person.employee)}</strong>
              {show.attendance && (
                <>
                  <i></i>
                  <i></i>
                </>
              )}
              {show.breaks && (
                <>
                  <i></i>
                  <i></i>
                </>
              )}
              {show.rotation && role && (
                <i className={`ops-role-band ops-role-${role.tone}`} style={{ gridColumn: "span 8" }}>{role.label}</i>
              )}
              {show.rotation && !role &&
                rotationHours.map((hour, cell) => {
                  const slotHour = (startHour + cell) % 24;
                  const assignment =
                    assignments.find(
                      (item) =>
                        item.employeeId === person.employee.id &&
                        Number(item.startTime?.slice(0, 2)) === slotHour,
                    );
                  const strong = ["DROP", "TOWER", "DATA"].includes(
                    assignment?.position?.code,
                  );
                  return (
                    <i
                      className={strong ? "rotation-strong" : ""}
                      key={`${hour}-${cell}`}
                    >
                      {assignment?.position?.code || ""}
                    </i>
                  );
                })}
            </div>
          );
        })}
      </section>
    );
  };
  const realNotes = data.notices?.length
    ? data.notices.flatMap((item) => [item.title, item.details]).filter(Boolean)
    : ["No operational notices recorded"];
  const sections = {
    roster: (
      <section className="ops-table" key="roster">
        <div className="ops-table-head" style={rowStyle}>
          <b>#</b>
          <b>EMPLOYEE</b>
          {show.attendance && (
            <b className="ops-grouphead" style={{ gridColumn: "span 2" }}>
              ATTENDANCE
            </b>
          )}
          {show.breaks && (
            <b className="ops-grouphead" style={{ gridColumn: "span 2" }}>
              BREAK
            </b>
          )}
          {show.rotation && (
            <b
              className="ops-rotation-head"
              style={{
                gridColumn: "span 8",
              }}
            >
              ROTATION (HOURLY)
            </b>
          )}
        </div>
        <div className="ops-table-subhead" style={rowStyle}>
          <b></b><b></b>
          {show.attendance && <><b>IN</b><b>OUT</b></>}
          {show.breaks && <><b>FROM</b><b>TO</b></>}
          {show.rotation && Array.from({ length: 8 }, (_, index) => <b key={index}></b>)}
        </div>
        {WORKING_SHIFTS.map(shiftBlock)}
      </section>
    ),
    leaves: (
      <section className="ops-bottom-card" key="leaves">
        <h3>TODAY'S LEAVES / OFF</h3>
        {nonWorking.length ? (
          nonWorking.map((item) => (
            <p key={item.id}>
              <b className={`schedule-status-${String(item.group).toLowerCase()}`}>{item.group}</b>
              <span>{rosterName(item.employee)}</span>
            </p>
          ))
        ) : (
          <p>
            <span>No leave / off in the published schedule</span>
          </p>
        )}
      </section>
    ),
    notes: (
      <section className="ops-bottom-card ops-notes" key="notes">
        <h3>OPERATIONAL NOTES</h3>
        {realNotes.map((note, index) => (
          <p key={index}>{note}</p>
        ))}
      </section>
    ),
    footer: (
      <footer className="ops-footer" key="footer">
        <i></i>
        <b>{data.motivationalPhrase || config.footerMotto}</b>
        <span>{config.branchName} · Page 1 of 1</span>
      </footer>
    ),
  };
  return (
    <article className="daily-operations-poster" style={style}>
      <header className="ops-brand">
        <img
          src={config.logoUrl}
          alt="Company logo"
          onError={(event) => {
            event.currentTarget.src = "/bb-logo-fast.png";
          }}
        />
        <div>
          <h2>{config.title}</h2>
          <span>{data.motivationalPhrase || config.subtitle}</span>
        </div>
        <b>
          {config.branchName}
          <small>{weekday}</small>
        </b>
      </header>
      <section className={`ops-info-cards ops-info-cards-${config.cardOrder.filter((card) => config.visibleCards[card] && (card !== "trips" || data.trips?.length) && (card !== "birthdays" || data.events?.length)).length}`}>
        {config.cardOrder
          .filter((card) => config.visibleCards[card] && (card !== "trips" || data.trips?.length) && (card !== "birthdays" || data.events?.length))
          .map((card) => (
            <article key={card} className={`ops-info-card ${card}`}>
              <h3>{cardLabels[card]}</h3>
              {card === "offers" ? <OfferCardContent offers={data.offers} /> : previewCardLines(card, data).map((line, index) => <p key={index}>{line}</p>)}
            </article>
          ))}
      </section>
      {config.sectionOrder
        .filter((part) => show[part])
        .map((part) => sections[part])}
    </article>
  );
}

export default function DailyApprovalPreview() {
  const { isArabic } = useI18n();
  const today = localIsoDate();
  const [date, setDate] = useState(() =>
    typeof window === "undefined"
      ? today
      : new URLSearchParams(window.location.search).get("date") || today,
  );
  const [data, setData] = useState(null);
  const [config, setConfig] = useState(fallback);
  const [phrases, setPhrases] = useState([]);
  const [showEditor, setShowEditor] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      fetch(`/api/operations/roster?date=${date}`).then(async (response) => {
        let roster = await readApiJson(response, "Roster data could not be loaded. Refresh and try again.");
        if (roster.schedule && !roster.rotation) {
          try {
            const post = (action) => fetch("/api/operations/daily", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, date }) }).then((result) => readApiJson(result, "Automatic rotation could not be prepared."));
            await post("open");
            await post("generateRotation");
            roster = await fetch(`/api/operations/roster?date=${date}`).then((result) => readApiJson(result, "Roster data could not be reloaded."));
          } catch (automationError) {
            console.warn("Automatic daily rotation was not prepared", automationError);
          }
        }
        return roster;
      }),
      fetch("/api/settings?keys=DAILY_OPERATIONS_TEMPLATE_CONFIG,OPS_MOTIVATION_PHRASES").then(
        async (response) => {
          const body = await readApiJson(response, "Template settings could not be loaded. Refresh and try again.");
          const row = body.settings?.find(
            (setting) => setting.key === "DAILY_OPERATIONS_TEMPLATE_CONFIG",
          );
          return { config: mergeConfig(JSON.parse(row?.value || "{}")), phrases: JSON.parse(body.settings?.find((setting) => setting.key === "OPS_MOTIVATION_PHRASES")?.value || "[]") };
        },
      ),
    ])
      .then(([roster, template]) => {
        if (active) {
          setData(roster);
          setConfig(template.config);
          setPhrases(Array.isArray(template.phrases) ? template.phrases : []);
        }
      })
      .catch((requestError) => active && setError(requestError.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [date]);
  const grouped = useMemo(
    () =>
      (data?.roster || []).reduce((result, item) => {
        const key = scheduleGroup(item);
        (result[key] ||= []).push(item);
        return result;
      }, {}),
    [data],
  );
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
  const print = () => {
    document.body.dataset.dailyPreviewPrint = "true";
    const done = () => {
      delete document.body.dataset.dailyPreviewPrint;
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    window.setTimeout(done, 1000);
  };
  const generateRotationNow = async () => {
    setSaving(true); setError(""); setActionMessage("");
    try {
      const post = (action) => fetch("/api/operations/daily", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, date }) }).then((response) => readApiJson(response, "Rotation generation failed"));
      await post("open");
      await post("generateRotation");
      const roster = await fetch(`/api/operations/roster?date=${date}`).then((response) => readApiJson(response, "Roster reload failed"));
      setData(roster);
      setActionMessage(isArabic ? "تم توليد روتيشن جديد بالقواعد" : "A new rules-based rotation was generated");
    } catch (requestError) { setError(requestError.message); } finally { setSaving(false); }
  };
  const copyToWhatsApp = async () => {
    setError(""); setActionMessage("");
    const popup = window.open("about:blank", "_blank");
    try {
      if (!data?.schedule) throw new Error("Roster preview is not ready");
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") throw new Error("Image clipboard is not supported in this browser");
      // Start the clipboard write inside the click's user-activation window. The
      // ClipboardItem may resolve its PNG asynchronously without losing access.
      const png = posterPngBlob({ data, config, weekday, grouped });
      let copied = true;
      try {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      } catch (clipboardError) {
        if (!/permission|notallowed/i.test(`${clipboardError?.name || ""} ${clipboardError?.message || ""}`)) throw clipboardError;
        copied = false;
        const blob = await png;
        const downloadUrl = URL.createObjectURL(blob);
        const download = document.createElement("a");
        download.href = downloadUrl;
        download.download = `BillyBeez-MOT-roster-${date}.png`;
        download.click();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1500);
      }
      const message = isArabic ? `روستر Billy Beez MOT - ${date}\nصورة الروستر جاهزة؛ الصقها أو أرفق الملف المنزل.` : `Billy Beez MOT roster - ${date}\nThe roster image is ready; paste it or attach the downloaded file.`;
      if (popup) popup.location.href = `https://wa.me/?text=${encodeURIComponent(message)}`;
      setActionMessage(copied
        ? (isArabic ? "تم نسخ صورة الروستر وفتح واتساب" : "Roster image copied and WhatsApp opened")
        : (isArabic ? "المتصفح منع النسخ التلقائي؛ تم تنزيل صورة الروستر وفتح واتساب" : "Clipboard access was blocked; the roster image was downloaded and WhatsApp opened"));
    } catch (shareError) { if (popup) popup.close(); setError(shareError.message); }
  };
  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: "DAILY_OPERATIONS_TEMPLATE_CONFIG",
          value: JSON.stringify(config),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Save failed");
      const phraseResponse = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: "OPS_MOTIVATION_PHRASES", value: JSON.stringify(phrases) }) });
      const phraseBody = await phraseResponse.json(); if (!phraseResponse.ok) throw new Error(phraseBody.error || "Phrase save failed");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="daily-approval-preview">
      <header className="panel daily-preview-header">
        <div>
          <span className="daily-preview-eyebrow">BILLY BEEZ · MOT</span>
          <h1>
            {isArabic ? "تيمبلت العمليات اليومية" : "Daily Operations Template"}
          </h1>
          <p>
            {isArabic
              ? "مصدر الفريق هو الجدول الشهري المنشور، وإعدادات التصميم محفوظة في مركز الإعدادات."
              : "The published monthly schedule supplies the team; design rules live in Settings."}
          </p>
        </div>
        <div className="daily-preview-controls no-print">
          <label>
            {isArabic ? "التاريخ" : "Date"}
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <button onClick={() => setDate(today)}>
            {isArabic ? "اليوم" : "Today"}
          </button>
          <button
            className="secondary"
            onClick={() => setDate(addDays(today, 1))}
          >
            {isArabic ? "غدًا" : "Tomorrow"}
          </button>
          <Link className="button-link" href="/settings">{isArabic ? "إعدادات التيمبلت" : "Template settings"}</Link>
          <button className="secondary" onClick={print}>
            {isArabic ? "طباعة / PDF" : "Print / PDF"}
          </button>
          <button onClick={generateRotationNow} disabled={saving}>
            {isArabic ? "توليد روتيشن عشوائي" : "Generate random rotation"}
          </button>
          <button className="whatsapp-button" onClick={copyToWhatsApp}>
            {isArabic ? "نسخ الصورة وفتح واتساب" : "Copy image & open WhatsApp"}
          </button>
          <Link className="button-link" href="/operations">
            {isArabic ? "رجوع" : "Back"}
          </Link>
        </div>
      </header>
      {error && <div className="alert danger">{error}</div>}
      {actionMessage && <div className="alert success">{actionMessage}</div>}
      {loading ? (
        <section className="panel">
          {isArabic
            ? "جارٍ تحميل الروستر والتيمبلت..."
            : "Loading roster and template..."}
        </section>
      ) : !data?.schedule ? (
        <section className="panel daily-preview-empty">
          <h2>
            {isArabic
              ? "لا يوجد جدول منشور يغطي اليوم المحدد"
              : "No published schedule covers this date"}
          </h2>
        </section>
      ) : (
        <OperationsPoster
          config={config}
          weekday={weekday}
          data={data}
          grouped={grouped}
        />
      )}
    </section>
  );
}
