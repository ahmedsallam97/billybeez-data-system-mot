"use client";
import { useUiText } from '@/app/i18n';
import {PageHeader} from '../../ui/DesktopLayout';
import {PermissionButton} from '@/app/account/PermissionControls';
import ActionButton, { ActionLink } from '@/app/ActionButton';

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from 'react-dom';
import Link from "next/link";
import {
  formatTime12,
  frontAssignment,
  scheduleGroup,
  WORKING_SHIFTS,
} from "@/lib/operations/roster";
import { previewCardLines } from "@/lib/operations/daily-preview";
import DayResponsibilities from "../DayResponsibilities";
import RosterBraceletSelections from "../RosterBraceletSelections";
import { rosterBracelets } from "@/lib/operations/bracelet-roster";
import {RotationCellSelect,RotationCellDialog} from '../RotationCellControls';
import RotationGenerationDialog from '../RotationGenerationDialog';
import posterStyles from "./OperationsPoster.module.css";
import toolbarStyles from "./RosterToolbar.module.css";
import { colorNameFor, formatOfferWeekdays, stockAvailable } from "@/lib/operations/planning";
import { useI18n } from "@/app/i18n";
import { employeeGenderClass } from "@/app/employeeDisplay";
import dailyTemplateConfig from "@/lib/operations/daily-template-config";
import stockCatalogConfig from "@/lib/operations/stock-catalog";
import { toBlob as htmlNodeToBlob } from "html-to-image";
import { validateDailyTemplate } from "@/lib/operations/template-validation";
import { readApiResponse } from "@/lib/client/read-api-response";

const { DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG, normalizeDailyOperationsTemplateConfig } = dailyTemplateConfig;
const { normalizeBraceletTypes } = stockCatalogConfig;

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
  Annual: "#b9dcc0", Rep: "#eedb85", OFF: "#efaaaa", Unpaid: "#efbd87",
  Mission: "#91c9ed", M: "#91c9ed", Holiday: "#cfe8ff", H: "#cfe8ff",
  ANP: "#edabb2", AWP: "#b76a77", SL: "#d6b5e8",
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
function positionDisplayName(position) {
  const value = String(position?.label || position?.code || "").trim().toLowerCase().replace(/_/g, " ");
  return value.replace(/(^|[\s/-])([a-z])/g, (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}
const fallback = DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG;
function mergeConfig(value) {
  const config=normalizeDailyOperationsTemplateConfig(value);
  config.labels=Object.fromEntries(Object.entries(config.labels).map(([key,label])=>[key,/[\u0600-\u06ff]/.test(label)?fallback.labels[key]||label:label]));
  return config;
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

function rosterRole(person, labels = fallback.labels) {
  const frontCashier = frontAssignment(person?.metadata) === "FRONT_CASHIER";
  const cashier = person?.employee?.department === "CASHIER";
  const leader = Boolean(person?.isShiftLeader ?? person?.employee?.operationsTeamLeader);
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
  if (!offers.length) return <p>{config.cardContent?.offers || config.labels.noOffers}</p>;
  return <div className="ops-offer-grid">{offers.map((offer) => {
    return <article className="ops-offer-item" key={offer.id}>
      <b>{offer.title} {offer.discountPercent != null && <em className="ops-discount-badge">-{offer.discountPercent}%</em>}</b>
      {(offer.priceBefore != null || offer.priceAfter != null) && (
        <span className="ops-offer-price">
          {offer.priceBefore != null && <del>{offer.priceBefore} {config.currency}</del>}
          {offer.priceAfter != null && <strong>{offer.priceAfter} {config.currency}</strong>}
        </span>
      )}
      <span className="ops-offer-children">{config.labels.offerAdmits} {offer.childrenCount || 1} {(offer.childrenCount || 1) === 1 ? config.labels.childSingular : config.labels.childPlural}</span>
      <small>{formatOfferWeekdays(offer.weekdaysJson)}</small>
      {offer.details && <small>{offer.details}</small>}
    </article>;
  })}</div>;
}

function BraceletCardContent({ items = [], config, roster, trips=[], events=[] }) {
  const rows = roster?.rows || rosterBracelets(items, config.braceletTypes,{}, {hasTrips:trips.some(item=>item.status!=='CANCELLED'),hasBirthdays:events.some(item=>item.eventType==='BIRTHDAY'&&item.status!=='CANCELLED')});
  const status = state => ({SELECT_STOCK:"Choose stock variant",NO_STOCK:"No available stock",UNAVAILABLE:"Selected stock unavailable",OUT_OF_STOCK:"Out of stock"}[state]||"");
  if (!rows.length) return <p>{config.cardContent?.bracelets || config.labels.noBracelets}</p>;
  return <div className="ops-bracelet-list">{rows.map((item) => {
    const braceletTone = item.color || "#e8e0ed";
    return <p key={item.code} data-bracelet-type={item.code} data-stock-id={item.stockId||''}>
      <strong>{item.label}</strong>
      <i className="ops-bracelet-swatch" style={{ backgroundColor: braceletTone }} aria-hidden="true" />
      <b style={{ backgroundColor: braceletTone, color: contrastColor(braceletTone) }}>{[item.material, item.colorName, status(item.state)].filter(Boolean).join(" · ")}</b>
    </p>;
  })}</div>;
}
async function capturePosterPngBlob(node) {
  if (!node) throw new Error("Roster preview is not ready");
  if (document.fonts?.ready) await document.fonts.ready;
  await Promise.all([...node.querySelectorAll("img")].map(image => image.decode?.().catch(() => {}) || Promise.resolve()));
  const width = Math.max(node.scrollWidth, node.offsetWidth);
  const height = Math.max(node.scrollHeight, node.offsetHeight);
  const blob = await htmlNodeToBlob(node, {
    backgroundColor: "#ffffff",
    cacheBust: true,
    pixelRatio: 2,
    width,
    height,
    filter: element => !element.classList?.contains('ops-rotation-select'),
    style: { width: `${width}px`, maxWidth: "none", height: `${height}px`, overflow: "visible", boxShadow: "none" },
  });
  if (!blob) throw new Error("Roster image generation failed");
  return blob;
}
function OperationsPoster({ config, weekday, data, grouped, scheduleColors, rotationEditor, allowDisabled, onCellChange, editBusy, isArabic }) {
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
    "var(--ops-index-width, 36px)",
    "var(--ops-name-width, 230px)",
    ...(config.visibleSections.attendance ? ["var(--ops-time-width, 63px)", "var(--ops-time-width, 63px)"] : []),
    ...(config.visibleSections.breaks ? ["var(--ops-time-width, 63px)", "var(--ops-time-width, 63px)"] : []),
    ...(config.visibleSections.rotation
      ? Array(slotCount).fill(
          rotationEditor ? "minmax(124px, 1fr)" : "minmax(21px, 1fr)",
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
  const topCards = config.cardOrder.filter(card => ["trips", "birthdays"].includes(card) && config.visibleCards[card]);
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
        style={{'--ops-shift-people': total}}
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
          const plannedBreak=(data.rotation?.breaks||[]).find(b=>b.employeeId===person.employee.id&&b.status!=='CANCELLED');
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
                  <i>{plannedBreak?formatTime12(plannedBreak.startTime):''}</i>
                  <i>{plannedBreak?formatTime12(plannedBreak.endTime):''}</i>
                </>
              )}
              {show.rotation && role && (
                <i className={`ops-role-band ops-role-${role.tone}`} style={{ gridColumn: `span ${slotCount}` }}>{role.label}</i>
              )}
              {show.rotation && !role &&
                rotationHours.map((hour, cell) => {
                  const slotHour = (startHour + cell) % 24;
                  const shiftStart=data?.shifts?.[shift]?.startTime || '10:00';
                  const slotStart=`${String(slotHour).padStart(2,'0')}:${shiftStart.slice(3,5)}`;
                  const assignment =
                    assignments.find(
                      (item) =>
                        item.employeeId === person.employee.id &&
                        item.startTime <= slotStart && item.endTime > slotStart,
                    );
                  const onBreak=(data.rotation?.breaks||[]).some(b=>b.employeeId===person.employee.id&&b.status!=='CANCELLED'&&b.startTime<=slotStart&&b.endTime>slotStart);
                  const strong = ["DROP", "TOWER", "DATA"].includes(
                    assignment?.position?.code,
                  );
                  const positionColor = strong ? assignment?.position?.color || "#f41743" : "#ffffff";
                  return (
                    <i
                      className={strong ? "rotation-strong" : ""}
                      style={assignment ? { backgroundColor: positionColor, color: contrastColor(positionColor) } : undefined}
                      key={`${hour}-${cell}`}
                    >
                      {rotationEditor ? <RotationCellSelect cell={rotationEditor.cells.find(c=>c.employeeId===person.employee.id&&c.startTime===slotStart)} assignment={assignment} isArabic={false} allowDisabled={allowDisabled} disabled={editBusy} onChange={onCellChange}/> : onBreak ? 'Break' : positionDisplayName(assignment?.position)}
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
      <div className="ops-roster-scroll" key="roster" tabIndex={0} role="region" aria-label="Daily roster and hourly allocations">
      <section className="ops-table">
        <div className="ops-table-head ops-merged-head" style={rowStyle}>
          <b style={{gridColumn:1,gridRow:"1 / 3"}}>#</b>
          <b style={{gridColumn:2,gridRow:"1 / 3"}}>{config.labels.employee}</b>
          {show.attendance && <><b style={{gridColumn:"3 / span 2",gridRow:1}}>{config.labels.attendance}</b><b className="ops-subhead-label" style={{gridColumn:3,gridRow:2}}>{config.labels.in}</b><b className="ops-subhead-label" style={{gridColumn:4,gridRow:2}}>{config.labels.out}</b></>}
          {show.breaks && <><b style={{gridColumn:(show.attendance?5:3)+" / span 2",gridRow:1}}>{config.labels.break}</b><b className="ops-subhead-label" style={{gridColumn:show.attendance?5:3,gridRow:2}}>{config.labels.from}</b><b className="ops-subhead-label" style={{gridColumn:show.attendance?6:4,gridRow:2}}>{config.labels.to}</b></>}
          {show.rotation && <b className="ops-rotation-head" style={{gridColumn:(3+(show.attendance?2:0)+(show.breaks?2:0))+" / span "+slotCount,gridRow:"1 / 3"}}>{config.labels.rotation}</b>}
        </div>
        {WORKING_SHIFTS.map(shiftBlock)}
      </section>
      </div>
    ),
    dailyStatus: (showBracelets || show.leaves) ? (
      <section className={`ops-daily-summary ${showBracelets && show.leaves ? "ops-daily-summary-pair" : ""}`} key="dailyStatus">
        {showBracelets && (
          <article className="ops-bottom-card ops-bracelet-section" style={{ borderColor: config.cardColors?.bracelets }}>
            <h3 style={{ background: config.cardColors?.bracelets }}>{config.labels.bracelets || cardLabels.bracelets}</h3>
            <BraceletCardContent items={data.wristbands || []} config={config} roster={data.braceletRoster} trips={data.trips} events={data.events} />
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
    offers: config.visibleCards.offers && config.cardOrder.includes("offers") ? (
      <section className="ops-bottom-card ops-offers-section" key="offers">
        <h3>{config.labels.offers}</h3>
        <OfferCardContent offers={data.offers || []} config={config} />
      </section>
    ) : null,
    notes: (
      <section className="ops-bottom-card ops-notes" key="notes">
        <h3>{config.labels.notes}</h3>
        {config.operationalNotes && <ul className="ops-default-notes">{config.operationalNotes.split("\n").filter(line=>line.trim()).map((line,index)=><li key={index}><span aria-hidden="true">{index+1}</span>{line.replace(/^\s*[•·-]\s*/, "")}</li>)}</ul>}
        {data.notices?.length ? data.notices.map((notice) => (
          <article className={`ops-notice-item priority-${String(notice.priority || "INFO").toLowerCase()}`} key={notice.id}>
            <div><b>{notice.title}</b></div>
            <div><span>{notice.message}</span></div>
          </article>
        )) : <p>{config.labels.noNotices}</p>}
      </section>
    ),
    footer: (
      <footer className="ops-footer" key="footer">
        <i></i>
        <b>{config.footerMotto !== fallback.footerMotto ? config.footerMotto : data.motivationalPhrase || config.footerMotto}</b>
        <span>{config.branchName}</span>
      </footer>
    ),
  };
  const posterSectionOrder = (config.sectionOrder || []).filter(part=>part!=="offers").map(part=>part==="leaves"?"dailyStatus":part);
  if(!posterSectionOrder.includes("dailyStatus") && showBracelets) posterSectionOrder.splice(Math.max(0,posterSectionOrder.indexOf("roster")+1),0,"dailyStatus");
  const notesIndex=posterSectionOrder.indexOf("notes");
  posterSectionOrder.splice(notesIndex>=0?notesIndex:Math.max(0,posterSectionOrder.indexOf("footer")),0,"offers");
  return (
    <article className={"daily-operations-poster "+posterStyles.poster+(rotationEditor?' '+posterStyles.posterEditing:'')} style={style}>
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
          <span>{config.subtitle !== fallback.subtitle ? config.subtitle : data.motivationalPhrase || config.subtitle}</span>
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
              {card === "bracelets" ? <BraceletCardContent items={data.wristbands || []} config={config} roster={data.braceletRoster} trips={data.trips} events={data.events} /> : card === "offers" ? <OfferCardContent offers={data.offers || []} config={config}/> : (previewCardLines(card,data).length ? previewCardLines(card,data) : [config.cardContent?.[card] || "No records for this date"]).map((line,index)=><p key={index}>{line}</p>)}
            </article>
          ))}
      </section>}
      {posterSectionOrder
        .filter((part) => ["offers", "dailyStatus"].includes(part) || show[part])
        .map((part) => sections[part])}
    </article>
  );
}

export default function DailyApprovalPreview({ templateOverride, phrasesOverride, previewDate, embedded = false } = {}) {
  const localize = useUiText();
  const { isArabic } = useI18n();
  const today = localIsoDate();
  const tomorrow = addDays(today, 1);
  const [date, setDate] = useState(() =>
    typeof window === "undefined"
      ? tomorrow
      : new URLSearchParams(window.location.search).get("date") || tomorrow,
  );
  const [dateReady,setDateReady]=useState(false);
  useEffect(()=>{setDateReady(true);},[]);
  const [savedData, setData] = useState(null);
  const data=savedData&&phrasesOverride?{...savedData,motivationalPhrase:phrasesOverride[Math.abs(new Date(date+"T00:00:00Z").getTime()/86400000)%Math.max(phrasesOverride.length,1)]||""}:savedData;
  const [savedConfig, setConfig] = useState(fallback);
  const {config,draftError} = useMemo(() => {
    try {if(templateOverride)validateDailyTemplate(templateOverride);return {config:templateOverride ? { ...savedConfig, ...mergeConfig(templateOverride), rotationSlotCount: savedConfig.rotationSlotCount, rotationHighlightedCodes: savedConfig.rotationHighlightedCodes, branchCode: savedConfig.branchCode, branchName: savedConfig.branchName, braceletTypes: savedConfig.braceletTypes } : savedConfig,draftError:""};}
    catch(error){return {config:savedConfig,draftError:error.message};}
  },[savedConfig,templateOverride]);
  useEffect(() => { if (previewDate) setDate(previewDate); }, [previewDate]);
  const [savedPhrases, setPhrases] = useState([]);
  const phrases=phrasesOverride || savedPhrases;
  const [scheduleColors, setScheduleColors] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [rotationEditor,setRotationEditor]=useState(null);
  const [rotationGeneration,setRotationGeneration]=useState(false);
  const [editBusy,setEditBusy]=useState(false);
  const [allowDisabled,setAllowDisabled]=useState(false);
  const [pendingCell,setPendingCell]=useState(null);
  const [cellError,setCellError]=useState('');
  useEffect(()=>{setRotationEditor(null);setPendingCell(null);setAllowDisabled(false);setRotationGeneration(false);},[date]);
  const loadRotationEditor=async()=>{
    const result=await readApiResponse(await fetch(`/api/operations/daily?view=rotationEditor&date=${date}&branch=${encodeURIComponent(data?.branch||'MOT')}`),'Could not load editable rotations');
    setRotationEditor(result.editor);return result.editor;
  };
  const toggleRotationEditor=async()=>{
    if(rotationEditor){setRotationEditor(null);setAllowDisabled(false);return;}
    setEditBusy(true);setError('');
    try{await loadRotationEditor();}catch(error){setError(error.message);}finally{setEditBusy(false);}
  };
  const saveRotationCell=async reason=>{
    setEditBusy(true);setCellError('');
    try{
      const result=await readApiResponse(await fetch('/api/operations/daily',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'changeRotationCell',date,branch:data.branch,employeeId:pendingCell.cell.employeeId,startTime:pendingCell.cell.startTime,endTime:pendingCell.cell.endTime,operationalPositionId:pendingCell.positionId,sourceFingerprint:rotationEditor.sourceFingerprint,allowDisabled,reason})}),'Could not save rotation change');
      setPendingCell(null);
      setData(await readApiResponse(await fetch(`/api/operations/roster?date=${date}&branch=${encodeURIComponent(data.branch)}`)));
      await loadRotationEditor();
      setActionMessage(isArabic?`تم حفظ التعديل اليدوي · نسخة الروستر ${result.plan.version}`:`Manual change saved · roster version ${result.plan.version}`);
    }catch(error){setCellError(error.message);}finally{setEditBusy(false);}
  };
  const whatsappWindowRef = useRef(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(localize(""));
    Promise.all([
      fetch(`/api/operations/roster?date=${date}`).then(response => readApiResponse(response, "Roster data could not be loaded.")),
      fetch("/api/operations/settings?keys=DAILY_OPERATIONS_TEMPLATE_CONFIG,OPS_MOTIVATION_PHRASES,OPS_SCHEDULE_CODE_CONFIG,OPS_ROTATION_RULES,OPS_BRANCH_CONFIG,OPS_PLANNING_CATALOGS").then(
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
            stockCatalog: JSON.parse(body.settings?.find((setting) => setting.key === "OPS_PLANNING_CATALOGS")?.value || "{}").stockCatalog || {},
          };
        },
      ),
    ])
      .then(([roster, template]) => {
        if (active) {
          setData(roster);
          setConfig({ ...template.config, rotationSlotCount: template.rotationRules?.slotsPerShift || 8, rotationHighlightedCodes: template.rotationRules?.highlightedPositionCodes || ["DROP", "TOWER", "DATA"], branchCode: template.branch?.branchCode || "MOT", branchName: template.branch?.branchName || "MOT Branch", braceletTypes: normalizeBraceletTypes(template.stockCatalog?.braceletUsages) });
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
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
  const print = () => {
    const previousEditor=rotationEditor;
    if(previousEditor)flushSync(()=>setRotationEditor(null));
    document.body.dataset.dailyPreviewPrint = "true";
    const done = () => {
      delete document.body.dataset.dailyPreviewPrint;
      if(previousEditor)setRotationEditor(previousEditor);
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    
  };
  const createRosterImage = async () => {
    const previousEditor=rotationEditor;
    if(previousEditor)flushSync(()=>setRotationEditor(null));
    try{return await capturePosterPngBlob(document.querySelector('.daily-operations-poster'));}
    finally{if(previousEditor)setRotationEditor(previousEditor);}
  };
  const downloadRosterImage = (blob, branchCode) => {
    const downloadUrl = URL.createObjectURL(blob);
    const download = document.createElement("a");
    download.href = downloadUrl;
    download.download = `BillyBeez-${branchCode}-roster-${date}.png`;
    download.click();
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 1500);
  };
  const openWhatsApp = () => {
    let target = whatsappWindowRef.current;
    if (!target || target.closed) {
      target = window.open("https://web.whatsapp.com/", "billybeez-whatsapp");
      whatsappWindowRef.current = target;
    }
    if (target) target.focus();
    else setError(localize("The browser blocked WhatsApp. Allow pop-ups or open WhatsApp yourself."));
  };
  const copyRosterImage = async (forWhatsApp = false) => {
    if (sharing || loading) return;
    setSharing(true);
    setError(localize("")); setActionMessage(localize(""));
    try {
      if (!data?.schedule) throw new Error("Roster preview is not ready");
      const blobPromise = createRosterImage();
      let clipboardPromise = null;
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        try {
          clipboardPromise = navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
        } catch (clipboardError) {
          console.warn("Clipboard image copy could not be started; downloading instead", clipboardError);
        }
      }
      // Keep focus here until PNG copy completes. Text URLs do not attach images.
      if (clipboardPromise) {
        try {
          await clipboardPromise;
          setActionMessage(localize(forWhatsApp ? "Roster image copied. Paste it in your open WhatsApp chat with Ctrl+V. If WhatsApp is closed, use Open WhatsApp below." : "Roster image copied to Clipboard."));
          if (forWhatsApp && whatsappWindowRef.current && !whatsappWindowRef.current.closed) whatsappWindowRef.current.focus();
          return;
        } catch (clipboardError) {
          console.warn("Clipboard image copy was unavailable; downloading instead", clipboardError);
        }
      }
      downloadRosterImage(await blobPromise, config.branchCode || "MOT");
      setActionMessage(localize("Clipboard image access was blocked. The roster PNG was downloaded; attach it in WhatsApp."));
    } catch (shareError) { setError(shareError.message); } finally { setSharing(false); }
  };
  return (
    <section className="daily-approval-preview">
      {draftError&&<p className="alert danger" role="alert">{draftError}. Preview shows the saved design until this value is corrected.</p>}
      {!embedded && <PageHeader className="daily-preview-header" title={localize("Daily Roster")} description={localize("The published monthly schedule supplies the team; design rules live in Settings.")}>
        <div className={`daily-preview-controls no-print ${toolbarStyles.toolbar}`} data-roster-toolbar>
          <div className={`${toolbarStyles.group} ${toolbarStyles.dateGroup}`} role="group" aria-label={localize("Roster date and day navigation")} data-roster-toolbar-group="date">
            <span className={`${toolbarStyles.groupHeading} ${toolbarStyles.dateContext}`}>{localize("Roster date ·")} <time dateTime={dateReady?date:undefined}>{dateReady?new Intl.DateTimeFormat(isArabic?'ar-EG':'en-US',{dateStyle:'full',timeZone:'UTC'}).format(new Date(`${date}T00:00:00Z`)):localize("Loading date…")}</time></span>
            <div className={toolbarStyles.groupActions}>
              <label>
                <span className={toolbarStyles.dateLabel}>{isArabic ? "التاريخ" : localize("Date")}</span>
                <input
                  type="date"
                  disabled={sharing}
                  value={date}
                  onChange={(event) => { if (event.target.value) setDate(event.target.value); }}
                />
              </label>
              <ActionButton icon="back" className={toolbarStyles.action} title={localize("Yesterday")} aria-label={localize("Yesterday")} disabled={sharing} onClick={() => setDate(addDays(today, -1))}>Yesterday</ActionButton>
              <ActionButton
                icon="next"
                className={`secondary ${toolbarStyles.action}`}
                title="Tomorrow"
                aria-label="Tomorrow"
                disabled={sharing}
                onClick={() => setDate(tomorrow)}
              >
                Tomorrow
              </ActionButton>
            </div>
          </div>
          <div className={toolbarStyles.group} role="group" aria-label={localize("Editing and settings")} data-roster-toolbar-group="edit">
            <span className={toolbarStyles.groupHeading}>{localize("Editing & settings")}</span>
            <div className={toolbarStyles.groupActions}>
              <ActionLink icon="settings" className={`button-link ${toolbarStyles.action} ${toolbarStyles.settingsAction}`} title={localize("Settings")} aria-label={localize("Settings")} href="/settings?tab=template">Settings</ActionLink>
              <PermissionButton permission="rotations.create" icon="generate" className={toolbarStyles.action} title={localize("Rotation Distribution Preview")} aria-label={localize("Rotation Distribution Preview")} disabled={editBusy || loading || sharing || !data?.schedule} onClick={()=>setRotationGeneration(true)}>Rotation Distribution Preview</PermissionButton>
              <PermissionButton permission="rotations.assign" icon={rotationEditor ? "check" : "edit"} className={`secondary ${toolbarStyles.action} ${toolbarStyles.editAction}`} title={rotationEditor ? localize("Finish editing rotations") : localize("Edit rotations")} aria-label={rotationEditor ? localize("Finish editing rotations") : localize("Edit rotations")} disabled={editBusy || loading || !data?.schedule} onClick={toggleRotationEditor} aria-pressed={Boolean(rotationEditor)}>{rotationEditor ? (isArabic?'إنهاء تعديل الروتيشن':localize("Finish editing rotations")) : (isArabic?'تعديل الروتيشن':localize("Edit rotations"))}</PermissionButton>
            </div>
          </div>
          <div className={toolbarStyles.group} role="group" aria-label={localize("Print and sharing")} data-roster-toolbar-group="export">
            <span className={toolbarStyles.groupHeading}>{localize("Print & share")}</span>
            <div className={toolbarStyles.groupActions}>
              <PermissionButton permission={["roster.print","roster.pdf"]} icon="print" className={`secondary ${toolbarStyles.action} ${toolbarStyles.printAction}`} title={localize("Print roster")} aria-label={localize("Print")} onClick={print}>
                Print
              </PermissionButton>
              <PermissionButton permission="roster.share" icon="whatsapp" className={`whatsapp-button ${toolbarStyles.action} ${toolbarStyles.whatsappAction}`} title={localize("Copy roster image for WhatsApp")} aria-label="WhatsApp" disabled={sharing || loading || !data?.schedule} onClick={()=>copyRosterImage(true)}>WhatsApp</PermissionButton>
              <PermissionButton permission="roster.share" icon="copy" className={`secondary ${toolbarStyles.action} ${toolbarStyles.copyAction}`} title={localize("Copy roster image to Clipboard")} aria-label={localize("Copy to Clipboard")} disabled={sharing || loading || !data?.schedule} onClick={()=>copyRosterImage(false)}>Copy to Clipboard</PermissionButton>
            </div>
          </div>
          <ActionLink icon="back" className={`button-link ${toolbarStyles.action} ${toolbarStyles.backAction}`} title={localize("Back to Operations")} aria-label="Back" href="/operations">Back</ActionLink>
        </div>
      </PageHeader>}
      {error && <div className="alert danger">{localize(error)}</div>}
      {!embedded&&rotationGeneration&&<RotationGenerationDialog key={`${date}:${data.branch}`} date={date} branch={data.branch} onCancel={()=>setRotationGeneration(false)} onApplied={async result=>{
        setData(await readApiResponse(await fetch(`/api/operations/roster?date=${date}&branch=${encodeURIComponent(data.branch)}`)));
        if(rotationEditor)await loadRotationEditor();
        setRotationGeneration(false);
        setActionMessage(isArabic?`تم توليد الروتيشن · نسخة الروستر ${result.plan.version}`:`Rotation generated · roster version ${result.plan.version}`);
      }}/>}
      {actionMessage && <div className="alert success no-print" role="status">{actionMessage} <PermissionButton permission="roster.share" icon="whatsapp" type="button" className="secondary" onClick={openWhatsApp}>Open WhatsApp</PermissionButton></div>}
      {!embedded&&rotationEditor&&<section className={`panel no-print ${posterStyles.editNotice}`} data-rotation-editor>
        <h2>{isArabic?'تعديل مواقع الروتيشن من القائمة':'Edit hourly rotation locations'}</h2>
        <p>{isArabic?'اختار الموقع من قائمة الساعة في الروستر، ثم اكتب السبب واحفظ. الخلايا المقفولة وتكليفات الكاشير الثابتة محمية.':'Choose a location in an hourly roster cell, then enter a reason and save. Locked cells and fixed cashier assignments are protected.'}</p>
        {!rotationEditor.canEdit&&<p className="alert warning">{isArabic?'هذا الروستر مغلق أو تاريخي؛ التعديل غير متاح.':'This roster is closed or historical; editing is unavailable.'}</p>}
        {rotationEditor.allowDisabledManualAssignments&&<label className={posterStyles.overrideLabel}><input type="checkbox" checked={allowDisabled} onChange={event=>setAllowDisabled(event.target.checked)}/>{isArabic?'السماح بتجاوز استبعاد المواقع يدويًا لهذه التعديلات':'Allow explicit manual overrides for excluded locations in these edits'}</label>}
        <ActionButton className="secondary" disabled={editBusy} onClick={async()=>{setEditBusy(true);try{await loadRotationEditor();setError('');}catch(error){setError(error.message);}finally{setEditBusy(false);}}}>{isArabic?'تحديث قوائم التعديل':'Reload edit options'}</ActionButton>
      </section>}
      {!embedded&&pendingCell&&<RotationCellDialog pending={pendingCell} isArabic={isArabic} saving={editBusy} error={cellError} onSave={saveRotationCell} onCancel={()=>{setPendingCell(null);setCellError('');}}/>}
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
          rotationEditor={!embedded?rotationEditor:null}
          allowDisabled={allowDisabled} editBusy={editBusy} isArabic={false}
          onCellChange={change=>{setCellError('');setPendingCell(change);}}
        />
      )}
      {!embedded && data?.schedule && <div className={`${posterStyles.rosterSetup} no-print`} dir={isArabic?'rtl':'ltr'}>
        <DayResponsibilities compact date={date} branch={data.branch} scheduleId={data.schedule.id} onSaved={async()=>setData(await readApiResponse(await fetch(`/api/operations/roster?date=${date}&branch=${encodeURIComponent(data.branch || "MOT")}`)))} />
        <RosterBraceletSelections compact key={`${date}:${data.branch}`} date={date} branch={data.branch} value={data.braceletRoster} isArabic={isArabic} onSaved={async()=>setData(await readApiResponse(await fetch(`/api/operations/roster?date=${date}&branch=${encodeURIComponent(data.branch || "MOT")}`)))}/>
      </div>}
    </section>
  );
}
