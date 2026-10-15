"use client";
import ActionButton from "@/app/ActionButton";
import {PermissionButton} from '@/app/account/PermissionControls';

import { useEffect, useState } from "react";
import Link from "next/link";
import { OperationalError } from "../../ui/OperationalFeedback";
import { useRouter } from "next/navigation";
import { useI18n } from "../../i18n";
import { useOperationsUi } from "../../operations/OperationsUiContext";
import OperationsSettingsClient from "../../settings/OperationsSettingsClient";
import { readApiResponse } from "@/lib/client/read-api-response";
import { DASHBOARD_SETTING_KEY, SECTIONS, CARDS, NAVIGATION, THEMES, defaultDashboardSettings, validateDashboardSettings, resetDashboardCategory } from "@/lib/operations/dashboard-settings";
import styles from "./DashboardSettings.module.css";
import ThemeScope from "../../settings/ThemeScope";
import PerformanceSettingsWorkspace from "../../settings/PerformanceSettingsWorkspace";
import AccessManagement from '../../account/AccessManagement';
import { usePermission } from '../../account/AccountContext';
import {useSettingsPreferences} from './SettingsFrame';
import SettingsTopNavigation from './SettingsTopNavigation';
import {SETTINGS_PAGES as categories,UI_CATEGORIES as uiCategories,PERFORMANCE_SECTIONS,TEMPLATE_SECTIONS} from '@/lib/operations/settings-routes';
import {PageHeader} from '../../ui/DesktopLayout';

function Check({ label, checked, onChange, disabled }) { return <label className={styles.check}><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><span>{label}</span></label>; }
function ChoiceField({ label, value, onChange, options }) { return <label className={styles.field}><span>{label}</span><select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>; }
function OrderedItems({ title, items, catalog, onChange, isArabic, pinned }) {
  const move = (index, delta) => { const result = [...items]; [result[index], result[index + delta]] = [result[index + delta], result[index]]; onChange(result); };
  return <fieldset className={styles.orderGroup}><legend>{title}</legend><ol className={styles.orderList}>{items.map((item, index) => {
    const name = catalog.find(([id]) => id === item.id)?.[isArabic ? 2 : 1];
    return <li key={item.id} data-setting-item={item.id}><span className={styles.ordinal}>{String(index + 1).padStart(2, "0")}</span><Check label={name} checked={item.visible} disabled={item.id === pinned} onChange={visible => onChange(items.map(row => row.id === item.id ? { ...row, visible } : row))} /><div className={styles.moveButtons}><ActionButton type="button" className="secondary" disabled={index === 0} aria-label={`${isArabic ? "تحريك لأعلى" : "Move up"}: ${name}`} onClick={() => move(index, -1)}>↑</ActionButton><ActionButton type="button" className="secondary" disabled={index === items.length - 1} aria-label={`${isArabic ? "تحريك لأسفل" : "Move down"}: ${name}`} onClick={() => move(index, 1)}>↓</ActionButton></div></li>;
  })}</ol></fieldset>;
}

export default function DashboardSettingsClient({category,section}) {
  const router = useRouter();
  const {isArabic}=useI18n();
  const {updateConfig}=useOperationsUi();
  const text=(ar,en)=>isArabic?ar:en;
  const {saved,setSaved,draft,setDraft,busy,setBusy,notice,setNotice,error,setError,dirty}=useSettingsPreferences();
  const change = (group, key, value) => { setDraft(current => ({ ...current, [group]: { ...current[group], [key]: value } })); setNotice(""); setError(""); };
  function resetCategory() {
    setDraft(current => {
      const reset = resetDashboardCategory(current, category);
      return category === "navigation" ? resetDashboardCategory(reset, "landing") : reset;
    });
    setNotice(text("تمت استعادة إعدادات القسم في المسودة. اضغط حفظ للتطبيق.", "Category defaults restored in your draft. Save to apply.")); setError("");
  }
  function resetAll() {
    if (!window.confirm(text("استعادة جميع إعدادات واجهة العمليات الافتراضية؟ لن تتغير بيانات التشغيل أو قواعده. يلزم الحفظ للتطبيق.", "Reset all Operations UI preferences to defaults? Operations records and business rules stay unchanged. Save to apply."))) return;
    setDraft(defaultDashboardSettings()); setError(""); setNotice(text("تمت استعادة القيم الافتراضية في المسودة. اضغط حفظ للتطبيق.", "All UI defaults restored in your draft. Save to apply."));
  }
  async function save() {
    setBusy(true); setError(""); setNotice("");
    try {
      const valid = validateDashboardSettings(draft);
      await fetch("/api/operations/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: DASHBOARD_SETTING_KEY, value: JSON.stringify(valid) }) }).then(response => readApiResponse(response));
      setSaved(valid); setDraft(valid); updateConfig(valid); router.refresh(); setNotice(text("تم حفظ إعدادات الواجهة وتطبيقها.", "UI settings saved and applied."));
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  const current = categories.find(([id]) => id === category);
  const isUi = uiCategories.includes(category);
  const labels = { purple: ["بنفسجي بيلي", "Billy purple"], plum: ["برقوقي", "Plum"], indigo: ["نيلي", "Indigo"], yellow: ["أصفر بيلي", "Billy yellow"], gold: ["ذهبي", "Gold"], blue: ["أزرق", "Blue"], green: ["أخضر", "Green"], slate: ["رمادي داكن", "Slate"], subtle: ["خفيفة", "Subtle"], defined: ["واضحة", "Defined"], comfortable: ["مريحة", "Comfortable"], compact: ["مدمجة", "Compact"], standard: ["عرض كامل · هوامش مريحة", "Full width · comfortable gutters"], wide: ["عرض كامل · هوامش ضيقة", "Full width · narrow gutters"], soft: ["ناعمة", "Soft"], square: ["قليلة الانحناء", "Slightly rounded"] };
  const options = keys => keys.map(key => [key, labels[key][isArabic ? 0 : 1]]);
  return <div className={styles.settings}>
    <PageHeader title={section?(category==='performance-settings'?PERFORMANCE_SECTIONS:TEMPLATE_SECTIONS).find(row=>row[0]===section)?.[isArabic?2:1]:current[isArabic?2:1]} description={section?(category==='performance-settings'?PERFORMANCE_SECTIONS:TEMPLATE_SECTIONS).find(row=>row[0]===section)?.[isArabic?4:3]:current[isArabic?4:3]} actions={<><Link className="button-link secondary" href="/opmanager">{text("عرض لوحة العمليات","View dashboard")}</Link>{isUi&&<><ActionButton type="button" className="secondary" disabled={busy} onClick={resetCategory}>{text("استعادة القسم","Reset category")}</ActionButton><PermissionButton permission="appearance.configure" type="button" disabled={busy||!dirty} onClick={save}>{busy?text("جارٍ الحفظ…","Saving…"):text("حفظ إعدادات الواجهة","Save UI settings")}</PermissionButton></>}</>}/>
    <SettingsTopNavigation/>
    <div className={`${styles.layout} ${isUi ? styles.liveLayout : ""}`}>

      <section className={styles.content} data-ui-editor={isUi}>
        <OperationalError error={error}/>{notice && <div className="alert success" role="status">{notice}</div>}
        {category === "dashboard" && <>
          <div className={styles.fields}>{[["titleEn", "Dashboard title (English)", "عنوان اللوحة (الإنجليزية)"], ["titleAr", "Dashboard title (Arabic)", "عنوان اللوحة (العربية)"], ["subtitleEn", "Subtitle (English)", "الوصف (الإنجليزية)"], ["subtitleAr", "Subtitle (Arabic)", "الوصف (العربية)"]].map(([key, en, ar]) => <label className={styles.field} key={key}><span>{text(ar, en)}</span><input dir={key.endsWith("Ar") ? "rtl" : "ltr"} maxLength={key.startsWith("title") ? 100 : 240} value={draft.dashboard[key]} onChange={event => change("dashboard", key, event.target.value)} /></label>)}</div>
          <div className={styles.toggles}><Check label={text("إظهار الأوصاف الثانوية", "Show secondary descriptions")} checked={draft.dashboard.showDescriptions} onChange={value => change("dashboard", "showDescriptions", value)} /><Check label={text("إظهار روابط التفاصيل", "Show detail links")} checked={draft.dashboard.showDetailLinks} onChange={value => change("dashboard", "showDetailLinks", value)} /></div>
          <OrderedItems title={text("أقسام لوحة العمليات", "Dashboard sections")} items={draft.dashboard.sections} catalog={SECTIONS} onChange={value => change("dashboard", "sections", value)} isArabic={isArabic} />
          <div className={styles.fields}><ChoiceField label={text("تخطيط نبض العمليات", "System Pulse layout")} value={draft.dashboard.pulseLayout} options={[["overview", text("بطاقات كبيرة وحالات مختصرة", "Large cards & shorter status cards")], ["grid", text("شبكة متساوية", "Uniform grid")]]} onChange={value => change("dashboard", "pulseLayout", value)} /><ChoiceField label={text("أعمدة البطاقات على الكمبيوتر", "Desktop card columns")} value={draft.dashboard.columns} options={[2, 3, 4].map(n => [n, n])} onChange={value => change("dashboard", "columns", Number(value))} /></div>
          <OrderedItems title={text("بطاقات نبض العمليات", "System Pulse cards")} items={draft.dashboard.cards} catalog={CARDS} onChange={value => change("dashboard", "cards", value)} isArabic={isArabic} />
        </>}
        {category === "navigation" && <>
          <p className={styles.help}>{text("إخفاء عنصر يغير القائمة فقط. صلاحيات الوصول تظل كما هي. الإعدادات متاحة دائمًا لاستعادة التفضيلات.", "Visibility changes menus only; route permissions still apply. Settings stays available for recovery.")}</p>
          <OrderedItems title={text("قائمة العمليات", "Operations menu")} items={draft.navigation.items} catalog={NAVIGATION} pinned="settings" onChange={value => change("navigation", "items", value)} isArabic={isArabic} />
          <div className={styles.fields}><ChoiceField label={text("صفحة البداية", "Default landing page")} value={draft.landing.destination} options={NAVIGATION.filter(([id]) => !["settings", "audit"].includes(id)).map(([id, en, ar]) => [id, text(ar, en)])} onChange={value => change("landing", "destination", value)} /><ChoiceField label={text("عرض البداية", "Starting view")} value={draft.landing.view} options={[["configured", text("الصفحة المحددة", "Configured page")], ["last-used", text("آخر وحدة مستخدمة", "Last-used module")]]} onChange={value => change("landing", "view", value)} /><ChoiceField label={text("التاريخ الافتراضي", "Default date")} value={draft.landing.date} options={[["today", text("اليوم", "Today")], ["last-used", text("آخر تاريخ مستخدم", "Last-used date")]]} onChange={value => change("landing", "date", value)} /></div>
          <p className={styles.help}>{text("تطبق البداية عند الدخول. آخر استخدام محفوظ لكل مستخدم في هذا المتصفح؛ الروابط المباشرة تظل متاحة.", "Landing applies on sign-in. Last-used module and date are remembered per user in this browser. Direct links remain available.")}</p>
        </>}
        {category === "appearance" && <><ThemeScope/><p className={styles.help}>{text("ألوان معتمدة تحافظ على هوية بيلي بيز ووضوح النص. تطبق على لوحة العمليات.", "Approved colors preserve Billy Beez branding and readable text. These apply to the dashboard.")}</p><div className={styles.fields}>{[["primary", "Primary accent", "اللون الأساسي"], ["secondary", "Secondary accent", "اللون الثانوي"], ["cardAccent", "Card accent", "لون البطاقات"], ["headerAccent", "Heading accent", "لون العناوين"]].map(([key, en, ar]) => <div key={key} className={styles.swatchField}><ChoiceField label={text(ar, en)} value={draft.appearance[key]} options={options(Object.keys(THEMES[key]))} onChange={value => change("appearance", key, value)} /><span className={styles.swatch} style={{ background: THEMES[key][draft.appearance[key]] }} /></div>)}{[["border", "Border strength", "وضوح الحدود", ["subtle", "defined"]], ["density", "Density", "الكثافة", ["comfortable", "compact"]], ["width", "Content width", "عرض المحتوى", ["standard", "wide"]], ["radius", "Corner radius", "زوايا البطاقات", ["soft", "square"]]].map(([key, en, ar, values]) => <ChoiceField key={key} label={text(ar, en)} value={draft.appearance[key]} options={options(values)} onChange={value => change("appearance", key, value)} />)}</div></>}
        {category === "attention" && <>
          <p className={styles.help}>{text("ظهور لوحة التنبيهات وترتيبها من قسم لوحة العمليات. عدد العناصر لا يخفي أي تنبيه حرج مسموح بعرضه.", "Panel visibility and order are in Dashboard. The item limit never truncates enabled critical alerts.")}</p>
          <div className={styles.toggles}>{[["critical", "Show Critical", "إظهار الحرج"], ["warning", "Show Warning", "إظهار التحذيرات"], ["info", "Show Info", "إظهار المعلومات"]].map(([key, en, ar]) => <Check key={key} label={text(ar, en)} checked={draft.attention[key]} onChange={value => change("attention", key, value)} />)}</div>
          <div className={styles.fields}><label className={styles.field}><span>{text("الحد الأقصى للعناصر", "Maximum visible items")}</span><input type="number" min="1" max="20" value={draft.attention.maxItems} onChange={event => change("attention", "maxItems", Number(event.target.value))} /></label><ChoiceField label={text("عرض التنبيهات", "Alert display")} value={draft.attention.display} options={[["expanded", text("موسع", "Expanded")], ["compact", text("مدمج", "Compact")]]} onChange={value => change("attention", "display", value)} /><ChoiceField label={text("ترتيب التنبيهات", "Alert sorting")} value={draft.attention.sort} options={[["severity", text("الخطورة أولاً", "Severity first")], ["source", text("ترتيب المصدر", "Source order")]]} onChange={value => change("attention", "sort", value)} /></div>
        </>}
        {isUi && (!draft.attention.critical || !draft.dashboard.sections.find(item => item.id === "attention").visible) && <p className="alert warning" role="status">{text("تنبيه: هذه المسودة تخفي التنبيهات الحرجة أو لوحة الإجراءات. قد تفوتك متابعة ضرورية.", "This draft hides critical alerts or the Action Required panel. Important follow-up may be missed.")}</p>}
        {['access','roles','account-activity'].includes(category) ? <AccessManagement initialTab={category==='roles'?'roles':category==='account-activity'?'activity':'users'} embedded/> : category === "performance-settings" ? <PerformanceSettingsWorkspace isArabic={isArabic} section={section||'reports'} embedded/> : !isUi && <OperationsSettingsClient key={category+':'+(section||'')} embeddedTab={category} templateSection={section}/>}
        {!isUi && dirty && <p className="alert warning">{text("لديك تغييرات واجهة غير محفوظة. عد إلى أحد أقسام الواجهة لحفظها.", "You have unsaved UI changes. Return to a UI category to save them.")}</p>}
      </section>

    </div>

    {isUi&&<details className={styles.resetFooter}><summary>{text("خيارات متقدمة","Advanced options")}</summary><p>{text("استعادة الواجهة لا تغير بيانات العمل. احفظ المسودة لتطبيقها.","Resetting UI preferences preserves business data. Save the draft to apply it.")}</p><ActionButton type="button" className="secondary" disabled={busy} onClick={resetAll}>{text("استعادة كل إعدادات الواجهة","Reset all UI preferences")}</ActionButton></details>}
  </div>;
}

