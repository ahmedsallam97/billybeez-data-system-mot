"use client";
import { useUiText } from '@/app/i18n';
import {PageHeader,FormSection,ContentGrid,EmptyState} from '../ui/DesktopLayout';
import ActionButton from "@/app/ActionButton";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {useSearchParams, useRouter} from 'next/navigation';
import { useI18n } from "../i18n";
import { readApiResponse } from "@/lib/client/read-api-response";
import {PermissionButton,PermissionFieldset} from "@/app/account/PermissionControls";
import Link from "next/link";
import { usePermission } from "../account/AccountContext";
import { OperationalStatus, OperationalError } from "../ui/OperationalFeedback";
import StockWorkspace from "./StockWorkspace";
import PlanningCustomerDirectory from "./PlanningCustomerDirectory";
import stockCatalogConfig from "@/lib/operations/stock-catalog";
import { formatOfferWeekdays, offerAppliesOnDate } from "@/lib/operations/planning";

const { normalizeBraceletTypes } = stockCatalogConfig;

const WEEKDAYS = [
  [0, "Sunday", "الأحد"], [1, "Monday", "الاثنين"], [2, "Tuesday", "الثلاثاء"],
  [3, "Wednesday", "الأربعاء"], [4, "Thursday", "الخميس"], [5, "Friday", "الجمعة"], [6, "Saturday", "السبت"],
];

function localDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}


function FormCard({ permission, title, hint, children, onSubmit, button, secondary }) {
  return <form className="ops-setup-card" onSubmit={onSubmit}>
    <header><h3>{title}</h3><p>{hint}</p></header>
    <PermissionFieldset permission={permission} className="ops-setup-fields" style={{border:0,padding:0,margin:0}}>{children}</PermissionFieldset>
    <div className="ops-form-actions"><PermissionButton permission={permission} type="submit">{button}</PermissionButton>{secondary}</div>
  </form>;
}

function parseWeekdays(value) {
  try { const days = JSON.parse(value || "[]"); return Array.isArray(days) && days.length ? days.map(Number) : WEEKDAYS.map(([day]) => day); } catch { return WEEKDAYS.map(([day]) => day); }
}

function displayOfferDate(value) {
  return !value || value === "2000-01-01" || value === "2999-12-31" ? "" : value;
}

function offerSchedule(offer, isArabic) {
  const days = formatOfferWeekdays(offer.weekdaysJson, isArabic);
  const dates = offer.permanent ? (isArabic ? "دائم" : "Permanent") : [displayOfferDate(offer.effectiveFrom), displayOfferDate(offer.effectiveTo)].filter(Boolean).join(" → ") || (isArabic ? "بدون حد زمني" : "Open ended");
  return `${days} · ${dates}`;
}

export default function DailySetupWorkspace({ section = "trips", bookings }) {
  const { isArabic } = useI18n();
  const searchParams=useSearchParams(),router=useRouter();
  const canRoster=usePermission("roster.view");
  const [date, setDate] = useState(localDate);
  useEffect(()=>{const requested=searchParams.get('date');if(/^\d{4}-\d{2}-\d{2}$/.test(requested||''))setDate(requested);},[searchParams]);
  const [daily, setDaily] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [catalogues, setCatalogues] = useState({ meals: [], partyRooms: [], stockItems: [] });
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState("success");
  const [busy, setBusy] = useState(false);
  const [editingOffer, setEditingOffer] = useState(null);
  const [editingTrip, setEditingTrip] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editingStock, setEditingStock] = useState(null);
  const saving=useRef(false);

  const request = useCallback((url, options = {}) => fetch(url, { credentials: "same-origin", ...options }).then((response) => readApiResponse(response)), []);

  const load = useCallback(async () => {
    setMessage("");
    try {
      const day = await request(`/api/operations/daily?date=${date}&view=${encodeURIComponent(section)}`);
      setDaily(day);
      if (section === "rosterSettings") {
        const staff = await request("/api/operations/employees?status=ACTIVE");
        setEmployees(staff.employees || []);
      }
      if (["birthdays", "stock"].includes(section)) {
        const planningSettings = await request("/api/operations/settings?keys=OPS_PLANNING_CATALOGS");
        const catalogueRow = planningSettings.settings?.[0];
        if (catalogueRow?.value) setCatalogues(JSON.parse(catalogueRow.value));
      }
    } catch (error) { setMessageKind("danger"); setMessage(error.message); }
  }, [date, request, section]);

  useEffect(() => { load(); }, [load]);

  async function submit(action, event, extra = {}, method = "POST") {
    event.preventDefault();
    if(saving.current)return; saving.current=true;
    const formElement = event.currentTarget;
    setBusy(true); setMessage("");
    const form = new FormData(formElement);
    const savedOfferId = String(form.get("offerId") || extra.offerId || "");
    const requestAction = savedOfferId && action === "createOffer" ? "updateOffer" : action;
    const requestMethod = requestAction === "updateOffer" ? "PATCH" : method;
    const body = { action: requestAction, date, ...Object.fromEntries(form.entries()), ...extra, ...(savedOfferId ? { offerId: savedOfferId } : {}) };
    if (["createOffer", "updateOffer"].includes(requestAction)) body.weekdays = form.getAll("weekdays").map(Number);
    try {
      await request("/api/operations/daily", { method: requestMethod, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      formElement.reset();
      setEditingOffer(null);
      setEditingTrip(null);
      setEditingEvent(null);
      setEditingStock(null);
      setMessageKind("success"); setMessage(isArabic ? "تم الحفظ" : "Saved");
      await load(); router.refresh();
    } catch (error) { setMessageKind("danger"); setMessage(error.message); } finally { saving.current=false; setBusy(false); }
  }

  async function deleteOffer(offer) {
    if (!window.confirm(isArabic ? `حذف عرض ${offer.title}؟` : `Delete ${offer.title}?`)) return;
    setBusy(true); setMessage("");
    try {
      await request("/api/operations/daily", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "deleteOffer", offerId: offer.id, branch: offer.branch || "MOT" }) });
      if (editingOffer?.id === offer.id) setEditingOffer(null);
      setMessageKind("success"); setMessage(isArabic ? "تم حذف العرض" : "Offer deleted");
      await load();
    } catch (error) { setMessageKind("danger"); setMessage(error.message); } finally { setBusy(false); }
  }

  async function removePlanningItem(kind, item) {
    const isTrip = kind === "trip";
    const label = isTrip ? (item.name || "trip") : (item.childName || item.name || "birthday");
    if (!window.confirm(isArabic ? `حذف ${label}؟` : `Delete ${label}?`)) return;
    setBusy(true); setMessage("");
    try {
      await request("/api/operations/daily", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: isTrip ? "deleteTrip" : "deleteEvent", [isTrip ? "tripId" : "eventId"]: item.id, branch: item.branch || "MOT" }),
      });
      if (isTrip && editingTrip?.id === item.id) setEditingTrip(null);
      if (!isTrip && editingEvent?.id === item.id) setEditingEvent(null);
      setMessageKind("success"); setMessage(isArabic ? "تم الحذف" : "Deleted");
      await load();
    } catch (error) { setMessageKind("danger"); setMessage(error.message); } finally { setBusy(false); }
  }

  async function stockAction(action, item, quantity = null) {
    const labels = {
      deleteStock: isArabic ? "حذف صف الستوك؟" : "Delete this stock row?",
      issueStock: isArabic ? `تأكيد صرف ${quantity}؟` : `Issue ${quantity}?`,
    };
    if (!window.confirm(labels[action])) return;
    setBusy(true); setMessage("");
    try {
      await request("/api/operations/daily", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, stockId: item.id, branch: item.branch || "MOT", quantity }),
      });
      if (action === "deleteStock" && editingStock?.id === item.id) setEditingStock(null);
      setMessageKind("success");
      setMessage(action === "issueStock" ? (isArabic ? "تم تسجيل الصرف" : "Stock issue recorded") : (isArabic ? "تم حذف صف الستوك" : "Stock row deleted"));
      await load();
    } catch (error) { setMessageKind("danger"); setMessage(error.message); } finally { setBusy(false); }
  }

  function issueStock(item) {
    const raw = window.prompt(isArabic ? "الكمية المصروفة" : "Quantity to issue", "1");
    if (raw == null) return;
    const quantity = Number(raw);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setMessageKind("danger"); setMessage(isArabic ? "اكتب كمية صحيحة أكبر من صفر" : "Enter a valid quantity greater than zero");
      return;
    }
    stockAction("issueStock", item, quantity);
  }

  async function saveName(employeeId, operationalName) {
    setBusy(true); setMessage("");
    try {
      await request(`/api/operations/employees/${employeeId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationalName }) });
      setMessageKind("success"); setMessage(isArabic ? "تم حفظ الاسم الثنائي" : "Roster name saved");
      await load();
    } catch (error) { setMessageKind("danger"); setMessage(error.message); } finally { setBusy(false); }
  }

  const headings = {
    trips: ["الرحلات", "Trips", "سجل كل تفاصيل الرحلات ليقرأها الروستر تلقائيًا.", "Record every trip detail for the roster."],
    birthdays: ["أعياد الميلاد", "Birthdays", "بيانات العميل والطفل والميعاد والوجبات.", "Customer, child, timing and meal details."],
    offers: ["العروض", "Offers", "اختر أيام التشغيل؛ التواريخ والساعات اختيارية.", "Choose operating weekdays; dates and times are optional."],
    stock: ["الستوك", "Stock", "إعداد ستوك دائم للكاشير والمخزن يظهر تلقائيًا في كل يوم.", "Global cashier and warehouse stock used automatically every day."],
    rosterSettings: ["إعدادات الروستر", "Roster settings", "الاسم الثنائي الذي يظهر في الروستر.", "The exact two-name label shown on the roster."],
  };
  const heading = headings[section] || headings.trips;
  const offerCatalog = daily?.offerCatalog || [];
  const directoryNotice = (kind, text) => { setMessageKind(kind); setMessage(text); };

  return <section className="daily-setup-workspace">
    <PageHeader title={isArabic?heading[0]:heading[1]} description={isArabic?heading[2]:heading[3]} context={daily?.branchConfig?.branchCode||daily?.branch||"MOT"} actions={<>{section!=="stock"&&<label>{isArabic?"تاريخ العرض":"View date"}<input type="date" value={date} onChange={event=>setDate(event.target.value)}/></label>}{["trips","birthdays","offers","stock"].includes(section)&&<PermissionButton permission={`${section}.create`} type="button" onClick={()=>{const form=document.getElementById(section==="stock"?"stock-variant-editor":`create-${section}`);if(form){form.open=true;form.scrollIntoView({block:"nearest"});form.querySelector("input:not([type=hidden]),select")?.focus({preventScroll:true});}}}>{isArabic?({trips:"إضافة رحلة",birthdays:"إضافة عيد ميلاد",offers:"إضافة عرض",stock:"إضافة مخزون"}[section]):({trips:"Create trip",birthdays:"Create birthday",offers:"Create offer",stock:"Add stock"}[section])}</PermissionButton>}</>}/>
    {messageKind === "danger" ? <OperationalError error={message}/> : message && <div role="status" className="alert success">{message}</div>}

    {section === "rosterSettings" && <section className="panel ops-name-settings">
      <header><h2>{isArabic ? "الاسم الثنائي في الروستر" : "Two-name roster display"}</h2><p>{isArabic ? "اكتب الاسم الذي سيظهر في الروستر يدويًا؛ الاسم الكامل في ملف الموظف لا يتغير." : "Enter the exact two-name label shown on the roster. The full employee record stays unchanged."}</p></header>
      <div className="ops-name-list">{employees.map((employee) => <RosterNameRow key={employee.id} employee={employee} disabled={busy} save={saveName} isArabic={isArabic} />)}</div>
    </section>}

    {bookings && <section className="panel ui-period-bookings"><header className="ui-section-head"><div><h2>{isArabic?"حجوزات الفترة المحددة":"Bookings for selected period"}</h2><p className="ui-filter-criteria">{bookings.from} → {bookings.until} · {bookings.rows.length} {isArabic?"حجز":"bookings"}</p></div><label>{isArabic?"شهر موعد الحجز":"Booking month"}<input type="month" value={bookings.month} onChange={event=>{const url=new URL(location.href);url.searchParams.set("bookingMonth",event.target.value);router.replace(url.pathname+url.search,{scroll:false});}}/></label></header><div className="record-table-scroll"><table className="record-line-table ui-comparison-table"><thead><tr>{(isArabic?["الحجز","موعد الحجز","الأطفال","التغطية المطلوبة","الحالة","مسؤولو الحجز"]:["Booking","Booking date / time","Children","Required coverage","Status","Booking leaders"]).map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{bookings.rows.map(row=><tr key={row.id}><td><b>{row.childName||row.name}</b><small>{row.branch}</small></td><td>{row.workDate}<small>{row.startTime||"—"} → {row.endTime||"—"}</small></td><td>{row.expectedChildren??row.expectedGuests??"—"}</td><td>{row.staffingRequired??(isArabic?"لم تحدد":"Not specified")}</td><td><OperationalStatus value={row.status}/></td><td>{canRoster?<Link className="ui-context-link" href={`/operations/daily?date=${row.workDate}`}>{isArabic?"التغطية والموظفون المسؤولون":"Coverage and responsible employees"}</Link>:<span>{isArabic?"يلزم صلاحية الروستر لعرض المسؤولين":"Roster access is required to view leaders"}</span>}</td></tr>)}</tbody></table></div>{!bookings.rows.length&&<EmptyState title={isArabic?"لا توجد حجوزات في الفترة المحددة":"No bookings in the selected period"}/>}</section>}
    <ContentGrid>
      {section === "trips" && <FormSection id={`create-${section}`} title={isArabic?"إضافة / تعديل رحلة":"Add / edit trip"} open={Boolean(editingTrip)}><TripForm key={editingTrip?.id || "new"} trip={editingTrip} daily={daily} catalogues={catalogues} submit={submit} cancel={() => setEditingTrip(null)} isArabic={isArabic} /></FormSection>}
      {section === "birthdays" && <FormSection id="create-birthdays" title={isArabic?"إضافة / تعديل عيد ميلاد":"Add / edit birthday"} open={Boolean(editingEvent)}><BirthdayForm key={editingEvent?.id || "new"} event={editingEvent} daily={daily} catalogues={catalogues} submit={submit} cancel={() => setEditingEvent(null)} isArabic={isArabic} /></FormSection>}
      {section === "offers" && <FormSection id="create-offers" title={isArabic?"إضافة / تعديل عرض":"Add / edit offer"} open={Boolean(editingOffer)}><OfferForm key={editingOffer?.id || "new"} offer={editingOffer} busy={busy} isArabic={isArabic} submit={submit} cancel={() => setEditingOffer(null)} /></FormSection>}
    </ContentGrid>


    {section === "offers" && <OfferList date={date} offers={offerCatalog} isArabic={isArabic} busy={busy} edit={setEditingOffer} remove={deleteOffer} />}
    {section === "stock" && <StockWorkspace items={daily?.wristbands || []} catalog={catalogues.stockCatalog} isArabic={isArabic} busy={busy} editing={editingStock} setEditing={setEditingStock} submit={submit} issue={(item,quantity)=>stockAction("issueStock",item,quantity)} remove={item=>stockAction("deleteStock",item)} />}
    {!["rosterSettings", "offers", "stock"].includes(section) && <section className="panel ops-setup-current"><h2>{isArabic ? (date===localDate()?"حجوزات اليوم":"حجوزات التاريخ المحدد") : (date===localDate()?"Today’s bookings":"Bookings on selected date")}</h2><ContentGrid columns={1} className="ops-current-grid">
      {section === "trips" && <Current title={isArabic ? "الرحلات" : "Trips"} items={daily?.trips} render={(item) => `${item.name} · ${item.startTime || "—"} · ${item.expectedChildren ?? 0}${item.braceletColor ? ` · ${item.braceletMaterial || ""} ${item.braceletColor}` : ""}`} edit={setEditingTrip} remove={(item) => removePlanningItem("trip", item)} isArabic={isArabic} />}
      {section === "birthdays" && <Current title={isArabic ? "أعياد الميلاد" : "Birthdays"} items={daily?.events} render={(item) => `${item.childName || item.name} · ${item.customerName || "—"} · ${item.startTime || "—"}${item.braceletColor ? ` · ${item.braceletMaterial || ""} ${item.braceletColor}` : ""}`} edit={setEditingEvent} remove={(item) => removePlanningItem("event", item)} isArabic={isArabic} />}
    </ContentGrid></section>}
    {section === "trips" && <PlanningCustomerDirectory kind="academy" items={daily?.tripPartners || []} branch={daily?.branch || "MOT"} isArabic={isArabic} disabled={busy} request={request} onChanged={load} onNotice={directoryNotice} />}
    {section === "birthdays" && <PlanningCustomerDirectory kind="birthday" items={daily?.birthdayCustomers || []} branch={daily?.branch || "MOT"} isArabic={isArabic} disabled={busy} request={request} onChanged={load} onNotice={directoryNotice} />}
  </section>;
}

function storedMealCounts(item) {
  let values = {};
  try { values = JSON.parse(item?.mealCountsJson || "{}"); } catch { values = {}; }
  if (item?.chickenNuggets && values["Chicken Nuggets"] == null) values["Chicken Nuggets"] = item.chickenNuggets;
  if (item?.beefBurgers && values["Beef Burger"] == null) values["Beef Burger"] = item.beefBurgers;
  if (item?.chickenBurgers && values["Chicken Burger"] == null) values["Chicken Burger"] = item.chickenBurgers;
  return values;
}
function MealCountFields({ item, meals = [], isArabic }) {
  const values = storedMealCounts(item);
  const configured = meals.length ? meals : ["Chicken Nuggets", "Beef Burger", "Chicken Burger"];
  return <fieldset className="ops-meal-counts"><legend>{isArabic ? "أعداد الوجبات" : "Meal quantities"}</legend>{configured.map((meal) => <label key={meal}>{meal}<input name={`meal__${encodeURIComponent(meal)}`} type="number" min="0" defaultValue={values[meal] ?? 0} /></label>)}</fieldset>;
}

function TripForm({ trip, daily, catalogues, submit, cancel, isArabic }) {
  const localize = useUiText();
  return <FormCard permission={trip?"trips.edit":"trips.create"} title={trip ? (isArabic ? "تعديل الرحلة" : "Edit trip") : (isArabic ? "رحلة جديدة" : "New trip")} hint={isArabic ? "سجل المدرسة والموعد والأعداد والوجبة؛ لون البريسلت يختار تلقائيًا من الستوك." : "School, timing, headcount and meals; bracelet stock is assigned automatically."} button={isArabic ? "حفظ الرحلة" : "Save trip"} onSubmit={(event) => submit(trip ? "updateTrip" : "createTrip", event, trip ? { tripId: trip.id, branch: trip.branch || "MOT" } : {}, trip ? "PATCH" : "POST")} secondary={trip && <ActionButton type="button" className="secondary" onClick={cancel}>{isArabic ? "إلغاء التعديل" : "Cancel edit"}</ActionButton>}>
    <select name="tripPartnerId" aria-label={isArabic ? "أكاديمية مسجلة" : "Saved academy"} defaultValue="" onChange={(event) => { const item = daily?.tripPartners?.find((row) => row.id === event.target.value); const form = event.currentTarget.form; if (item && form) { form.elements.name.value = item.name; form.elements.supervisorName.value = item.supervisorName || ""; form.elements.supervisorPhone.value = item.supervisorPhone || ""; } }}><option value="">{isArabic ? "أكاديمية جديدة" : "New academy"}</option>{(daily?.tripPartners || []).map((item) => <option key={item.id} value={item.id}>{item.name}{item.supervisorName ? ` · ${item.supervisorName}` : ""}</option>)}</select>
    <input name="name" defaultValue={trip?.name || ""} placeholder={isArabic ? "اسم المدرسة أو الأكاديمية الجديدة" : "New school / academy name"} /><label>{isArabic ? "من" : localize("From")}<input name="startTime" type="time" required defaultValue={trip?.startTime || ""} /></label><label>{isArabic ? "إلى" : localize("To")}<input name="endTime" type="time" defaultValue={trip?.endTime || ""} /></label>
    <input name="expectedChildren" type="number" min="0" defaultValue={trip?.expectedChildren ?? ""} placeholder={isArabic ? "عدد الأطفال" : localize("Children")} /><input name="supervisorName" defaultValue={trip?.supervisorName || ""} placeholder={isArabic ? "اسم المشرف" : "Supervisor name"} /><input name="supervisorPhone" type="tel" defaultValue={trip?.supervisorPhone || ""} placeholder={isArabic ? "تليفون المشرف" : "Supervisor phone"} />
    <label className="ops-check-line"><input name="mealIncluded" type="checkbox" defaultChecked={trip?.mealIncluded === true} /> {isArabic ? "الرحلة تشمل وجبة" : "Meal included"}</label>
    <MealCountFields item={trip} meals={catalogues.meals || []} isArabic={isArabic} />
    <input name="staffingRequired" type="number" min="0" defaultValue={trip?.staffingRequired ?? ""} placeholder={isArabic ? "الموظفون المطلوبون" : "Staff required"} /><textarea name="notes" defaultValue={trip?.notes || ""} aria-label={isArabic ? "ملاحظات الرحلة" : "Trip notes"} placeholder={isArabic ? "ملاحظات الرحلة" : "Trip notes"} />
  </FormCard>;
}

function BirthdayForm({ event, daily, catalogues, submit, cancel, isArabic }) {
  const localize = useUiText();
  return <FormCard permission={event?"birthdays.edit":"birthdays.create"} title={event ? (isArabic ? "تعديل عيد الميلاد" : "Edit birthday") : (isArabic ? "عيد ميلاد جديد" : "New birthday")} hint={isArabic ? "بيانات العميل والطفل والموعد والوجبات وعدد الضيوف." : "Customer, child, timing, meals and guests."} button={isArabic ? "حفظ عيد الميلاد" : "Save birthday"} onSubmit={(formEvent) => submit(event ? "updateEvent" : "createEvent", formEvent, event ? { eventId: event.id, branch: event.branch || "MOT" } : {}, event ? "PATCH" : "POST")} secondary={event && <ActionButton type="button" className="secondary" onClick={cancel}>{isArabic ? "إلغاء التعديل" : "Cancel edit"}</ActionButton>}>
    <select name="birthdayCustomerId" aria-label={isArabic ? "عميل مسجل" : "Saved customer"} defaultValue="" onChange={(event) => { const item = daily?.birthdayCustomers?.find((row) => row.id === event.target.value); const form = event.currentTarget.form; if (item && form) { form.elements.customerName.value = item.customerName; form.elements.customerPhone.value = item.phone; form.elements.childName.value = item.childName || ""; } }}><option value="">{isArabic ? "عميل جديد" : "New customer"}</option>{(daily?.birthdayCustomers || []).map((item) => <option key={item.id} value={item.id}>{item.customerName} · {item.phone}{item.childName ? ` · ${item.childName}` : ""}</option>)}</select>
    <input name="name" defaultValue={event?.name || ""} placeholder={isArabic ? "عنوان الحجز (اختياري)" : "Booking title (optional)"} /><input name="customerName" defaultValue={event?.customerName || ""} placeholder={isArabic ? "اسم العميل" : localize("Customer name")} /><input name="customerPhone" type="tel" defaultValue={event?.customerPhone || ""} placeholder={isArabic ? "رقم التليفون" : "Phone number"} /><input name="childName" defaultValue={event?.childName || ""} placeholder={isArabic ? "اسم الطفل" : "Child name"} />
    <label>{isArabic ? "من" : localize("From")}<input name="startTime" type="time" required defaultValue={event?.startTime || ""} /></label><label>{isArabic ? "إلى" : localize("To")}<input name="endTime" type="time" defaultValue={event?.endTime || ""} /></label><input name="expectedGuests" type="number" min="0" defaultValue={event?.expectedGuests ?? ""} placeholder={isArabic ? "عدد الضيوف" : "Guests"} />
    <MealCountFields item={event} meals={catalogues.meals || []} isArabic={isArabic} />
    <input name="partyRoomHours" type="number" min="0" step="0.5" defaultValue={event?.partyRoomHours ?? ""} placeholder={isArabic ? "حجز Party Room بالساعات" : "Party Room hours"} /><select name="location" defaultValue={event?.location || ""}><option value="">{isArabic ? "اختر الغرفة" : "Choose room"}</option>{(catalogues.partyRooms || []).map((item) => { const name = typeof item === "string" ? item : item.name; return <option key={name} value={name}>{name}</option>; })}</select>
    <input name="staffingRequired" type="number" min="0" defaultValue={event?.staffingRequired ?? ""} placeholder={isArabic ? "الموظفون المطلوبون" : "Staff required"} /><textarea name="notes" defaultValue={event?.notes || ""} aria-label={isArabic ? "ملاحظات عيد الميلاد" : "Birthday notes"} placeholder={isArabic ? "ملاحظات" : localize("Notes")} />
  </FormCard>;
}

function OfferForm({ offer, busy, isArabic, submit, cancel }) {
  const selected = useMemo(() => parseWeekdays(offer?.weekdaysJson), [offer]);
  const action = offer ? "updateOffer" : "createOffer";
  return <FormCard permission={offer?"offers.edit":"offers.create"} title={offer ? (isArabic ? "تعديل العرض" : "Edit offer") : (isArabic ? "عرض جديد" : "New offer")} hint={isArabic ? "اختر أيام التشغيل. ترك التواريخ والساعات فارغة يعني بدون قيود." : "Choose active weekdays. Dates and times may stay empty."} button={busy ? (isArabic ? "جارٍ الحفظ…" : "Saving…") : (isArabic ? "حفظ العرض" : "Save offer")} onSubmit={(event) => submit(action, event, offer ? { offerId: offer.id, branch: offer.branch || "MOT" } : {}, offer ? "PATCH" : "POST")} secondary={offer && <ActionButton type="button" className="secondary" onClick={cancel}>{isArabic ? "إلغاء التعديل" : "Cancel edit"}</ActionButton>}>
    {offer?.id && <input type="hidden" name="offerId" value={offer.id} />}<input name="title" required defaultValue={offer?.title || ""} placeholder={isArabic ? "اسم العرض" : "Offer title"} />
    <select name="offerMode" aria-label={isArabic ? "مدة العرض" : "Offer duration"} defaultValue={offer?.permanent === false ? "RANGE" : "PERMANENT"}><option value="PERMANENT">{isArabic ? "عرض دائم" : "Permanent offer"}</option><option value="RANGE">{isArabic ? "فترة اختيارية" : "Optional date range"}</option></select>
    <fieldset className="ops-weekday-picker"><legend>{isArabic ? "أيام تشغيل العرض" : "Active weekdays"}</legend>{WEEKDAYS.map(([day, en, ar]) => <label key={day}><input type="checkbox" name="weekdays" value={day} defaultChecked={selected.includes(day)} /><span>{isArabic ? ar : en}</span></label>)}</fieldset>
    <label>{isArabic ? "السعر قبل العرض" : "Price before"}<input name="priceBefore" type="number" min="0" step="0.01" defaultValue={offer?.priceBefore ?? ""} /></label><label>{isArabic ? "السعر بعد العرض" : "Price after"}<input name="priceAfter" type="number" min="0" step="0.01" defaultValue={offer?.priceAfter ?? ""} /></label><label>{isArabic ? "نسبة الخصم %" : "Discount %"}<input name="discountPercent" type="number" min="0" max="100" step="0.01" defaultValue={offer?.discountPercent ?? ""} placeholder={isArabic ? "تُحسب تلقائيًا عند تركها فارغة" : "Auto-calculated when blank"} /></label><label>{isArabic ? "عدد الأطفال الذين يدخلهم العرض" : "Children admitted by this offer"}<input name="childrenCount" type="number" min="1" step="1" defaultValue={offer?.childrenCount ?? 1} /></label>
    <label>{isArabic ? "من تاريخ (اختياري)" : "From date (optional)"}<input name="effectiveFrom" type="date" defaultValue={displayOfferDate(offer?.effectiveFrom)} /></label><label>{isArabic ? "إلى تاريخ (اختياري)" : "To date (optional)"}<input name="effectiveTo" type="date" defaultValue={displayOfferDate(offer?.effectiveTo)} /></label>
    <label>{isArabic ? "من ساعة (اختياري)" : "From time (optional)"}<input name="startTime" type="time" defaultValue={offer?.startTime || ""} /></label><label>{isArabic ? "إلى ساعة (اختياري)" : "To time (optional)"}<input name="endTime" type="time" defaultValue={offer?.endTime || ""} /></label>
    <textarea name="details" aria-label={isArabic ? "تفاصيل العرض" : "Offer details"} defaultValue={offer?.details || ""} placeholder={isArabic ? "تفاصيل العرض والسعر والشروط (اختياري)" : "Details, price and conditions (optional)"} />
  </FormCard>;
}

function OfferList({ date, offers, isArabic, busy, edit, remove }) {
  const localize = useUiText();
  const [filter,setFilter] = useState('RELEVANT');
  const visible = offers.filter(offer=>filter==='INACTIVE'?!offer.active:filter==='ACTIVE'?offer.active:offerAppliesOnDate(offer,date));
  return <section className="panel ops-setup-current"><header className="ui-section-head"><div><h2>{isArabic?'العروض المتاحة':'Available offers'}</h2><p className="ui-filter-criteria">{isArabic?'سريان العروض في تاريخ العرض':'Offer eligibility on view date'}: {date}</p></div><label>{isArabic?'عرض العروض':'Offer view'}<select aria-label={isArabic?"عرض العروض":"Offer view"} value={filter} onChange={event=>setFilter(event.target.value)}>{[['RELEVANT','Applicable on selected date','السارية في التاريخ المحدد'],['ACTIVE','All active offers','كل العروض النشطة'],['INACTIVE','Inactive offers','العروض المتوقفة']].map(([value,en,ar])=><option key={value} value={value}>{isArabic?ar:en}</option>)}</select></label></header>{visible.length?<div className="record-table-scroll"><table className="record-line-table ui-comparison-table"><thead><tr>{(isArabic?['العرض','الحالة','السعر النهائي','الأطفال','الأيام وفترة السريان','الإجراءات']:['Offer','Status','Final price','Children','Days and effective period','Actions']).map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{visible.map(offer=><tr key={offer.id}><td><b>{offer.title}</b>{offer.discountPercent!=null&&<small>-{offer.discountPercent}%</small>}<small>{offer.details}</small></td><td>{offer.active?(isArabic?'نشط':'Active'):(isArabic?'متوقف':'Inactive')}</td><td><b>{offer.priceAfter??'—'}</b>{offer.priceBefore!=null&&<small><del>{offer.priceBefore}</del></small>}</td><td>{offer.childrenCount||1}</td><td>{offerSchedule(offer,isArabic)}</td><td><div className="ui-page-actions"><ActionButton title={isArabic?`تعديل عرض ${offer.title}`:`Edit offer ${offer.title}`} type="button" disabled={busy} onClick={()=>{edit(offer);document.getElementById('create-offers')?.scrollIntoView({block:'start'});}}>{isArabic?'تعديل':'Edit'}</ActionButton><ActionButton type="button" className="danger" disabled={busy} title={isArabic?`حذف عرض ${offer.title}`:`Delete offer ${offer.title}`} onClick={()=>remove(offer)}>{isArabic?'حذف':'Delete'}</ActionButton></div></td></tr>)}</tbody></table></div>:<EmptyState title={isArabic?'لا توجد عروض مطابقة لهذا العرض':'No offers match this view'}/>}</section>;
}

function RosterNameRow({ employee, disabled, save, isArabic }) {
  const localize = useUiText();
  const [value, setValue] = useState(employee.operationalName || "");
  useEffect(() => setValue(employee.operationalName || ""), [employee.operationalName]);
  return <div><span><b>{employee.name}</b><small>{employee.hrisNumber || employee.localEmployeeCode}</small></span><input aria-label={`${employee.name} roster name`} value={value} onChange={(event) => setValue(event.target.value)} placeholder={isArabic ? "الاسم الثنائي" : "Two-name roster label"} /><ActionButton type="button" disabled={disabled || !value.trim()} onClick={() => save(employee.id, value)}>{isArabic ? "حفظ" : localize("Save")}</ActionButton></div>;
}

function Current({ title, items = [], render, edit, remove, isArabic }) {
  const localize = useUiText();
  return <div aria-label={title}>{items.length ? items.map((item) => <div className="ops-current-item" key={item.id}><p>{render(item)}</p><span><ActionButton type="button" onClick={() => edit(item)}>{isArabic ? "تعديل" : localize("Edit")}</ActionButton><ActionButton type="button" className="danger" onClick={() => remove(item)}>{isArabic ? "حذف" : localize("Delete")}</ActionButton></span></div>) : <EmptyState title={isArabic ? "لا توجد حجوزات في التاريخ المحدد" : "No bookings on this date"}><p>{isArabic ? "استخدم زر الإضافة بجوار التاريخ لتسجيل حجز جديد." : "Use the add action beside the date to record a booking."}</p></EmptyState>}</div>;
}

