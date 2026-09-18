"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "../i18n";

function localDate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

async function json(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok || !payload) throw new Error(payload?.error || "Request failed");
  return payload;
}

function FormCard({ title, hint, children, onSubmit, button }) {
  return <form className="ops-setup-card" onSubmit={onSubmit}>
    <header><h3>{title}</h3><p>{hint}</p></header>
    <div className="ops-setup-fields">{children}</div>
    <button type="submit">{button}</button>
  </form>;
}

export default function DailySetupWorkspace({ section = "trips" }) {
  const { isArabic } = useI18n();
  const [date, setDate] = useState(localDate);
  const [daily, setDaily] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [catalogues, setCatalogues] = useState({ meals: [], partyRooms: [], stockItems: [] });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setMessage("");
    try {
      const [day, staff, planningSettings] = await Promise.all([
        fetch(`/api/operations/daily?date=${date}`).then(json),
        fetch("/api/operations/employees?status=ACTIVE").then(json),
        fetch("/api/settings?keys=OPS_PLANNING_CATALOGS").then(json),
      ]);
      setDaily(day);
      setEmployees(staff.employees || []);
      const catalogueRow = planningSettings.settings?.[0];
      if (catalogueRow?.value) setCatalogues(JSON.parse(catalogueRow.value));
    } catch (error) { setMessage(error.message); }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  async function submit(action, event) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const body = { action, date, ...Object.fromEntries(form.entries()) };
    try {
      await fetch("/api/operations/daily", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(json);
      event.currentTarget.reset();
      setMessage(isArabic ? "تم الحفظ" : "Saved");
      await load();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }

  async function saveName(employeeId, operationalName) {
    setBusy(true); setMessage("");
    try {
      await fetch(`/api/operations/employees/${employeeId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ operationalName }) }).then(json);
      setMessage(isArabic ? "تم حفظ الاسم الثنائي" : "Roster name saved");
      await load();
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }

  const headings = {
    trips: ["الرحلات", "Trips", "سجل كل تفاصيل الرحلات ليقرأها الروستر تلقائيًا.", "Record every trip detail for the roster."],
    birthdays: ["أعياد الميلاد", "Birthdays", "بيانات العميل والطفل والميعاد والوجبات.", "Customer, child, timing and meal details."],
    offers: ["العروض", "Offers", "العروض الفعالة حسب التاريخ والساعة.", "Offers active by date and time."],
    stock: ["الستوك", "Stock", "البريسلت والشرابات ورولات الكاش والفيزا.", "Bracelets, socks, cash rolls and Visa rolls."],
    rosterSettings: ["إعدادات الروستر", "Roster settings", "الاسم الثنائي الذي يظهر في الروستر.", "The exact two-name label shown on the roster."],
  };
  const heading = headings[section] || headings.trips;
  return <section className="daily-setup-workspace">
    <header className="panel ops-setup-hero">
      <div><span>BILLY BEEZ · MOT</span><h1>{isArabic ? heading[0] : heading[1]}</h1><p>{isArabic ? heading[2] : heading[3]}</p></div>
      <label>{isArabic ? "تاريخ التشغيل" : "Operating date"}<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
    </header>
    {message && <div className={`alert ${message.includes("تم") || message === "Saved" ? "success" : "danger"}`}>{message}</div>}

    {section === "rosterSettings" && <section className="panel ops-name-settings">
      <header><h2>{isArabic ? "الاسم الثنائي في الروستر" : "Two-name roster display"}</h2><p>{isArabic ? "اكتب الاسم الذي سيظهر في الروستر يدويًا؛ الاسم الكامل في ملف الموظف لا يتغير." : "Enter the exact two-name label shown on the roster. The full employee record stays unchanged."}</p></header>
      <div className="ops-name-list">{employees.map((employee) => <RosterNameRow key={employee.id} employee={employee} disabled={busy} save={saveName} isArabic={isArabic} />)}</div>
    </section>}

    <div className="ops-setup-grid">
      {section === "trips" && <FormCard title={isArabic ? "رحلة جديدة" : "New trip"} hint={isArabic ? "سجل المدرسة والموعد والأعداد والوجبة والبريسلت والعمالة المطلوبة." : "School, timing, headcount, meal, bracelet and staffing."} button={isArabic ? "حفظ الرحلة" : "Save trip"} onSubmit={(event) => submit("createTrip", event)}>
        <select name="tripPartnerId" aria-label={isArabic ? "أكاديمية مسجلة" : "Saved academy"} defaultValue="" onChange={(event) => { const item = daily?.tripPartners?.find((row) => row.id === event.target.value); const form = event.currentTarget.form; if (item && form) { form.elements.name.value = item.name; form.elements.supervisorName.value = item.supervisorName || ""; form.elements.supervisorPhone.value = item.supervisorPhone || ""; } }}><option value="">{isArabic ? "أكاديمية جديدة" : "New academy"}</option>{(daily?.tripPartners || []).map((item) => <option key={item.id} value={item.id}>{item.name}{item.supervisorName ? ` · ${item.supervisorName}` : ""}</option>)}</select>
        <input name="name" placeholder={isArabic ? "اسم المدرسة أو الأكاديمية الجديدة" : "New school / academy name"} />
        <label>{isArabic ? "من" : "From"}<input name="startTime" type="time" required /></label><label>{isArabic ? "إلى" : "To"}<input name="endTime" type="time" /></label>
        <input name="expectedChildren" type="number" min="0" placeholder={isArabic ? "عدد الأطفال" : "Children"} />
        <input name="supervisorName" placeholder={isArabic ? "اسم المشرف" : "Supervisor name"} />
        <input name="supervisorPhone" type="tel" placeholder={isArabic ? "تليفون المشرف" : "Supervisor phone"} />
        <input name="chickenNuggets" type="number" min="0" placeholder={isArabic ? "عدد تشيكن ناجتس" : "Chicken nuggets meals"} />
        <input name="beefBurgers" type="number" min="0" placeholder={isArabic ? "عدد بيف برجر" : "Beef burger meals"} />
        <input name="chickenBurgers" type="number" min="0" placeholder={isArabic ? "عدد تشيكن برجر" : "Chicken burger meals"} />
        <input name="braceletType" placeholder={isArabic ? "نوع البريسلت" : "Bracelet type"} />
        <input name="staffingRequired" type="number" min="0" placeholder={isArabic ? "الموظفون المطلوبون" : "Staff required"} />
        <textarea name="notes" aria-label={isArabic ? "ملاحظات الرحلة" : "Trip notes"} placeholder={isArabic ? "ملاحظات الرحلة" : "Trip notes"} />
      </FormCard>}

      {section === "birthdays" && <FormCard title={isArabic ? "عيد ميلاد جديد" : "New birthday"} hint={isArabic ? "بيانات العميل والطفل والموعد والوجبات وعدد الضيوف." : "Customer, child, timing, meals and guests."} button={isArabic ? "حفظ عيد الميلاد" : "Save birthday"} onSubmit={(event) => submit("createEvent", event)}>
        <select name="birthdayCustomerId" aria-label={isArabic ? "عميل مسجل" : "Saved customer"} defaultValue="" onChange={(event) => { const item = daily?.birthdayCustomers?.find((row) => row.id === event.target.value); const form = event.currentTarget.form; if (item && form) { form.elements.customerName.value = item.customerName; form.elements.customerPhone.value = item.phone; form.elements.childName.value = item.childName || ""; } }}><option value="">{isArabic ? "عميل جديد" : "New customer"}</option>{(daily?.birthdayCustomers || []).map((item) => <option key={item.id} value={item.id}>{item.customerName} · {item.phone}{item.childName ? ` · ${item.childName}` : ""}</option>)}</select>
        <input name="name" placeholder={isArabic ? "عنوان الحجز (اختياري)" : "Booking title (optional)"} />
        <input name="customerName" placeholder={isArabic ? "اسم العميل" : "Customer name"} />
        <input name="customerPhone" type="tel" placeholder={isArabic ? "رقم التليفون" : "Phone number"} />
        <input name="childName" placeholder={isArabic ? "اسم الطفل" : "Child name"} />
        <label>{isArabic ? "من" : "From"}<input name="startTime" type="time" required /></label><label>{isArabic ? "إلى" : "To"}<input name="endTime" type="time" /></label>
        <input name="expectedGuests" type="number" min="0" placeholder={isArabic ? "عدد الضيوف" : "Guests"} />
        <input name="chickenNuggets" type="number" min="0" placeholder={isArabic ? "عدد تشيكن ناجتس" : "Chicken nuggets meals"} />
        <input name="beefBurgers" type="number" min="0" placeholder={isArabic ? "عدد بيف برجر" : "Beef burger meals"} />
        <input name="chickenBurgers" type="number" min="0" placeholder={isArabic ? "عدد تشيكن برجر" : "Chicken burger meals"} />
        <input name="partyRoomHours" type="number" min="0" step="0.5" placeholder={isArabic ? "حجز Party Room بالساعات" : "Party Room hours"} />
        <select name="location" defaultValue=""><option value="">{isArabic ? "اختر الغرفة" : "Choose room"}</option>{(catalogues.partyRooms || []).map((item) => { const name = typeof item === "string" ? item : item.name; return <option key={name} value={name}>{name}</option>; })}</select>
        <input name="staffingRequired" type="number" min="0" placeholder={isArabic ? "الموظفون المطلوبون" : "Staff required"} />
        <input name="eventType" type="hidden" value="BIRTHDAY" />
        <textarea name="notes" aria-label={isArabic ? "ملاحظات عيد الميلاد" : "Birthday notes"} placeholder={isArabic ? "ملاحظات" : "Notes"} />
      </FormCard>}

      {section === "offers" && <FormCard title={isArabic ? "عرض جديد" : "New offer"} hint={isArabic ? "حدد فترة العرض وأيامه وساعات ظهوره في الروستر." : "Set the offer date range and daily hours."} button={isArabic ? "حفظ العرض" : "Save offer"} onSubmit={(event) => submit("createOffer", event)}>
        <input name="title" required placeholder={isArabic ? "اسم العرض" : "Offer title"} />
        <select name="offerMode" aria-label={isArabic ? "مدة العرض" : "Offer duration"} defaultValue="RANGE"><option value="PERMANENT">{isArabic ? "عرض دائم" : "Permanent offer"}</option><option value="RANGE">{isArabic ? "من تاريخ إلى تاريخ" : "Date range"}</option></select>
        <label>{isArabic ? "السعر قبل العرض" : "Price before"}<input name="priceBefore" type="number" min="0" step="0.01" placeholder="400" /></label>
        <label>{isArabic ? "السعر بعد العرض" : "Price after"}<input name="priceAfter" type="number" min="0" step="0.01" placeholder="295" /></label>
        <label>{isArabic ? "من تاريخ" : "From date"}<input name="effectiveFrom" type="date" defaultValue={date} /></label><label>{isArabic ? "إلى تاريخ" : "To date"}<input name="effectiveTo" type="date" defaultValue={date} /></label>
        <label>{isArabic ? "من ساعة" : "From time"}<input name="startTime" type="time" /></label><label>{isArabic ? "إلى ساعة" : "To time"}<input name="endTime" type="time" /></label>
        <textarea name="details" aria-label={isArabic ? "تفاصيل العرض" : "Offer details"} required placeholder={isArabic ? "تفاصيل العرض والسعر والشروط" : "Details, price and conditions"} />
      </FormCard>}

      {section === "stock" && <>
        <StockCard title={isArabic ? "ستوك الشرابات" : "Socks stock"} category="SOCKS" unit="PAIR" color="#f2c94c" options={[["SOCKS_M_YELLOW","M · Yellow"],["SOCKS_M_PINK","M · Pink"],["SOCKS_L_YELLOW","L · Yellow"],["SOCKS_L_PINK","L · Pink"]]} submit={submit} isArabic={isArabic} />
        <StockCard title={isArabic ? "ستوك البريسلت" : "Bracelet stock"} category="BRACELET" unit="ITEM" color="#9b51e0" options={[["BRACELET_SATAN","Satan"],["BRACELET_PAPER","Paper"],["BRACELET_PLASTIC","Plastic"]]} submit={submit} isArabic={isArabic} />
        <StockCard title={isArabic ? "رول الكاش" : "Cash rolls"} category="CASH_ROLL" unit="ROLL" color="#27ae60" options={[["CASH_ROLL","Cash roll"]]} submit={submit} isArabic={isArabic} />
        <StockCard title={isArabic ? "رول الفيزا" : "Visa rolls"} category="VISA_ROLL" unit="ROLL" color="#2d9cdb" options={[["VISA_ROLL","Visa roll"]]} submit={submit} isArabic={isArabic} />
      </>}
    </div>

    {section !== "rosterSettings" && <section className="panel ops-setup-current"><h2>{isArabic ? "المسجل للتاريخ المحدد" : "Saved for selected date"}</h2>
      <div className="ops-current-grid">
        {section === "trips" && <Current title={isArabic ? "الرحلات" : "Trips"} items={daily?.trips} render={(item) => `${item.name} · ${item.startTime || "—"} · ${item.expectedChildren ?? 0}`} />}
        {section === "birthdays" && <Current title={isArabic ? "أعياد الميلاد" : "Birthdays"} items={daily?.events} render={(item) => `${item.childName || item.name} · ${item.customerName || "—"} · ${item.startTime || "—"}`} />}
        {section === "offers" && <Current title={isArabic ? "العروض" : "Offers"} items={daily?.offers} render={(item) => `${item.title}${item.priceBefore != null ? ` · ${item.priceBefore}` : ""}${item.priceAfter != null ? ` → ${item.priceAfter}` : ""} · ${item.startTime || "All day"}`} />}
        {section === "stock" && <Current title={isArabic ? "الستوك" : "Stock"} items={daily?.wristbands} render={(item) => `${item.wristbandType} · ${item.availableStock - item.allocated - item.issued} ${item.unit || "ITEM"}`} />}
      </div>
    </section>}
  </section>;
}

function StockCard({ title, category, unit, color, options, submit, isArabic }) {
  return <FormCard title={title} hint={isArabic ? `وحدة العد: ${unit === "ROLL" ? "بكرة" : unit === "PAIR" ? "زوج" : "قطعة"}` : `Counted by ${unit.toLowerCase()}`} button={isArabic ? "حفظ" : "Save"} onSubmit={(event) => submit("setWristband", event)}>
    <select name="wristbandType" required aria-label={title}>{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    <input type="hidden" name="stockCategory" value={category} />
    <input type="hidden" name="unit" value={unit} />
    <label>{isArabic ? "لون الصنف" : "Item color"}<input name="color" type="color" defaultValue={color} /></label>
    <input name="availableStock" type="number" min="0" required placeholder={isArabic ? "الكمية الموجودة" : "Available quantity"} />
    <input name="allocated" type="number" min="0" defaultValue="0" placeholder={isArabic ? "المحجوز" : "Allocated"} />
    <input name="issued" type="number" min="0" defaultValue="0" placeholder={isArabic ? "المستخدم / المصروف" : "Used / issued"} />
    <textarea name="notes" aria-label={`${title} notes`} placeholder={isArabic ? "ملاحظات" : "Notes"} />
  </FormCard>;
}

function RosterNameRow({ employee, disabled, save, isArabic }) {
  const [value, setValue] = useState(employee.operationalName || "");
  useEffect(() => setValue(employee.operationalName || ""), [employee.operationalName]);
  return <div><span><b>{employee.name}</b><small>{employee.hrisNumber || employee.localEmployeeCode}</small></span><input aria-label={`${employee.name} roster name`} value={value} onChange={(event) => setValue(event.target.value)} placeholder={isArabic ? "الاسم الثنائي" : "Two-name roster label"} /><button disabled={disabled || !value.trim()} onClick={() => save(employee.id, value)}>{isArabic ? "حفظ" : "Save"}</button></div>;
}

function Current({ title, items = [], render }) {
  return <article><h3>{title}</h3>{items.length ? items.map((item) => <p key={item.id}>{render(item)}</p>) : <p className="muted">—</p>}</article>;
}
