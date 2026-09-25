"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n";

const WEEKDAYS = [
  [0, "Sunday", "الأحد"], [1, "Monday", "الاثنين"], [2, "Tuesday", "الثلاثاء"],
  [3, "Wednesday", "الأربعاء"], [4, "Thursday", "الخميس"], [5, "Friday", "الجمعة"], [6, "Saturday", "السبت"],
];

function localDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

async function apiJson(response) {
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { /* handled below */ }
  if (response.status === 401) {
    if (typeof window !== "undefined") {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    }
    throw new Error("Your session expired. Redirecting to login…");
  }
  if (!response.ok || !payload) throw new Error(payload?.error || "Request failed");
  return payload;
}

function FormCard({ title, hint, children, onSubmit, button, secondary }) {
  return <form className="ops-setup-card" onSubmit={onSubmit}>
    <header><h3>{title}</h3><p>{hint}</p></header>
    <div className="ops-setup-fields">{children}</div>
    <div className="ops-form-actions"><button type="submit">{button}</button>{secondary}</div>
  </form>;
}

function parseWeekdays(value) {
  try { const days = JSON.parse(value || "[]"); return Array.isArray(days) && days.length ? days.map(Number) : WEEKDAYS.map(([day]) => day); } catch { return WEEKDAYS.map(([day]) => day); }
}

function displayOfferDate(value) {
  return !value || value === "2000-01-01" || value === "2999-12-31" ? "" : value;
}

function offerSchedule(offer, isArabic) {
  const selected = parseWeekdays(offer.weekdaysJson);
  const names = WEEKDAYS.filter(([day]) => selected.includes(day)).map(([, en, ar]) => isArabic ? ar : en);
  const days = selected.length === 7 ? (isArabic ? "كل الأيام" : "Every day") : names.join("، ");
  const dates = offer.permanent ? (isArabic ? "دائم" : "Permanent") : [displayOfferDate(offer.effectiveFrom), displayOfferDate(offer.effectiveTo)].filter(Boolean).join(" → ") || (isArabic ? "بدون حد زمني" : "Open ended");
  return `${days} · ${dates}`;
}

export default function DailySetupWorkspace({ section = "trips" }) {
  const { isArabic } = useI18n();
  const [date, setDate] = useState(localDate);
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

  const request = useCallback((url, options = {}) => fetch(url, { credentials: "same-origin", ...options }).then(apiJson), []);

  const load = useCallback(async () => {
    setMessage("");
    try {
      const day = await request(`/api/operations/daily?date=${date}`);
      setDaily(day);
      if (section === "rosterSettings") {
        const staff = await request("/api/operations/employees?status=ACTIVE");
        setEmployees(staff.employees || []);
      }
      if (["birthdays", "stock"].includes(section)) {
        const planningSettings = await request("/api/settings?keys=OPS_PLANNING_CATALOGS");
        const catalogueRow = planningSettings.settings?.[0];
        if (catalogueRow?.value) setCatalogues(JSON.parse(catalogueRow.value));
      }
    } catch (error) { setMessageKind("danger"); setMessage(error.message); }
  }, [date, request, section]);

  useEffect(() => { load(); }, [load]);

  async function submit(action, event, extra = {}, method = "POST") {
    event.preventDefault();
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
      await load();
    } catch (error) { setMessageKind("danger"); setMessage(error.message); } finally { setBusy(false); }
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

  return <section className="daily-setup-workspace">
    <header className="panel ops-setup-hero">
      <div><span>BILLY BEEZ · {daily?.branchConfig?.branchCode || daily?.branch || "MOT"}</span><h1>{isArabic ? heading[0] : heading[1]}</h1><p>{isArabic ? heading[2] : heading[3]}</p></div>
      {section !== "stock" && <label>{isArabic ? "تاريخ العرض" : "View date"}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>}
    </header>
    {message && <div className={`alert ${messageKind}`}>{message}</div>}

    {section === "rosterSettings" && <section className="panel ops-name-settings">
      <header><h2>{isArabic ? "الاسم الثنائي في الروستر" : "Two-name roster display"}</h2><p>{isArabic ? "اكتب الاسم الذي سيظهر في الروستر يدويًا؛ الاسم الكامل في ملف الموظف لا يتغير." : "Enter the exact two-name label shown on the roster. The full employee record stays unchanged."}</p></header>
      <div className="ops-name-list">{employees.map((employee) => <RosterNameRow key={employee.id} employee={employee} disabled={busy} save={saveName} isArabic={isArabic} />)}</div>
    </section>}

    <div className="ops-setup-grid">
      {section === "trips" && <TripForm key={editingTrip?.id || "new"} trip={editingTrip} daily={daily} catalogues={catalogues} submit={submit} cancel={() => setEditingTrip(null)} isArabic={isArabic} />}
      {section === "birthdays" && <BirthdayForm key={editingEvent?.id || "new"} event={editingEvent} daily={daily} catalogues={catalogues} submit={submit} cancel={() => setEditingEvent(null)} isArabic={isArabic} />}
      {section === "offers" && <OfferForm key={editingOffer?.id || "new"} offer={editingOffer} busy={busy} isArabic={isArabic} submit={submit} cancel={() => setEditingOffer(null)} />}
      {section === "stock" && <>
        <StockCard catalog={catalogues.stockCatalog} key={editingStock?.stockCategory === "SOCKS" ? editingStock.id : "socks-new"} title={isArabic ? "ستوك الشرابات" : "Socks stock"} category="SOCKS" unit="PAIR" color="#f2c94c" kind="socks" stock={editingStock?.stockCategory === "SOCKS" ? editingStock : null} cancel={() => setEditingStock(null)} submit={submit} isArabic={isArabic} />
        <StockCard catalog={catalogues.stockCatalog} key={editingStock?.stockCategory === "BRACELET" ? editingStock.id : "bracelet-new"} title={isArabic ? "ستوك البريسلت" : "Bracelet stock"} category="BRACELET" unit="ITEM" color="#9b51e0" kind="bracelet" stock={editingStock?.stockCategory === "BRACELET" ? editingStock : null} cancel={() => setEditingStock(null)} submit={submit} isArabic={isArabic} />
        <StockCard catalog={catalogues.stockCatalog} key={editingStock?.stockCategory === "CASH_ROLL" ? editingStock.id : "cash-new"} title={isArabic ? "رول الكاش" : "Cash rolls"} category="CASH_ROLL" unit="ROLL" kind="roll" stock={editingStock?.stockCategory === "CASH_ROLL" ? editingStock : null} cancel={() => setEditingStock(null)} submit={submit} isArabic={isArabic} />
        <StockCard catalog={catalogues.stockCatalog} key={editingStock?.stockCategory === "VISA_ROLL" ? editingStock.id : "visa-new"} title={isArabic ? "رول الفيزا" : "Visa rolls"} category="VISA_ROLL" unit="ROLL" kind="roll" stock={editingStock?.stockCategory === "VISA_ROLL" ? editingStock : null} cancel={() => setEditingStock(null)} submit={submit} isArabic={isArabic} />
      </>}
    </div>

    {section === "offers" && <OfferList offers={offerCatalog} isArabic={isArabic} busy={busy} edit={setEditingOffer} remove={deleteOffer} />}
    {section === "stock" && <StockList items={daily?.wristbands || []} isArabic={isArabic} busy={busy} edit={(item) => { setEditingStock(item); window.scrollTo({ top: 0, behavior: "smooth" }); }} issue={issueStock} remove={(item) => stockAction("deleteStock", item)} />}
    {!["rosterSettings", "offers", "stock"].includes(section) && <section className="panel ops-setup-current"><h2>{isArabic ? "المسجل للتاريخ المحدد" : "Saved for selected date"}</h2><div className="ops-current-grid">
      {section === "trips" && <Current title={isArabic ? "الرحلات" : "Trips"} items={daily?.trips} render={(item) => `${item.name} · ${item.startTime || "—"} · ${item.expectedChildren ?? 0}${item.braceletColor ? ` · ${item.braceletMaterial || ""} ${item.braceletColor}` : ""}`} edit={setEditingTrip} remove={(item) => removePlanningItem("trip", item)} isArabic={isArabic} />}
      {section === "birthdays" && <Current title={isArabic ? "أعياد الميلاد" : "Birthdays"} items={daily?.events} render={(item) => `${item.childName || item.name} · ${item.customerName || "—"} · ${item.startTime || "—"}${item.braceletColor ? ` · ${item.braceletMaterial || ""} ${item.braceletColor}` : ""}`} edit={setEditingEvent} remove={(item) => removePlanningItem("event", item)} isArabic={isArabic} />}
    </div></section>}
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
  return <FormCard title={trip ? (isArabic ? "تعديل الرحلة" : "Edit trip") : (isArabic ? "رحلة جديدة" : "New trip")} hint={isArabic ? "سجل المدرسة والموعد والأعداد والوجبة؛ لون البريسلت يختار تلقائيًا من الستوك." : "School, timing, headcount and meals; bracelet stock is assigned automatically."} button={isArabic ? "حفظ الرحلة" : "Save trip"} onSubmit={(event) => submit(trip ? "updateTrip" : "createTrip", event, trip ? { tripId: trip.id, branch: trip.branch || "MOT" } : {}, trip ? "PATCH" : "POST")} secondary={trip && <button type="button" className="secondary" onClick={cancel}>{isArabic ? "إلغاء التعديل" : "Cancel edit"}</button>}>
    <select name="tripPartnerId" aria-label={isArabic ? "أكاديمية مسجلة" : "Saved academy"} defaultValue="" onChange={(event) => { const item = daily?.tripPartners?.find((row) => row.id === event.target.value); const form = event.currentTarget.form; if (item && form) { form.elements.name.value = item.name; form.elements.supervisorName.value = item.supervisorName || ""; form.elements.supervisorPhone.value = item.supervisorPhone || ""; } }}><option value="">{isArabic ? "أكاديمية جديدة" : "New academy"}</option>{(daily?.tripPartners || []).map((item) => <option key={item.id} value={item.id}>{item.name}{item.supervisorName ? ` · ${item.supervisorName}` : ""}</option>)}</select>
    <input name="name" defaultValue={trip?.name || ""} placeholder={isArabic ? "اسم المدرسة أو الأكاديمية الجديدة" : "New school / academy name"} /><label>{isArabic ? "من" : "From"}<input name="startTime" type="time" required defaultValue={trip?.startTime || ""} /></label><label>{isArabic ? "إلى" : "To"}<input name="endTime" type="time" defaultValue={trip?.endTime || ""} /></label>
    <input name="expectedChildren" type="number" min="0" defaultValue={trip?.expectedChildren ?? ""} placeholder={isArabic ? "عدد الأطفال" : "Children"} /><input name="supervisorName" defaultValue={trip?.supervisorName || ""} placeholder={isArabic ? "اسم المشرف" : "Supervisor name"} /><input name="supervisorPhone" type="tel" defaultValue={trip?.supervisorPhone || ""} placeholder={isArabic ? "تليفون المشرف" : "Supervisor phone"} />
    <label className="ops-check-line"><input name="mealIncluded" type="checkbox" defaultChecked={trip?.mealIncluded === true} /> {isArabic ? "الرحلة تشمل وجبة" : "Meal included"}</label>
    <MealCountFields item={trip} meals={catalogues.meals || []} isArabic={isArabic} />
    <input name="staffingRequired" type="number" min="0" defaultValue={trip?.staffingRequired ?? ""} placeholder={isArabic ? "الموظفون المطلوبون" : "Staff required"} /><textarea name="notes" defaultValue={trip?.notes || ""} aria-label={isArabic ? "ملاحظات الرحلة" : "Trip notes"} placeholder={isArabic ? "ملاحظات الرحلة" : "Trip notes"} />
  </FormCard>;
}

function BirthdayForm({ event, daily, catalogues, submit, cancel, isArabic }) {
  return <FormCard title={event ? (isArabic ? "تعديل عيد الميلاد" : "Edit birthday") : (isArabic ? "عيد ميلاد جديد" : "New birthday")} hint={isArabic ? "بيانات العميل والطفل والموعد والوجبات وعدد الضيوف." : "Customer, child, timing, meals and guests."} button={isArabic ? "حفظ عيد الميلاد" : "Save birthday"} onSubmit={(formEvent) => submit(event ? "updateEvent" : "createEvent", formEvent, event ? { eventId: event.id, branch: event.branch || "MOT" } : {}, event ? "PATCH" : "POST")} secondary={event && <button type="button" className="secondary" onClick={cancel}>{isArabic ? "إلغاء التعديل" : "Cancel edit"}</button>}>
    <select name="birthdayCustomerId" aria-label={isArabic ? "عميل مسجل" : "Saved customer"} defaultValue="" onChange={(event) => { const item = daily?.birthdayCustomers?.find((row) => row.id === event.target.value); const form = event.currentTarget.form; if (item && form) { form.elements.customerName.value = item.customerName; form.elements.customerPhone.value = item.phone; form.elements.childName.value = item.childName || ""; } }}><option value="">{isArabic ? "عميل جديد" : "New customer"}</option>{(daily?.birthdayCustomers || []).map((item) => <option key={item.id} value={item.id}>{item.customerName} · {item.phone}{item.childName ? ` · ${item.childName}` : ""}</option>)}</select>
    <input name="name" defaultValue={event?.name || ""} placeholder={isArabic ? "عنوان الحجز (اختياري)" : "Booking title (optional)"} /><input name="customerName" defaultValue={event?.customerName || ""} placeholder={isArabic ? "اسم العميل" : "Customer name"} /><input name="customerPhone" type="tel" defaultValue={event?.customerPhone || ""} placeholder={isArabic ? "رقم التليفون" : "Phone number"} /><input name="childName" defaultValue={event?.childName || ""} placeholder={isArabic ? "اسم الطفل" : "Child name"} />
    <label>{isArabic ? "من" : "From"}<input name="startTime" type="time" required defaultValue={event?.startTime || ""} /></label><label>{isArabic ? "إلى" : "To"}<input name="endTime" type="time" defaultValue={event?.endTime || ""} /></label><input name="expectedGuests" type="number" min="0" defaultValue={event?.expectedGuests ?? ""} placeholder={isArabic ? "عدد الضيوف" : "Guests"} />
    <MealCountFields item={event} meals={catalogues.meals || []} isArabic={isArabic} />
    <input name="partyRoomHours" type="number" min="0" step="0.5" defaultValue={event?.partyRoomHours ?? ""} placeholder={isArabic ? "حجز Party Room بالساعات" : "Party Room hours"} /><select name="location" defaultValue={event?.location || ""}><option value="">{isArabic ? "اختر الغرفة" : "Choose room"}</option>{(catalogues.partyRooms || []).map((item) => { const name = typeof item === "string" ? item : item.name; return <option key={name} value={name}>{name}</option>; })}</select>
    <input name="staffingRequired" type="number" min="0" defaultValue={event?.staffingRequired ?? ""} placeholder={isArabic ? "الموظفون المطلوبون" : "Staff required"} /><textarea name="notes" defaultValue={event?.notes || ""} aria-label={isArabic ? "ملاحظات عيد الميلاد" : "Birthday notes"} placeholder={isArabic ? "ملاحظات" : "Notes"} />
  </FormCard>;
}

function OfferForm({ offer, busy, isArabic, submit, cancel }) {
  const selected = useMemo(() => parseWeekdays(offer?.weekdaysJson), [offer]);
  const action = offer ? "updateOffer" : "createOffer";
  return <FormCard title={offer ? (isArabic ? "تعديل العرض" : "Edit offer") : (isArabic ? "عرض جديد" : "New offer")} hint={isArabic ? "اختر أيام التشغيل. ترك التواريخ والساعات فارغة يعني بدون قيود." : "Choose active weekdays. Dates and times may stay empty."} button={busy ? (isArabic ? "جارٍ الحفظ…" : "Saving…") : (isArabic ? "حفظ العرض" : "Save offer")} onSubmit={(event) => submit(action, event, offer ? { offerId: offer.id, branch: offer.branch || "MOT" } : {}, offer ? "PATCH" : "POST")} secondary={offer && <button type="button" className="secondary" onClick={cancel}>{isArabic ? "إلغاء التعديل" : "Cancel edit"}</button>}>
    {offer?.id && <input type="hidden" name="offerId" value={offer.id} />}<input name="title" required defaultValue={offer?.title || ""} placeholder={isArabic ? "اسم العرض" : "Offer title"} />
    <select name="offerMode" aria-label={isArabic ? "مدة العرض" : "Offer duration"} defaultValue={offer?.permanent === false ? "RANGE" : "PERMANENT"}><option value="PERMANENT">{isArabic ? "عرض دائم" : "Permanent offer"}</option><option value="RANGE">{isArabic ? "فترة اختيارية" : "Optional date range"}</option></select>
    <fieldset className="ops-weekday-picker"><legend>{isArabic ? "أيام تشغيل العرض" : "Active weekdays"}</legend>{WEEKDAYS.map(([day, en, ar]) => <label key={day}><input type="checkbox" name="weekdays" value={day} defaultChecked={selected.includes(day)} /><span>{isArabic ? ar : en}</span></label>)}</fieldset>
    <label>{isArabic ? "السعر قبل العرض" : "Price before"}<input name="priceBefore" type="number" min="0" step="0.01" defaultValue={offer?.priceBefore ?? ""} /></label><label>{isArabic ? "السعر بعد العرض" : "Price after"}<input name="priceAfter" type="number" min="0" step="0.01" defaultValue={offer?.priceAfter ?? ""} /></label><label>{isArabic ? "نسبة الخصم %" : "Discount %"}<input name="discountPercent" type="number" min="0" max="100" step="0.01" defaultValue={offer?.discountPercent ?? ""} placeholder={isArabic ? "تُحسب تلقائيًا عند تركها فارغة" : "Auto-calculated when blank"} /></label><label>{isArabic ? "عدد الأطفال الذين يدخلهم العرض" : "Children admitted by this offer"}<input name="childrenCount" type="number" min="1" step="1" defaultValue={offer?.childrenCount ?? 1} /></label>
    <label>{isArabic ? "من تاريخ (اختياري)" : "From date (optional)"}<input name="effectiveFrom" type="date" defaultValue={displayOfferDate(offer?.effectiveFrom)} /></label><label>{isArabic ? "إلى تاريخ (اختياري)" : "To date (optional)"}<input name="effectiveTo" type="date" defaultValue={displayOfferDate(offer?.effectiveTo)} /></label>
    <label>{isArabic ? "من ساعة (اختياري)" : "From time (optional)"}<input name="startTime" type="time" defaultValue={offer?.startTime || ""} /></label><label>{isArabic ? "إلى ساعة (اختياري)" : "To time (optional)"}<input name="endTime" type="time" defaultValue={offer?.endTime || ""} /></label>
    <textarea name="details" aria-label={isArabic ? "تفاصيل العرض" : "Offer details"} defaultValue={offer?.details || ""} placeholder={isArabic ? "تفاصيل العرض والسعر والشروط (اختياري)" : "Details, price and conditions (optional)"} />
  </FormCard>;
}

function OfferList({ offers, isArabic, busy, edit, remove }) {
  return <section className="panel ops-setup-current"><h2>{isArabic ? "كل العروض المسجلة" : "All saved offers"}</h2>{offers.length ? <div className="ops-offer-manager-list">{offers.map((offer) => <article key={offer.id}><div><b>{offer.title} {offer.discountPercent != null && <em className="ops-discount-badge">-{offer.discountPercent}%</em>}</b><span>{offerSchedule(offer, isArabic)}</span><small>{offer.priceBefore != null ? `${offer.priceBefore} → ` : ""}{offer.priceAfter ?? ""} · {offer.childrenCount || 1} {isArabic ? "طفل" : "children"}{offer.details ? ` · ${offer.details}` : ""}</small></div><div><button type="button" disabled={busy} onClick={() => { edit(offer); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{isArabic ? "تعديل" : "Edit"}</button><button type="button" className="danger" disabled={busy} onClick={() => remove(offer)}>{isArabic ? "حذف" : "Delete"}</button></div></article>)}</div> : <p className="muted">—</p>}</section>;
}

function StockCard({ title, category, unit, color, kind, stock, cancel, submit, isArabic, catalog = {} }) {
  const editing = Boolean(stock);
  return <FormCard title={editing ? `${isArabic ? "تعديل" : "Edit"} ${title}` : title} hint={isArabic ? "أدخل كمية الكاشير وكمية المخزن؛ الإعداد دائم لكل الأيام." : "Enter cashier and warehouse quantities; this applies every day."} button={editing ? (isArabic ? "حفظ التعديل" : "Save changes") : (isArabic ? "حفظ" : "Save")} onSubmit={(event) => submit(editing ? "updateStock" : "setStock", event, editing ? { stockId: stock.id, branch: stock.branch || "MOT" } : {}, editing ? "PATCH" : "POST")} secondary={editing && <button type="button" className="secondary" onClick={cancel}>{isArabic ? "إلغاء التعديل" : "Cancel edit"}</button>}>
    <input type="hidden" name="stockCategory" value={category} /><input type="hidden" name="unit" value={unit} />
    {kind === "socks" && <label>{isArabic ? "المقاس" : "Size"}<select name="size" defaultValue={stock?.size || catalog.socksSizes?.[0] || "M"}>{(catalog.socksSizes || ["M","L"]).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
    {kind === "bracelet" && <><label>{isArabic ? "استخدام البريسلت" : "Bracelet use"}<select name="usageType" defaultValue={stock?.usageType || catalog.braceletUsages?.[0]?.code || "KID"}>{(catalog.braceletUsages || [{code:"KID",label:"Kid"},{code:"TODDLER",label:"Toddler"},{code:"S_N",label:"S.N"},{code:"VISITOR",label:"Visitor"},{code:"TRIP",label:"Trip"},{code:"BIRTHDAY",label:"Birthday"}]).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><label>{isArabic ? "خامة البريسلت" : "Bracelet material"}<select name="material" defaultValue={stock?.material || catalog.braceletMaterials?.[0]?.code || "SATAN"}>{(catalog.braceletMaterials || [{code:"SATAN",label:"Satan"},{code:"PAPER",label:"Paper"},{code:"PLASTIC",label:"Plastic"}]).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label></>}
    {kind === "roll" && <label>{isArabic ? "حالة الرول" : "Roll type"}<select name="rollStyle" defaultValue={stock?.rollStyle || catalog.rollStyles?.[0]?.code || "PRINTED"}>{(catalog.rollStyles || [{code:"PRINTED",label:isArabic?"مطبوع":"Printed"},{code:"PLAIN",label:isArabic?"سادة":"Plain"}]).map((item) => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label>}
    {kind === "socks" && <label>{isArabic ? "لون الشراب" : "Sock color"}<select name="color" defaultValue={stock?.color || catalog.socksColors?.[0]?.value || "#f2c94c"}>{(catalog.socksColors || [{label:"Yellow",value:"#f2c94c"},{label:"Pink",value:"#e77aa8"}]).map((item) => <option key={`${item.label}-${item.value}`} value={item.value}>{item.label}</option>)}</select></label>}
    {kind === "bracelet" && <><label>{isArabic ? "لون البريسلت" : "Bracelet color"}<input name="color" type="color" defaultValue={stock?.color || color} /></label><label>{isArabic ? "اسم اللون" : "Color name"}<input name="colorName" defaultValue={stock?.colorName || ""} placeholder={isArabic ? "مثال: بنفسجي فاتح" : "Example: Light Purple"} /></label></>}
    <label>{isArabic ? "الكمية في الكاشير" : "Cashier quantity"}<input name="cashierQuantity" type="number" min="0" defaultValue={stock?.cashierQuantity ?? 0} /></label><label>{isArabic ? "الكمية في المخزن" : "Warehouse quantity"}<input name="warehouseQuantity" type="number" min="0" defaultValue={stock?.warehouseQuantity ?? 0} /></label>
    <textarea name="notes" defaultValue={stock?.notes || ""} aria-label={`${title} notes`} placeholder={isArabic ? "ملاحظات" : "Notes"} />
  </FormCard>;
}

function StockList({ items, isArabic, busy, edit, issue, remove }) {
  const label = (item) => item.stockCategory === "BRACELET" ? `${item.usageType || item.wristbandType}${item.material ? ` · ${item.material}` : ""}${item.colorName ? ` · ${item.colorName}` : ""}` : item.stockCategory === "SOCKS" ? `${item.size || "—"}${item.color ? ` · ${item.color}` : ""}` : `${item.stockCategory === "CASH_ROLL" ? (isArabic ? "رول كاش" : "Cash roll") : (isArabic ? "رول فيزا" : "Visa roll")} · ${item.rollStyle === "PLAIN" ? (isArabic ? "سادة" : "Plain") : (isArabic ? "مطبوع" : "Printed")}`;
  const quantities = (item) => {
    const cashier = Number(item.cashierQuantity || 0);
    const warehouse = Number(item.warehouseQuantity || 0);
    return cashier + warehouse > 0 || Number(item.availableStock || 0) === 0
      ? { cashier, warehouse }
      : { cashier: 0, warehouse: Math.max(0, Number(item.availableStock || 0)) };
  };
  return <section className="panel ops-setup-current"><h2>{isArabic ? "الستوك الدائم" : "Global stock"}</h2>{items.length ? <div className="ops-stock-list">{items.map((item) => { const quantity = quantities(item); const total = quantity.cashier + quantity.warehouse; const available = Math.max(0, total - Number(item.allocated || 0) - Number(item.issued || 0)); return <article key={item.id}><span className="ops-stock-swatch" style={{ background: item.color || "#e9dfd0" }} /><div><b>{label(item)}</b><small>{item.stockCategory}</small></div><strong>{isArabic ? "الكاشير" : "Cashier"}: {quantity.cashier}</strong><strong>{isArabic ? "المخزن" : "Warehouse"}: {quantity.warehouse}</strong><small className="ops-stock-balance">{isArabic ? "متاح" : "Available"}: {available} · {isArabic ? "محجوز" : "Reserved"}: {Number(item.allocated || 0)} · {isArabic ? "مصروف" : "Issued"}: {Number(item.issued || 0)}</small><div className="ops-stock-actions"><button type="button" disabled={busy} onClick={() => edit(item)}>{isArabic ? "تعديل" : "Edit"}</button><button type="button" disabled={busy || available + Number(item.allocated || 0) <= 0} onClick={() => issue(item)}>{isArabic ? "صرف" : "Issue"}</button><button type="button" className="danger" disabled={busy || Number(item.allocated || 0) > 0 || Number(item.issued || 0) > 0} onClick={() => remove(item)}>{isArabic ? "حذف" : "Delete"}</button></div></article>; })}</div> : <p className="muted">—</p>}</section>;
}

function RosterNameRow({ employee, disabled, save, isArabic }) {
  const [value, setValue] = useState(employee.operationalName || "");
  useEffect(() => setValue(employee.operationalName || ""), [employee.operationalName]);
  return <div><span><b>{employee.name}</b><small>{employee.hrisNumber || employee.localEmployeeCode}</small></span><input aria-label={`${employee.name} roster name`} value={value} onChange={(event) => setValue(event.target.value)} placeholder={isArabic ? "الاسم الثنائي" : "Two-name roster label"} /><button type="button" disabled={disabled || !value.trim()} onClick={() => save(employee.id, value)}>{isArabic ? "حفظ" : "Save"}</button></div>;
}

function Current({ title, items = [], render, edit, remove, isArabic }) {
  return <article><h3>{title}</h3>{items.length ? items.map((item) => <div className="ops-current-item" key={item.id}><p>{render(item)}</p><span><button type="button" onClick={() => edit(item)}>{isArabic ? "تعديل" : "Edit"}</button><button type="button" className="danger" onClick={() => remove(item)}>{isArabic ? "حذف" : "Delete"}</button></span></div>) : <p className="muted">—</p>}</article>;
}
