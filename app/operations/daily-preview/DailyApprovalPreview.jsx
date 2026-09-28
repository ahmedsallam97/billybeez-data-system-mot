"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  formatTime12,
  frontAssignment,
  scheduleGroup,
  WORKING_SHIFTS,
} from "@/lib/operations/roster";
import { previewCardLines } from "@/lib/operations/daily-preview";
import { colorNameFor, stockAvailable } from "@/lib/operations/planning";
import { useI18n } from "@/app/i18n";
import { employeeGenderClass } from "@/app/employeeDisplay";
import dailyTemplateConfig from "@/lib/operations/daily-template-config";
import { toBlob as htmlNodeToBlob } from "html-to-image";
import { readApiResponse } from "@/lib/client/read-api-response";

const { DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG, normalizeDailyOperationsTemplateConfig } = dailyTemplateConfig;

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
const fallbackScheduleColors = {
  Annual: "#b9dcc0", Rep: "#eedb85", OFF: "#e9b9c7", Unpaid: "#efbd87",
  Mission: "#a8d8e7", M: "#a8d8e7", Holiday: "#c99aae", H: "#c99aae",
  ANP: "#edabb2", AWP: "#b76a77", SL: "#edc3cb",
};
function scheduleColor(code, configured = {}) {
  const alias = { M: "Mission", H: "Holiday" }[String(code)] || code;
  const value = configured?.[code]?.color || configured?.[alias]?.color || configured?.[String(code).toUpperCase()]?.color;
  return value || fallbackScheduleColors[code] || fallbackScheduleColors[String(code).toUpperCase()] || "#e8e0ed";
}
function contrastColor(hex) {
  const value = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return "#20113d";
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 145 ? "#ffffff" : "#20113d";
}
const fallback = DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG;
function mergeConfig(value) { return normalizeDailyOperationsTemplateConfig(value); }
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

function rosterRole(person, labels = fallback.labels) {
  const frontCashier = frontAssignment(person?.metadata) === "FRONT_CASHIER";
  const cashier = person?.employee?.department === "CASHIER";
  const leader = Boolean(person?.employee?.operationsTeamLeader);
  if (frontCashier && leader) return { label: labels.cashierLeader, tone: "cashier-leader" };
  if (frontCashier) return { label: labels.frontCashier, tone: "cashier" };
  if (cashier && leader) return { label: `${labels.cashier} | ${labels.teamLeader}`, tone: "cashier-leader" };
  if (cashier) return { label: labels.cashier, tone: "cashier" };
  if (leader) return { label: labels.teamLeader, tone: "leader" };
  return null;
}

function employeeTone(person, labels) {
  const role = rosterRole(person, labels);
  if (role) return role.tone;
  if (person?.employee?.gender === "FEMALE") return "female";
  if (person?.employee?.gender === "MALE") return "male";
  return employeeGenderClass(person?.employee?.nameEn || person?.employee?.name) === "employee-name-female" ? "female" : "male";
}

function OfferCardContent({ offers = [], config }) {
  if (!offers.length) return <p>{config.labels.noOffers}</p>;
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return <div className="ops-offer-grid">{offers.map((offer) => {
    let weekdays = [];
    try { weekdays = JSON.parse(offer.weekdaysJson || "[]"); } catch { weekdays = []; }
    return <article className="ops-offer-item" key={offer.id}>
      <b>{offer.title} {offer.discountPercent != null && <em className="ops-discount-badge">-{offer.discountPercent}%</em>}</b>
      {(offer.priceBefore != null || offer.priceAfter != null) && (
        <span className="ops-offer-price">
          {offer.priceBefore != null && <del>{offer.priceBefore} {config.currency}</del>}
          {offer.priceAfter != null && <strong>{offer.priceAfter} {config.currency}</strong>}
        </span>
      )}
      <span className="ops-offer-children">{config.labels.offerAdmits} {offer.childrenCount || 1} {(offer.childrenCount || 1) === 1 ? config.labels.childSingular : config.labels.childPlural}</span>
      {weekdays.length > 0 && <small>{weekdays.map((day) => dayNames[day]).filter(Boolean).join(" · ")}</small>}
      {offer.details && <small>{offer.details}</small>}
    </article>;
  })}</div>;
}

function BraceletCardContent({ items = [], config }) {
  const bracelets = items.filter((item) => !item.stockCategory || item.stockCategory === "BRACELET");
  if (!bracelets.length) return <p>{config.labels.noBracelets}</p>;
  return <div className="ops-bracelet-list">{bracelets.map((item) => (
    <p key={item.id || item.wristbandType}>
      <i className="ops-bracelet-swatch" style={{ backgroundColor: item.color || "#cccccc" }} aria-hidden="true" />
      <b style={{ backgroundColor: item.color || "#e8e0ed", color: contrastColor(item.color || "#e8e0ed") }}>{item.usageType || item.wristbandType} ⇒ {item.material || "Bracelet"} {item.colorName || colorNameFor(item.color)}</b>
      <span>{stockAvailable(item)} {config.labels.remaining}</span>
    </p>
  ))}</div>;
}
async function capturePosterPngBlob(node) {
  if (!node) throw new Error("Roster preview is not ready");
  if (document.fonts?.ready) await document.fonts.ready;
  const width = Math.max(node.scrollWidth, node.offsetWidth);
  const height = Math.max(node.scrollHeight, node.offsetHeight);
  const blob = await htmlNodeToBlob(node, {
    backgroundColor: "#ffffff",
    cacheBust: true,
    pixelRatio: 2,
    width,
    height,
    style: { width: `${width}px`, maxWidth: "none", height: `${height}px`, overflow: "visible", boxShadow: "none" },
  });
  if (!blob) throw new Error("Roster image generation failed");
  return blob;
}
async function dataUrlForImage(source) {
  if (!source) return "";
  const response = await fetch(source, { cache: "force-cache" });
  if (!response.ok) throw new Error("Logo could not be loaded");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Logo could not be embedded"));
    reader.readAsDataURL(blob);
  });
}
async function posterPngBlob({ data, config, weekday, grouped, scheduleColors }) {
  const slotCount = Math.max(1, Number(config.rotationSlotCount) || 8);
  const width = 1500;
  const margin = 28;
  const contentWidth = width - margin * 2;
  const assignments = data.rotation?.assignments || [];
  const nonWorking = Object.entries(grouped)
    .filter(([key]) => !WORKING_SHIFTS.includes(key))
    .flatMap(([group, people]) => people.map((person) => ({ ...person, group })));
  const visibleCards = config.cardOrder.filter((card) => !["offers", "bracelets"].includes(card) && config.visibleCards[card] && (card !== "trips" || data.trips?.length) && (card !== "birthdays" || data.events?.length));
  const cardLinesByCard = Object.fromEntries(visibleCards.map((card) => [card, previewCardLines(card, data)]));
  const compactCards = visibleCards.filter((card) => ["trips", "birthdays"].includes(card));
  const cardRows = [...(compactCards.length ? [compactCards] : []), ...visibleCards.filter((card) => !["trips", "birthdays"].includes(card)).map((card) => [card])];
  const cardRowHeights = cardRows.map((row) => Math.max(132, 58 + Math.max(1, ...row.map((card) => cardLinesByCard[card]?.length || 0)) * 21));
  const rosterRows = WORKING_SHIFTS.reduce((total, shift) => total + (grouped[shift]?.length ? grouped[shift].length + 2 : 0), 0);
  const cardHeight = cardRows.length ? cardRowHeights.reduce((sum, value) => sum + value, 0) + (cardRows.length - 1) * 12 + 20 : 0;
  const braceletStock = (data.wristbands || []).filter((item) => !item.stockCategory || item.stockCategory === "BRACELET");
  const showBraceletSummary = config.cardOrder.includes("bracelets") && config.visibleCards.bracelets;
  const dailySummaryRows = Math.max(config.visibleSections.leaves ? Math.max(1, nonWorking.length) : 0, showBraceletSummary ? Math.max(1, braceletStock.length) : 0);
  const dailySummaryHeight = dailySummaryRows ? 52 + dailySummaryRows * 34 : 0;
  const offerCount = config.visibleCards.offers !== false ? (data.offers?.length || 0) : 0;
  const offerColumns = Math.min(3, Math.max(1, offerCount));
  const offerRows = offerCount ? Math.ceil(offerCount / offerColumns) : 0;
  const offersHeight = offerRows ? 46 + offerRows * 116 + Math.max(0, offerRows - 1) * 12 : 0;
  const notesHeight = config.visibleSections.notes ? 52 + Math.max(1, data.notices?.length || 0) * 52 : 0;
  const height = 150 + cardHeight + 76 + rosterRows * 42 + dailySummaryHeight + offersHeight + notesHeight + 100;
  const xml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
  const short = (value, limit = 34) => { const text = String(value || ""); return text.length > limit ? `${text.slice(0, limit - 1)}…` : text; };
  const nodes = [];
  const rect = (x, y, w, h, fill, stroke = "none", radius = 0) => nodes.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}"/>`);
  const text = (value, x, y, size = 20, weight = 700, fill = config.text, anchor = "start") => nodes.push(`<text x="${x}" y="${y}" font-family="Arial, sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${xml(value)}</text>`);
  let y = 0;
  let embeddedLogo = "";
  try { embeddedLogo = await dataUrlForImage(config.logoUrl); } catch { embeddedLogo = ""; }
  rect(0, 0, width, height, "#ffffff");
  rect(0, 0, width, 126, config.primary);
  if (embeddedLogo) nodes.push(`<image href="${xml(embeddedLogo)}" x="${width - 230}" y="15" width="190" height="94" preserveAspectRatio="xMidYMid meet"/>`);
  text(config.title, width / 2, 53, 38, 900, "#ffffff", "middle");
  text(data.motivationalPhrase || config.subtitle, width / 2, 88, 17, 800, config.accent, "middle");
  text(config.branchName, margin, 48, 24, 900, "#ffffff");
  text(weekday, margin, 82, 16, 700, "#ffffff");
  y = 146;

  if (visibleCards.length) {
    const gap = 12;
    cardRows.forEach((row, rowIndex) => {
      const rowHeight = cardRowHeights[rowIndex];
      const cardWidth = (contentWidth - gap * (row.length - 1)) / row.length;
      row.forEach((card, index) => {
        const x = margin + index * (cardWidth + gap);
        const tone = config.cardColors?.[card] || (card === "offers" ? "#d98a31" : card === "trips" ? "#3182bd" : card === "birthdays" ? "#4f8c5c" : "#2e7da5");
        rect(x, y, cardWidth, rowHeight, "#fffdf8", tone, 12);
        rect(x, y, cardWidth, 38, tone, "none", 10);
        text(config.labels[card] || cardLabels[card], x + cardWidth / 2, y + 26, 17, 900, "#ffffff", "middle");
        const lines = cardLinesByCard[card] || [];
        (lines.length ? lines : [config.cardContent?.[card] || "—"]).forEach((line, lineIndex) => text(short(line, row.length === 1 ? 120 : 55), x + 14, y + 65 + lineIndex * 21, 14, 700));
      });
      y += rowHeight + gap;
    });
    y += 8;
  }

  const numberWidth = 46, nameWidth = 230, attendanceWidth = 118, breakWidth = 118;
  const rotationX = margin + numberWidth + nameWidth + attendanceWidth + breakWidth;
  const rotationWidth = contentWidth - numberWidth - nameWidth - attendanceWidth - breakWidth;
  rect(margin, y, contentWidth, 54, config.primary);
  text("#", margin + numberWidth / 2, y + 34, 15, 900, "#ffffff", "middle");
  text(config.labels.employee, margin + numberWidth + nameWidth / 2, y + 34, 15, 900, "#ffffff", "middle");
  text(`${config.labels.attendance}  ${config.labels.in} / ${config.labels.out}`, margin + numberWidth + nameWidth + attendanceWidth / 2, y + 34, 13, 900, "#ffffff", "middle");
  text(`${config.labels.break}  ${config.labels.from} / ${config.labels.to}`, margin + numberWidth + nameWidth + attendanceWidth + breakWidth / 2, y + 34, 13, 900, "#ffffff", "middle");
  text(config.labels.rotation, rotationX + rotationWidth / 2, y + 34, 15, 900, "#ffffff", "middle");
  y += 54;

  WORKING_SHIFTS.forEach((shift) => {
    const people = grouped[shift] || [];
    if (!people.length) return;
    const shiftColor = shift === "AM" ? config.amColor : shift === "BW" ? config.bwColor : config.pmColor;
    const startHour = Number(data?.shifts?.[shift]?.startTime?.slice(0, 2) || (shift === "PM" ? 15 : 10));
    const hours = Array.from({ length: slotCount }, (_, index) => String((startHour + index - 1) % 12 + 1));
    rect(margin, y, contentWidth, 38, shiftColor, "#8b8794");
    text(shift === "AM" ? config.labels.morningShift : shift === "BW" ? config.labels.betweenShift : config.labels.nightShift, margin + 12, y + 25, 16, 900);
    text(`${formatTime12(data?.shifts?.[shift]?.startTime)} — ${formatTime12(data?.shifts?.[shift]?.endTime)}`, margin + contentWidth - 12, y + 25, 15, 800, config.text, "end");
    y += 38;
    rect(margin, y, contentWidth, 30, "#f3edf8", "#8b8794");
    text(config.labels.rotationTime, margin + numberWidth + nameWidth + (attendanceWidth + breakWidth) / 2, y + 20, 12, 900, config.text, "middle");
    hours.forEach((hour, index) => text(hour, rotationX + rotationWidth / slotCount * (index + 0.5), y + 20, 13, 900, config.text, "middle"));
    y += 30;
    people.forEach((person, personIndex) => {
      const role = rosterRole(person, config.labels);
      const tone = employeeTone(person, config.labels);
      const roleColors = config.roleColors || {}; const nameTone = tone === "cashier" ? (roleColors.cashier || "#b9e2c3") : tone === "leader" ? (roleColors.leader || "#c3e9f6") : tone === "cashier-leader" ? (roleColors.cashierLeader || "#d5b9ec") : tone === "female" ? (roleColors.female || "#fff0a8") : (roleColors.male || "#e7d6f6");
      rect(margin, y, contentWidth, 42, "#ffffff", "#bcb5c3");
      rect(margin + numberWidth, y, nameWidth, 42, nameTone, "#bcb5c3");
      text(personIndex + 1, margin + numberWidth / 2, y + 27, 14, 900, config.text, "middle");
      text(short(rosterName(person.employee), 32), margin + numberWidth + 10, y + 27, 14, 900);
      if (role) {
        rect(rotationX, y, rotationWidth, 42, nameTone, "#bcb5c3");
        text(role.label, rotationX + rotationWidth / 2, y + 27, 15, 900, config.text, "middle");
      } else {
        hours.forEach((hour, index) => {
          const slotHour = (startHour + index) % 24;
          const assignment = assignments.find((item) => item.employeeId === person.employee.id && Number(item.startTime?.slice(0, 2)) === slotHour);
          const cellX = rotationX + rotationWidth / slotCount * index;
          if (index) nodes.push(`<line x1="${cellX}" y1="${y}" x2="${cellX}" y2="${y + 42}" stroke="#bcb5c3"/>`);
          text(short(assignment?.position?.code || "", 10), cellX + rotationWidth / (slotCount * 2), y + 27, 12, 800, config.text, "middle");
        });
      }
      y += 42;
    });
  });

  if (dailySummaryRows) {
    y += 14;
    const panels = [
      ...(showBraceletSummary ? [{ type: "bracelets", title: config.labels.bracelets, tone: config.cardColors?.bracelets || "#2e7da5" }] : []),
      ...(config.visibleSections.leaves ? [{ type: "leaves", title: config.labels.leaves, tone: config.primary }] : []),
    ];
    const gap = panels.length > 1 ? 12 : 0;
    const panelWidth = (contentWidth - gap) / panels.length;
    panels.forEach((panel, panelIndex) => {
      const panelX = margin + panelIndex * (panelWidth + gap);
      rect(panelX, y, panelWidth, 38 + dailySummaryRows * 34, "#ffffff", panel.tone, 8);
      rect(panelX, y, panelWidth, 38, panel.tone, "none", 8);
      text(panel.title, panelX + panelWidth - 14, y + 25, 16, 900, "#ffffff", "end");
      if (panel.type === "bracelets") {
        const rows = braceletStock.length ? braceletStock : [{ usageType: config.labels.noBracelets, material: "", colorName: "" }];
        rows.forEach((item, index) => {
          const rowY = y + 38 + index * 34;
          if (index) nodes.push(`<line x1="${panelX}" y1="${rowY}" x2="${panelX + panelWidth}" y2="${rowY}" stroke="#d4ced8"/>`);
          if (item.color) rect(panelX + 12, rowY + 9, 16, 16, item.color, "rgba(48,24,72,.2)", 8);
          const braceletLabel = `${item.usageType || item.wristbandType || ""}${item.material ? ` ⇒ ${item.material}` : ""}${item.color ? ` ${item.colorName || colorNameFor(item.color)}` : ""}`;
          const braceletTone = item.color || "#e8e0ed";
          const labelX = panelX + (item.color ? 38 : 12);
          const labelWidth = Math.max(110, panelWidth - (item.color ? 220 : 194));
          rect(labelX, rowY + 5, labelWidth, 24, braceletTone, "none", 4);
          text(short(braceletLabel, 48), labelX + labelWidth / 2, rowY + 22, 13, 800, contrastColor(braceletTone), "middle");
          if (item.id || item.wristbandType) text(`${stockAvailable(item)} ${config.labels.remaining}`, panelX + panelWidth - 12, rowY + 22, 12, 800, config.text, "end");
        });
      } else {
        const rows = nonWorking.length ? nonWorking : [{ group: "—", employee: { name: config.labels.noLeaves } }];
        rows.forEach((item, index) => {
          const rowY = y + 38 + index * 34;
          if (index) nodes.push(`<line x1="${panelX}" y1="${rowY}" x2="${panelX + panelWidth}" y2="${rowY}" stroke="#d4ced8"/>`);
          const badgeColor = scheduleColor(item.group, scheduleColors);
          if (item.group !== "—") { rect(panelX + 10, rowY + 5, 86, 24, badgeColor, "none", 5); text(item.group, panelX + 53, rowY + 22, 12, 900, contrastColor(badgeColor), "middle"); }
          text(rosterName(item.employee), panelX + (item.group !== "—" ? 110 : 12), rowY + 23, 14, 700);
        });
      }
    });
    y += 38 + dailySummaryRows * 34;
  }
  if (config.visibleCards.offers !== false && data.offers?.length) {
    y += 14; rect(margin, y, contentWidth, 38, config.cardColors?.offers || "#d98a31", "none", 8); text(config.labels.offers, margin + contentWidth - 14, y + 25, 16, 900, "#ffffff", "end"); y += 46;
    const gap = 12; const columns = Math.min(3, data.offers.length); const offerWidth = (contentWidth - gap * (columns - 1)) / columns;
    data.offers.forEach((offer, index) => {
      const column = index % columns; const row = Math.floor(index / columns); const offerY = y + row * (116 + gap); const x = margin + column * (offerWidth + gap);
      rect(x, offerY, offerWidth, 116, "#fffaf2", config.cardColors?.offers || "#d98a31", 10);
      text(short(offer.title, 42), x + 12, offerY + 25, 15, 900);
      if (offer.discountPercent != null) text(`-${offer.discountPercent}%`, x + offerWidth - 12, offerY + 25, 13, 900, "#c61f3c", "end");
      const prices = `${offer.priceBefore != null ? `Was ${offer.priceBefore}` : ""}${offer.priceAfter != null ? `  Now ${offer.priceAfter} ${config.currency}` : ""}`.trim();
      if (prices) text(short(prices, 48), x + 12, offerY + 51, 13, 800);
      text(`${config.labels.offerAdmits} ${offer.childrenCount || 1} ${(offer.childrenCount || 1) === 1 ? config.labels.childSingular : config.labels.childPlural}`, x + 12, offerY + 76, 13, 800, "#176837");
      if (offer.details) text(short(offer.details, 58), x + 12, offerY + 100, 11, 600);
    });
    y += Math.ceil(data.offers.length / columns) * 116 + Math.max(0, Math.ceil(data.offers.length / columns) - 1) * gap;
  }
  if (config.visibleSections.notes) {
    y += 14; rect(margin, y, contentWidth, 38, config.primary, "none", 8); text(config.labels.notes, margin + contentWidth - 14, y + 25, 16, 900, "#ffffff", "end"); y += 38;
    const notices = data.notices?.length ? data.notices : [{ title: config.labels.noNotices, message: "", priority: "INFO" }];
    notices.forEach((notice) => {
      const critical = String(notice.priority || "").toUpperCase() === "CRITICAL";
      rect(margin, y, contentWidth, 52, critical ? "#fee7eb" : "#ffffff", critical ? "#d7193f" : "#d4ced8", 4);
      text(short(notice.title, 44), margin + 14, y + 22, 14, 900, critical ? "#a50f2d" : config.text);
      if (notice.message) text(short(notice.message, 145), margin + 14, y + 42, 12, 650, critical ? "#8f1730" : config.text);
      if (critical) text("CRITICAL", margin + contentWidth - 14, y + 22, 12, 900, "#d7193f", "end");
      y += 52;
    });
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
function OperationsPoster({ config, weekday, data, grouped, scheduleColors }) {
  const slotCount = Math.max(1, Number(config.rotationSlotCount) || 8);
  const style = {
    "--ops-primary": config.primary,
    "--ops-accent": config.accent,
    "--ops-text": config.text,
    "--ops-am": config.amColor,
    "--ops-bw": config.bwColor,
    "--ops-pm": config.pmColor,
    "--ops-female": config.roleColors?.female, "--ops-male": config.roleColors?.male, "--ops-cashier": config.roleColors?.cashier, "--ops-leader": config.roleColors?.leader, "--ops-cashier-leader": config.roleColors?.cashierLeader,
  };
  const columnParts = [
    "36px",
    "230px",
    ...(config.visibleSections.attendance ? ["63px", "63px"] : []),
    ...(config.visibleSections.breaks ? ["63px", "63px"] : []),
    ...(config.visibleSections.rotation
      ? Array(slotCount).fill(
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
  const topCards = config.cardOrder.filter((card) => !["offers", "bracelets"].includes(card) && config.visibleCards[card] && (card !== "trips" || data.trips?.length) && (card !== "birthdays" || data.events?.length));
  const shiftBlock = (shift) => {
    const people = grouped[shift] || [];
    if (!people.length) return null;
    const startHour = Number(data?.shifts?.[shift]?.startTime?.slice(0, 2) || 10);
    const rotationHours = Array.from({ length: slotCount }, (_, index) => String((startHour + index - 1) % 12 + 1));
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
              ? config.labels.morningShift
              : shift === "BW"
                ? config.labels.betweenShift
                : config.labels.nightShift}
          </b>
          <span>
            {formatTime12(data?.shifts?.[shift]?.startTime)} —{" "}
            {formatTime12(data?.shifts?.[shift]?.endTime)}
          </span>
        </header>
        {show.rotation && <div className="ops-shift-hours" style={rowStyle}>
          <b className="ops-rotation-time-label" style={{ gridColumn: `span ${leadingColumns}` }}>{config.labels.rotationTime}</b>
          {rotationHours.map((hour, index) => <b key={`${shift}-${hour}-${index}`}>{hour}</b>)}
        </div>}
        {Array.from({ length: total }, (_, index) => {
          const person = people[index];
          const role = rosterRole(person, config.labels);
          const tone = employeeTone(person, config.labels);
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
                <i className={`ops-role-band ops-role-${role.tone}`} style={{ gridColumn: `span ${slotCount}` }}>{role.label}</i>
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
                  const strong = (config.rotationHighlightedCodes || ["DROP", "TOWER", "DATA"]).includes(
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
  const showBracelets = config.cardOrder.includes("bracelets") && config.visibleCards.bracelets;
  const sections = {
    roster: (
      <section className="ops-table" key="roster">
        <div className="ops-table-head" style={rowStyle}>
          <b>#</b>
          <b>{config.labels.employee}</b>
          {show.attendance && (
            <b className="ops-grouphead" style={{ gridColumn: "span 2" }}>
              {config.labels.attendance}
            </b>
          )}
          {show.breaks && (
            <b className="ops-grouphead" style={{ gridColumn: "span 2" }}>
              {config.labels.break}
            </b>
          )}
          {show.rotation && (
            <b
              className="ops-rotation-head"
              style={{
                gridColumn: `span ${slotCount}`,
              }}
            >
              {config.labels.rotation}
            </b>
          )}
        </div>
        <div className="ops-table-subhead" style={rowStyle}>
          <b></b><b></b>
          {show.attendance && <><b>{config.labels.in}</b><b>{config.labels.out}</b></>}
          {show.breaks && <><b>{config.labels.from}</b><b>{config.labels.to}</b></>}
          {show.rotation && Array.from({ length: slotCount }, (_, index) => <b key={index}></b>)}
        </div>
        {WORKING_SHIFTS.map(shiftBlock)}
      </section>
    ),
    dailyStatus: (showBracelets || show.leaves) ? (
      <section className={`ops-daily-summary ${showBracelets && show.leaves ? "ops-daily-summary-pair" : ""}`} key="dailyStatus">
        {showBracelets && (
          <article className="ops-bottom-card ops-bracelet-section" style={{ borderColor: config.cardColors?.bracelets }}>
            <h3 style={{ background: config.cardColors?.bracelets }}>{config.labels.bracelets || cardLabels.bracelets}</h3>
            <BraceletCardContent items={data.wristbands || []} config={config} />
          </article>
        )}
        {show.leaves && (
          <article className="ops-bottom-card ops-leaves-section">
            <h3>{config.labels.leaves}</h3>
            {nonWorking.length ? (
              nonWorking.map((item) => (
                <p key={item.id}>
                  <b style={{ backgroundColor: scheduleColor(item.group, scheduleColors), color: contrastColor(scheduleColor(item.group, scheduleColors)) }}>{item.group}</b>
                  <span>{rosterName(item.employee)}</span>
                </p>
              ))
            ) : (
              <p>
                <span>{config.labels.noLeaves}</span>
              </p>
            )}
          </article>
        )}
      </section>
    ) : null,
    offers: data.offers?.length ? (
      <section className="ops-bottom-card ops-offers-section" key="offers">
        <h3>{config.labels.offers}</h3>
        <OfferCardContent offers={data.offers} config={config} />
      </section>
    ) : null,
    notes: (
      <section className="ops-bottom-card ops-notes" key="notes">
        <h3>{config.labels.notes}</h3>
        {data.notices?.length ? data.notices.map((notice) => (
          <article className={`ops-notice-item priority-${String(notice.priority || "INFO").toLowerCase()}`} key={notice.id}>
            <b>{notice.title}</b>
            <span>{notice.message}</span>
          </article>
        )) : <p>{config.labels.noNotices}</p>}
      </section>
    ),
    footer: (
      <footer className="ops-footer" key="footer">
        <i></i>
        <b>{data.motivationalPhrase || config.footerMotto}</b>
        <span>{config.branchName} · {config.labels.page} 1 of 1</span>
      </footer>
    ),
  };
  const posterSectionOrder = (config.sectionOrder || []).filter((part) => !["offers", "leaves"].includes(part));
  if (config.visibleCards.offers !== false && data.offers?.length) {
    const notesIndex = posterSectionOrder.indexOf("notes");
    posterSectionOrder.splice(notesIndex < 0 ? posterSectionOrder.length : notesIndex, 0, "offers");
  }
  if (showBracelets || show.leaves) {
    const offersIndex = posterSectionOrder.indexOf("offers");
    const notesIndex = posterSectionOrder.indexOf("notes");
    const insertIndex = offersIndex >= 0 ? offersIndex : notesIndex >= 0 ? notesIndex : posterSectionOrder.length;
    posterSectionOrder.splice(insertIndex, 0, "dailyStatus");
  }
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
      {topCards.length > 0 && <section className={`ops-info-cards ops-info-cards-${topCards.length}`}>
        {topCards
          .map((card) => (
            <article key={card} className={`ops-info-card ${card}`} style={{ borderColor: config.cardColors?.[card] }}>
              <h3 style={{ background: config.cardColors?.[card] }}>{config.labels[card] || cardLabels[card]}</h3>
              {card === "bracelets" ? <BraceletCardContent items={data.wristbands || []} config={config} /> : previewCardLines(card, data).map((line, index) => <p key={index}>{line}</p>)}
            </article>
          ))}
      </section>}
      {posterSectionOrder
        .filter((part) => ["offers", "dailyStatus"].includes(part) || show[part])
        .map((part) => sections[part])}
    </article>
  );
}

export default function DailyApprovalPreview() {
  const { isArabic } = useI18n();
  const today = localIsoDate();
  const tomorrow = addDays(today, 1);
  const [date, setDate] = useState(() =>
    typeof window === "undefined"
      ? tomorrow
      : new URLSearchParams(window.location.search).get("date") || tomorrow,
  );
  const [data, setData] = useState(null);
  const [config, setConfig] = useState(fallback);
  const [phrases, setPhrases] = useState([]);
  const [scheduleColors, setScheduleColors] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const whatsappWindowRef = useRef(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      fetch(`/api/operations/roster?date=${date}`).then(async (response) => {
        let roster = await readApiResponse(response, "Roster data could not be loaded. Refresh and try again.");
        if (roster.schedule && !roster.rotation) {
          try {
            const post = (action) => fetch("/api/operations/daily", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, date }) }).then((result) => readApiResponse(result, "Automatic rotation could not be prepared."));
            await post("open");
            await post("generateRotation");
            roster = await fetch(`/api/operations/roster?date=${date}`).then((result) => readApiResponse(result, "Roster data could not be reloaded."));
          } catch (automationError) {
            console.warn("Automatic daily rotation was not prepared", automationError);
          }
        }
        return roster;
      }),
      fetch("/api/settings?keys=DAILY_OPERATIONS_TEMPLATE_CONFIG,OPS_MOTIVATION_PHRASES,OPS_SCHEDULE_CODE_CONFIG,OPS_ROTATION_RULES,OPS_BRANCH_CONFIG").then(
        async (response) => {
          const body = await readApiResponse(response, "Template settings could not be loaded. Refresh and try again.");
          const row = body.settings?.find(
            (setting) => setting.key === "DAILY_OPERATIONS_TEMPLATE_CONFIG",
          );
          return {
            config: mergeConfig(JSON.parse(row?.value || "{}")),
            phrases: JSON.parse(body.settings?.find((setting) => setting.key === "OPS_MOTIVATION_PHRASES")?.value || "[]"),
            scheduleColors: JSON.parse(body.settings?.find((setting) => setting.key === "OPS_SCHEDULE_CODE_CONFIG")?.value || "{}"),
            rotationRules: JSON.parse(body.settings?.find((setting) => setting.key === "OPS_ROTATION_RULES")?.value || "{}"),
            branch: JSON.parse(body.settings?.find((setting) => setting.key === "OPS_BRANCH_CONFIG")?.value || "{}"),
          };
        },
      ),
    ])
      .then(([roster, template]) => {
        if (active) {
          setData(roster);
          setConfig({ ...template.config, rotationSlotCount: template.rotationRules?.slotsPerShift || 8, rotationHighlightedCodes: template.rotationRules?.highlightedPositionCodes || ["DROP", "TOWER", "DATA"], branchCode: template.branch?.branchCode || "MOT", branchName: template.branch?.branchName || "MOT Branch" });
          setPhrases(Array.isArray(template.phrases) ? template.phrases : []);
          setScheduleColors(template.scheduleColors || {});
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
  const weekday = new Intl.DateTimeFormat(config.weekdayLocale || "en-US", {
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
      const post = (action) => fetch("/api/operations/daily", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, date }) }).then((response) => readApiResponse(response, "Rotation generation failed"));
      await post("open");
      await post("generateRotation");
      const roster = await fetch(`/api/operations/roster?date=${date}`).then((response) => readApiResponse(response, "Roster reload failed"));
      setData(roster);
      setActionMessage(isArabic ? "تم توليد روتيشن جديد بالقواعد" : "A new rules-based rotation was generated");
    } catch (requestError) { setError(requestError.message); } finally { setSaving(false); }
  };
  const createRosterImage = async () => {
    try {
      return await capturePosterPngBlob(document.querySelector(".daily-operations-poster"));
    } catch (captureError) {
      console.warn("Exact roster capture failed; using the safe renderer", captureError);
      return posterPngBlob({ data, config, weekday, grouped, scheduleColors });
    }
  };
  const downloadRosterImage = (blob, branchCode) => {
    const downloadUrl = URL.createObjectURL(blob);
    const download = document.createElement("a");
    download.href = downloadUrl;
    download.download = `BillyBeez-${branchCode}-roster-${date}.png`;
    download.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1500);
  };
  const copyRosterAndOpenWhatsApp = async () => {
    setError(""); setActionMessage("");
    try {
      if (!data?.schedule) throw new Error("Roster preview is not ready");
      const branchCode = config.branchCode || "MOT";
      const blobPromise = createRosterImage();
      let clipboardPromise = null;
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        try {
          clipboardPromise = navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
        } catch (clipboardError) {
          console.warn("Clipboard image copy could not be started; downloading instead", clipboardError);
        }
      }
      const message = isArabic ? `روستر Billy Beez ${branchCode} - ${date}` : `Billy Beez ${branchCode} roster - ${date}`;
      const whatsappUrl = `https://web.whatsapp.com/send?text=${encodeURIComponent(message)}`;
      let whatsappWindow = whatsappWindowRef.current;
      if (!whatsappWindow || whatsappWindow.closed) {
        whatsappWindow = window.open(whatsappUrl, "billybeez-whatsapp");
        whatsappWindowRef.current = whatsappWindow;
      } else {
        try { whatsappWindow.location.href = whatsappUrl; } catch { whatsappWindow = window.open(whatsappUrl, "billybeez-whatsapp"); whatsappWindowRef.current = whatsappWindow; }
      }
      whatsappWindow?.focus();
      if (!whatsappWindow) setError(isArabic ? "المتصفح منع فتح واتساب. اسمح بالنوافذ المنبثقة لهذه الصفحة وحاول مرة أخرى." : "The browser blocked WhatsApp. Allow pop-ups for this page and try again.");
      if (clipboardPromise) {
        try {
          await clipboardPromise;
          setActionMessage(isArabic ? "تم نسخ صورة الروستر وفتح واتساب؛ الصق الصورة مباشرة" : "Roster image copied and WhatsApp opened; paste the image directly");
          return;
        } catch (clipboardError) {
          console.warn("Clipboard image copy was unavailable; downloading instead", clipboardError);
        }
      }
      downloadRosterImage(await blobPromise, branchCode);
      setActionMessage(isArabic ? "تم فتح واتساب وتنزيل صورة الروستر لأن المتصفح منع النسخ" : "WhatsApp opened and the roster image was downloaded because clipboard copy was blocked");
    } catch (shareError) { setError(shareError.message); }
  };
  return (
    <section className="daily-approval-preview">
      <header className="panel daily-preview-header">
        <div>
          <span className="daily-preview-eyebrow">BILLY BEEZ · {config.branchCode || "MOT"}</span>
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
          <button onClick={() => setDate(addDays(today, -1))}>
            {isArabic ? "أمس" : "Yesterday"}
          </button>
          <button
            className="secondary"
            onClick={() => setDate(tomorrow)}
          >
            {isArabic ? "غدًا" : "Tomorrow"}
          </button>
          <Link className="button-link" href="/settings?tab=template">{isArabic ? "إعدادات" : "Settings"}</Link>
          <button className="secondary" onClick={print}>
            {isArabic ? "طباعة" : "Print"}
          </button>
          <button onClick={generateRotationNow} disabled={saving}>
            {isArabic ? "روتيشن" : "Rotation"}
          </button>
          <button className="whatsapp-button" onClick={copyRosterAndOpenWhatsApp}>
            {isArabic ? "نسخ وفتح واتساب" : "Copy & open WhatsApp"}
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
          scheduleColors={scheduleColors}
        />
      )}
    </section>
  );
}
