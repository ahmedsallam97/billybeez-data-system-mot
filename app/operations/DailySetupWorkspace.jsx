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
      if (section === "birthdays") {
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
    const body = { action, date, ...Object.fromEntries(form.entries()), ...extra };
    if (["createOffer", "updateOffer"].includes(action)) body.weekdays = form.getAll("weekdays").map(Number);
    try {
      await request("/api/operations/daily", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      formElement.reset();
      setEditingOffer(null);
      setEditingTrip(null);
      setEditingEvent(null);
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
      <div><span>BILLY BEEZ · MOT</span><h1>{isArabic ? heading[0] : heading[1]}</h1><p>{isArabic ? heading[2] : heading[3]}</p></div>
      {section !== "stock" && <label>{isArabic ? "تاريخ العرض" : "View date"}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>}
    </header>
    {message && <div className={`alert ${messageKind}`}>{message}</div>}

    {section === "rosterSettings" && <section className="panel ops-name-settings">
      <header><h2>{isArabic ? "الاسم الثنائي في الروستر" : "Two-name roster display"}</h2><p>{isArabic ? "اكتب الاسم الذي سيظهر في الروستر يدويًا؛ الاسم الكامل في ملف الموظف لا يتغير." : "Enter the exact two-name label shown on the roster. The full employee record stays unchanged."}</p></header>
      <div className="ops-name-list">{employees.map((employee) => <RosterNameRow key={employee.id} employee={employee} disabled={busy} save={saveName} isArabic={isArabic} />)}</div>
    </section>}

    <div className="ops-setup-grid">
      {section === "trips" && <TripForm key={editingTrip?.id || "new"} trip={editingTrip} daily={daily} submit={submit} cancel={() => setEditingTrip(null)} isArabic={isArabic} />}
      {section === "birthdays" && <BirthdayForm key={editingEvent?.id || "new"} event={editingEvent} daily={daily} catalogues={catalogues} submit={submit} cancel={() => setEditingEvent(null)} isArabic={isArabic} />}
      {section === "offers" && <OfferForm key={editingOffer?.id || "new"} offer={editingOffer} busy={busy} isArabic={isArabic} submit={submit} cancel={() => setEditingOffer(null)} />}
      {section === "stock" && <>
        <StockCard title={isArabic ? "ستوك الشرابات" : "Socks stock"} category="SOCKS" unit="PAIR" color="#f2c94c" kind="socks" submit={submit} isArabic={isArabic} />
        <StockCard title={isArabic ? "ستوك البريسلت" : "Bracelet stock"} category="BRACELET" unit="ITEM" color="#9b51e0" kind="bracelet" submit={submit} isArabic={isArabic} />
        <StockCard title={isArabic ? "رول الكاش" : "Cash rolls"} category="CASH_ROLL" unit="ROLL" kind="roll" submit={submit} isArabic={isArabic} />
        <StockCard title={isArabic ? "رول الفيزا" : "Visa rolls"} category="VISA_ROLL" unit="ROLL" kind="roll" submit={submit} isArabic={isArabic} />
      </>}
    </div>

    {section === "offers" && <OfferList offers={offerCatalog} isArabic={isArabic} busy={busy} edit={setEditingOffer} remove={deleteOffer} />}
    {section === "stock" && <StockList items={daily?.wristbands || []} isArabic={isArabic} />}
    {!["rosterSettings", "offers", "stock"].includes(section) && <section className="panel ops-setup-current"><h2>{isArabic ? "المسجل للتاريخ المحدد" : "Saved for selected date"}</h2><div className="ops-current-grid">
      {section === "trips" && <Current title={isArabic ? "الرحلات" : "Trips"} items={daily?.trips} render={(item) => `${item.name} · ${item.startTime || "—"} · ${item.expectedChildren ?? 0}${item.braceletColor ? ` · ${item.braceletMaterial || ""} ${item.braceletColor}` : ""}`} edit={setEditingTrip} remove={(item) => removePlanningItem("trip", item)} isArabic={isArabic} />}
      {section === "birthdays" && <Current title={isArabic ? "أعياد الميلاد" : "Birthdays"} items={daily?.events} render={(item) => `${item.childName || item.name} · ${item.customerName || "—"} · ${item.startTime || "—"}${item.braceletColor ? ` · ${item.braceletMaterial || ""} ${item.braceletColor}` : ""}`} edit={setEditingEvent} remove={(item) => removePlanningItem("event", item)} isArabic={isArabic} />}
    </div></section>}
  </section>;
}

function TripForm({ trip, daily, submit, cancel, isArabic }) {
  return <FormCard title={trip ? (isArabic ? "تعديل الرحلة" : "Edit trip") : (isArabic ? "رحلة جديدة" : "New trip")} hint={isArabic ? "سجل المدرسة والموعد والأعداد والوجبة؛ لون البريسلت يختار تلقائيًا من الستوك." : "School, timing, headcount and meals; bracelet stock is assigned automatically."} button={isArabic ? "حفظ الرحلة" : "Save trip"} onSubmit={(event) => submit(trip ? "updateTrip" : "createTrip", event, trip ? { tripId: trip.id, branch: trip.branch || "MOT" } : {}, trip ? "PATCH" : "POST")} secondary={trip && <button type="button" className="secondary" onClick={cancel}>{isArabic ? "إلغاء التعديل" : "Cancel edit"}</button>}>
    <select name="tripPartnerId" aria-label={isArabic ? "أكاديمية مسجلة" : "Saved academy"} defaultValue="" onChange={(event) => { const item = daily?.tripPartners?.find((row) => row.id === event.target.value); const form = event.currentTarget.form; if (item && form) { form.elements.name.value = item.name; form.elements.supervisorName.value = item.supervisorName || ""; form.elements.supervisorPhone.value = item.supervisorPhone || ""; } }}><option value="">{isArabic ? "أكاديمية جديدة" : "New academy"}</option>{(daily?.tripPartners || []).map((item) => <option key={item.id} value={item.id}>{item.name}{item.supervisorName ? ` · ${item.supervisorName}` : ""}</option>)}</select>
    <input name="name" defaultValue={trip?.name || ""} placeholder={isArabic ? "اسم المدرسة أو الأكاديمية الجديدة" : "New school / academy name"} /><label>{isArabic ? "من" : "From"}<input name="startTime" type="time" required defaultValue={trip?.startTime || ""} /></label><label>{isArabic ? "إلى" : "To"}<input name="endTime" type="time" defaultValue={trip?.endTime || ""} /></label>
    <input name="expectedChildren" type="number" min="0" defaultValue={trip?.expectedChildren ?? ""} placeholder={isArabic ? "عدد الأطفال" : "Children"} /><input name="supervisorName" defaultValue={trip?.supervisorName || ""} placeholder={isArabic ? "اسم المشرف" : "Supervisor name"} /><input name="supervisorPhone" type="tel" defaultValue={trip?.supervisorPhone || ""} placeholder={isArabic ? "تليفون المشرف" : "Supervisor phone"} />
    <label className="ops-check-line"><input name="mealIncluded" type="checkbox" defaultChecked={trip?.mealIncluded === true} /> {isArabic ? "الرحلة تشمل وجبة" : "Meal included"}</label>
    <input name="chickenNuggets" type="number" min="0" defaultValue={trip?.chickenNuggets ?? ""} placeholder={isArabic ? "عدد تشيكن ناجتس" : "Chicken nuggets meals"} /><input name="beefBurgers" type="number" min="0" defaultValue={trip?.beefBurgers ?? ""} placeholder={isArabic ? "عدد بيف برجر" : "Beef burger meals"} /><input name="chickenBurgers" type="number" min="0" defaultValue={trip?.chickenBurgers ?? ""} placeholder={isArabic ? "عدد تشيكن برجر" : "Chicken burger meals"} />
    <input name="staffingRequired" type="number" min="0" defaultValue={trip?.staffingRequired ?? ""} placeholder={isArabic ? "الموظفون المطلوبون" : "Staff required"} /><textarea name="notes" defaultValue={trip?.notes || ""} aria-label={isArabic ? "ملاحظات الرحلة" : "Trip notes"} placeholder={isArabic ? "ملاحظات الرحلة" : "Trip notes"} />
  </FormCard>;
}

function BirthdayForm({ event, daily, catalogues, submit, cancel, isArabic }) {
  return <FormCard title={event ? (isArabic ? "تعديل عيد الميلاد" : "Edit birthday") : (isArabic ? "عيد ميلاد جديد" : "New birthday")} hint={isArabic ? "بيانات العميل والطفل والموعد والوجبات وعدد الضيوف." : "Customer, child, timing, meals and guests."} button={isArabic ? "حفظ عيد الميلاد" : "Save birthday"} onSubmit={(formEvent) => submit(event ? "updateEvent" : "createEvent", formEvent, event ? { eventId: event.id, branch: event.branch || "MOT" } : {}, event ? "PATCH" : "POST")} secondary={event && <button type="button" className="secondary" onClick={cancel}>{isArabic ? "إلغاء التعديل" : "Cancel edit"}</button>}>
    <select name="birthdayCustomerId" aria-label={isArabic ? "عميل مسجل" : "Saved customer"} defaultValue="" onChange={(event) => { const item = daily?.birthdayCustomers?.find((row) => row.id === event.target.value); const form = event.currentTarget.form; if (item && form) { form.elements.customerName.value = item.customerName; form.elements.customerPhone.value = item.phone; form.elements.childName.value = item.childName || ""; } }}><option value="">{isArabic ? "عميل جديد" : "New customer"}</option>{(daily?.birthdayCustomers || []).map((item) => <option key={item.id} value={item.id}>{item.customerName} · {item.phone}{item.childName ? ` · ${item.childName}` : ""}</option>)}</select>
    <input name="name" defaultValue={event?.name || ""} placeholder={isArabic ? "عنوان الحجز (اختياري)" : "Booking title (optional)"} /><input name="customerName" defaultValue={event?.customerName || ""} placeholder={isArabic ? "اسم العميل" : "Customer name"} /><input name="customerPhone" type="tel" defaultValue={event?.customerPhone || ""} placeholder={isArabic ? "رقم التليفون" : "Phone number"} /><input name="childName" defaultValue={event?.childName || ""} placeholder={isArabic ? "اسم الطفل" : "Child name"} />
    <label>{isArabic ? "من" : "From"}<input name="startTime" type="time" required defaultValue={event?.startTime || ""} /></label><label>{isArabic ? "إلى" : "To"}<input name="endTime" type="time" defaultValue={event?.endTime || ""} /></label><input name="expectedGuests" type="number" min="0" defaultValue={event?.expectedGuests ?? ""} placeholder={isArabic ? "عدد الضيوف" : "Guests"} />
    <input name="chickenNuggets" type="number" min="0" defaultValue={event?.chickenNuggets ?? ""} placeholder={isArabic ? "عدد تشيكن ناجتس" : "Chicken nuggets meals"} /><input name="beefBurgers" type="number" min="0" defaultValue={event?.beefBurgers ?? ""} placeholder={isArabic ? "عدد بيف برجر" : "Beef burger meals"} /><input name="chickenBurgers" type="number" min="0" defaultValue={event?.chickenBurgers ?? ""} placeholder={isArabic ? "عدد تشيكن برجر" : "Chicken burger meals"} />
    <input name="partyRoomHours" type="number" min="0" step="0.5" defaultValue={event?.partyRoomHours ?? ""} placeholder={isArabic ? "حجز Party Room بالساعات" : "Party Room hours"} /><select name="location" defaultValue={event?.location || ""}><option value="">{isArabic ? "اختر الغرفة" : "Choose room"}</option>{(catalogues.partyRooms || []).map((item) => { const name = typeof item === "string" ? item : item.name; return <option key={name} value={name}>{name}</option>; })}</select>
    <input name="staffingRequired" type="number" min="0" defaultValue={event?.staffingRequired ?? ""} placeholder={isArabic ? "الموظفون المطلوبون" : "Staff required"} /><textarea name="notes" defaultValue={event?.notes || ""} aria-label={isArabic ? "ملاحظات عيد الميلاد" : "Birthday notes"} placeholder={isArabic ? "ملاحظات" : "Notes"} />
  </FormCard>;
}

function OfferForm({ offer, busy, isArabic, submit, cancel }) {
  const selected = useMemo(() => parseWeekdays(offer?.weekdaysJson), [offer]);
  const action = offer ? "updateOffer" : "createOffer";
  return <FormCard title={offer ? (isArabic ? "تعديل العرض" : "Edit offer") : (isArabic ? "عرض جديد" : "New offer")} hint={isArabic ? "اختر أيام التشغيل. ترك التواريخ والساعات فارغة يعني بدون قيود." : "Choose active weekdays. Dates and times may stay empty."} button={busy ? (isArabic ? "جارٍ الحفظ…" : "Saving…") : (isArabic ? "حفظ العرض" : "Save offer")} onSubmit={(event) => submit(action, event, offer ? { offerId: offer.id, branch: offer.branch || "MOT" } : {}, offer ? "PATCH" : "POST")} secondary={offer && <button type="button" className="secondary" onClick={cancel}>{isArabic ? "إلغاء التعديل" : "Cancel edit"}</button>}>
    <input name="title" required defaultValue={offer?.title || ""} placeholder={isArabic ? "اسم العرض" : "Offer title"} />
    <select name="offerMode" aria-label={isArabic ? "مدة العرض" : "Offer duration"} defaultValue={offer?.permanent === false ? "RANGE" : "PERMANENT"}><option value="PERMANENT">{isArabic ? "عرض دائم" : "Permanent offer"}</option><option value="RANGE">{isArabic ? "فترة اختيارية" : "Optional date range"}</option></select>
    <fieldset className="ops-weekday-picker"><legend>{isArabic ? "أيام تشغيل العرض" : "Active weekdays"}</legend>{WEEKDAYS.map(([day, en, ar]) => <label key={day}><input type="checkbox" name="weekdays" value={day} defaultChecked={selected.includes(day)} /><span>{isArabic ? ar : en}</span></label>)}</fieldset>
    <label>{isArabic ? "السعر قبل العرض" : "Price before"}<input name="priceBefore" type="number" min="0" step="0.01" defaultValue={offer?.priceBefore ?? ""} /></label><label>{isArabic ? "السعر بعد العرض" : "Price after"}<input name="priceAfter" type="number" min="0" step="0.01" defaultValue={offer?.priceAfter ?? ""} /></label>
    <label>{isArabic ? "من تاريخ (اختياري)" : "From date (optional)"}<input name="effectiveFrom" type="date" defaultValue={displayOfferDate(offer?.effectiveFrom)} /></label><label>{isArabic ? "إلى تاريخ (اختياري)" : "To date (optional)"}<input name="effectiveTo" type="date" defaultValue={displayOfferDate(offer?.effectiveTo)} /></label>
    <label>{isArabic ? "من ساعة (اختياري)" : "From time (optional)"}<input name="startTime" type="time" defaultValue={offer?.startTime || ""} /></label><label>{isArabic ? "إلى ساعة (اختياري)" : "To time (optional)"}<input name="endTime" type="time" defaultValue={offer?.endTime || ""} /></label>
    <textarea name="details" aria-label={isArabic ? "تفاصيل العرض" : "Offer details"} defaultValue={offer?.details || ""} placeholder={isArabic ? "تفاصيل العرض والسعر والشروط (اختياري)" : "Details, price and conditions (optional)"} />
  </FormCard>;
}

function OfferList({ offers, isArabic, busy, edit, remove }) {
  return <section className="panel ops-setup-current"><h2>{isArabic ? "كل العروض المسجلة" : "All saved offers"}</h2>{offers.length ? <div className="ops-offer-manager-list">{offers.map((offer) => <article key={offer.id}><div><b>{offer.title}</b><span>{offerSchedule(offer, isArabic)}</span><small>{offer.priceBefore != null ? `${offer.priceBefore} → ` : ""}{offer.priceAfter ?? ""}{offer.details ? ` · ${offer.details}` : ""}</small></div><div><button type="button" disabled={busy} onClick={() => { edit(offer); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{isArabic ? "تعديل" : "Edit"}</button><button type="button" className="danger" disabled={busy} onClick={() => remove(offer)}>{isArabic ? "حذف" : "Delete"}</button></div></article>)}</div> : <p className="muted">—</p>}</section>;
}

function StockCard({ title, category, unit, color, kind, submit, isArabic }) {
  return <FormCard title={title} hint={isArabic ? "أدخل كمية الكاشير وكمية المخزن؛ الإعداد دائم لكل الأيام." : "Enter cashier and warehouse quantities; this applies every day."} button={isArabic ? "حفظ" : "Save"} onSubmit={(event) => submit("setStock", event)}>
    <input type="hidden" name="stockCategory" value={category} /><input type="hidden" name="unit" value={unit} />
    {kind === "socks" && <label>{isArabic ? "المقاس" : "Size"}<select name="size" defaultValue="M"><option value="M">M</option><option value="L">L</option></select></label>}
    {kind === "bracelet" && <><label>{isArabic ? "استخدام البريسلت" : "Bracelet use"}<select name="usageType" defaultValue="KID">{[["KID","Kid"],["TODDLER","Toddler"],["S_N","S.N"],["VISITOR","Visitor"],["TRIP","Trip"],["BIRTHDAY","Birthday"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>{isArabic ? "خامة البريسلت" : "Bracelet material"}<select name="material" defaultValue="SATAN"><option value="SATAN">Satan</option><option value="PAPER">Paper</option><option value="PLASTIC">Plastic</option></select></label></>}
    {kind === "roll" && <label>{isArabic ? "حالة الرول" : "Roll type"}<select name="rollStyle" defaultValue="PRINTED"><option value="PRINTED">{isArabic ? "مطبوع" : "Printed"}</option><option value="PLAIN">{isArabic ? "سادة" : "Plain"}</option></select></label>}
    {kind === "socks" && <label>{isArabic ? "لون الشراب" : "Sock color"}<select name="color" defaultValue="#f2c94c"><option value="#f2c94c">Yellow</option><option value="#e77aa8">Pink</option></select></label>}
    {kind === "bracelet" && <label>{isArabic ? "لون البريسلت" : "Bracelet color"}<input name="color" type="color" defaultValue={color} /></label>}
    <label>{isArabic ? "الكمية في الكاشير" : "Cashier quantity"}<input name="cashierQuantity" type="number" min="0" defaultValue="0" /></label><label>{isArabic ? "الكمية في المخزن" : "Warehouse quantity"}<input name="warehouseQuantity" type="number" min="0" defaultValue="0" /></label>
    <textarea name="notes" aria-label={`${title} notes`} placeholder={isArabic ? "ملاحظات" : "Notes"} />
  </FormCard>;
}

function StockList({ items, isArabic }) {
  const label = (item) => item.stockCategory === "BRACELET" ? `${item.usageType || item.wristbandType}${item.material ? ` · ${item.material}` : ""}` : item.stockCategory === "SOCKS" ? `${item.size || "—"}${item.color ? ` · ${item.color}` : ""}` : `${item.stockCategory === "CASH_ROLL" ? (isArabic ? "رول كاش" : "Cash roll") : (isArabic ? "رول فيزا" : "Visa roll")} · ${item.rollStyle === "PLAIN" ? (isArabic ? "سادة" : "Plain") : (isArabic ? "مطبوع" : "Printed")}`;
  const quantities = (item) => {
    const cashier = Number(item.cashierQuantity || 0);
    const warehouse = Number(item.warehouseQuantity || 0);
    return cashier + warehouse > 0 || Number(item.availableStock || 0) === 0
      ? { cashier, warehouse }
      : { cashier: 0, warehouse: Math.max(0, Number(item.availableStock || 0) - Number(item.allocated || 0) - Number(item.issued || 0)) };
  };
  return <section className="panel ops-setup-current"><h2>{isArabic ? "الستوك الدائم" : "Global stock"}</h2>{items.length ? <div className="ops-stock-list">{items.map((item) => { const quantity = quantities(item); return <article key={item.id}><span className="ops-stock-swatch" style={{ background: item.color || "#e9dfd0" }} /><div><b>{label(item)}</b><small>{item.stockCategory}</small></div><strong>{isArabic ? "الكاشير" : "Cashier"}: {quantity.cashier}</strong><strong>{isArabic ? "المخزن" : "Warehouse"}: {quantity.warehouse}</strong></article>; })}</div> : <p className="muted">—</p>}</section>;
}

function RosterNameRow({ employee, disabled, save, isArabic }) {
  const [value, setValue] = useState(employee.operationalName || "");
  useEffect(() => setValue(employee.operationalName || ""), [employee.operationalName]);
  return <div><span><b>{employee.name}</b><small>{employee.hrisNumber || employee.localEmployeeCode}</small></span><input aria-label={`${employee.name} roster name`} value={value} onChange={(event) => setValue(event.target.value)} placeholder={isArabic ? "الاسم الثنائي" : "Two-name roster label"} /><button type="button" disabled={disabled || !value.trim()} onClick={() => save(employee.id, value)}>{isArabic ? "حفظ" : "Save"}</button></div>;
}

function Current({ title, items = [], render, edit, remove, isArabic }) {
  return <article><h3>{title}</h3>{items.length ? items.map((item) => <div className="ops-current-item" key={item.id}><p>{render(item)}</p><span><button type="button" onClick={() => edit(item)}>{isArabic ? "تعديل" : "Edit"}</button><button type="button" className="danger" onClick={() => remove(item)}>{isArabic ? "حذف" : "Delete"}</button></span></div>) : <p className="muted">—</p>}</article>;
}
