const DASHBOARD_SETTING_KEY = "OPS_DASHBOARD_UI_CONFIG";
const SECTIONS = [
  ["header", "Header", "العنوان"], ["pulse", "System Pulse", "نبض العمليات"],
  ["attention", "Action Required", "الإجراءات المطلوبة"], ["charts", "Charts & follow-up", "الرسوم والمتابعة"],
  ["assistant", "Billy Assistant", "مساعد بيلي"], ["performance", "Performance ranking", "ترتيب الأداء"],
];
const CARDS = [
  ["team", "Active Team", "الفريق النشط"], ["attendance", "Attendance Today", "حضور اليوم"],
  ["bookings", "7-Day Reservations", "حجوزات 7 أيام"], ["reviews", "Review Queue", "طابور المراجعة"],
  ["schedule", "Schedule Today", "جدول اليوم"], ["stock", "Inventory Alerts", "تنبيهات المخزون"], ["health", "System Health", "سلامة النظام"],
];
// Only implemented Operations destinations belong here. No user-supplied URLs.
const {PAGES}=require('./page-routes');
const NAVIGATION=['dashboard','employees','schedule','daily','roster','evaluation','performance','eotm','hall','succession','development','trips','birthdays','offers','stock','time','reports','operationalReports','audit','settings'].map(id=>[id,PAGES[id][1],PAGES[id][2],PAGES[id][0]]);
const THEMES = {
  primary: { purple: "#43215f", plum: "#53265d", indigo: "#40316c" },
  secondary: { yellow: "#f8cd36", gold: "#f4c65b" },
  cardAccent: { purple: "#70458f", blue: "#315c87", green: "#24694e" },
  headerAccent: { purple: "#43215f", slate: "#3f465b" },
};
const ordered = catalog => catalog.map(([id]) => ({ id, visible: true }));
function defaultDashboardSettings() {
  return {
    version: 1,
    dashboard: {
      titleAr: "يومك في نظرة واحدة", titleEn: "Your day, at a glance",
      subtitleAr: "فريقك، أولوياتك، وكل ما تحتاجه لتشغيل يومك.", subtitleEn: "Your team, your priorities, and a clear view of the day ahead.",
      showDescriptions: true, showDetailLinks: true, pulseLayout: "overview", columns: 4,
      sections: ordered(SECTIONS), cards: ordered(CARDS),
    },
    appearance: { primary: "purple", secondary: "yellow", cardAccent: "purple", headerAccent: "purple", border: "subtle", density: "comfortable", width: "standard", radius: "soft" },
    attention: { critical: true, warning: true, info: true, maxItems: 6, display: "expanded", sort: "severity" },
    navigation: { items: ordered(NAVIGATION) },
    landing: { destination: "dashboard", view: "configured", date: "today" },
  };
}
function object(value, keys, path) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new Error(`Invalid fields in ${path}`);
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new Error(`Missing ${path}.${key}`);
}
function oneOf(value, options, path) { if (!options.includes(value)) throw new Error(`Invalid ${path}`); }
function boolean(value, path) { if (typeof value !== "boolean") throw new Error(`Invalid ${path}`); }
function orderedList(value, catalog, path) {
  const ids = catalog.map(([id]) => id);
  if (!Array.isArray(value) || value.length !== ids.length) throw new Error(`Invalid ${path} list`);
  const seen = new Set();
  for (const item of value) {
    object(item, ["id", "visible"], path);
    if (!ids.includes(item.id) || seen.has(item.id)) throw new Error(`Unknown or duplicate item in ${path}`);
    seen.add(item.id); boolean(item.visible, `${path}.visible`);
  }
}
function validateDashboardSettings(value) {
  const defaults = defaultDashboardSettings();
  object(value, Object.keys(defaults), "dashboard settings");
  if (value.version !== 1) throw new Error("Unsupported dashboard settings version");
  for (const category of ["dashboard", "appearance", "attention", "navigation", "landing"]) object(value[category], Object.keys(defaults[category]), category);
  const d = value.dashboard;
  for (const field of ["titleAr", "titleEn", "subtitleAr", "subtitleEn"]) {
    if (typeof d[field] !== "string" || d[field].length > (field.startsWith("title") ? 100 : 240) || /[\u0000-\u001f<>]/.test(d[field])) throw new Error(`Invalid dashboard.${field}`);
    if (field.startsWith("title") && !d[field].trim()) throw new Error(`Dashboard ${field} is required`);
  }
  boolean(d.showDescriptions, "dashboard.showDescriptions"); boolean(d.showDetailLinks, "dashboard.showDetailLinks");
  oneOf(d.pulseLayout, ["overview", "grid"], "pulse layout"); oneOf(d.columns, [2, 3, 4], "columns");
  orderedList(d.sections, SECTIONS, "sections"); orderedList(d.cards, CARDS, "cards");
  if (!d.sections.some(item => item.visible)) throw new Error("At least one dashboard section must remain visible");
  if (!d.cards.some(item => item.visible)) throw new Error("At least one System Pulse card must remain visible");
  for (const key of Object.keys(THEMES)) oneOf(value.appearance[key], Object.keys(THEMES[key]), `appearance.${key}`);
  for (const [key, options] of Object.entries({ border: ["subtle", "defined"], density: ["comfortable", "compact"], width: ["standard", "wide"], radius: ["soft", "square"] })) oneOf(value.appearance[key], options, `appearance.${key}`);
  for (const key of ["critical", "warning", "info"]) boolean(value.attention[key], `attention.${key}`);
  if (!Number.isInteger(value.attention.maxItems) || value.attention.maxItems < 1 || value.attention.maxItems > 20) throw new Error("Attention item limit must be 1–20");
  oneOf(value.attention.display, ["expanded", "compact"], "attention.display"); oneOf(value.attention.sort, ["severity", "source"], "attention.sort");
  orderedList(value.navigation.items, NAVIGATION, "navigation.items");
  if (!value.navigation.items.find(item => item.id === "settings").visible) throw new Error("Settings must remain visible for recovery");
  oneOf(value.landing.destination, NAVIGATION.filter(([id]) => !["settings", "audit"].includes(id)).map(([id]) => id), "landing.destination");
  oneOf(value.landing.view, ["configured", "last-used"], "landing.view"); oneOf(value.landing.date, ["today", "last-used"], "landing.date");
  return structuredClone(value);
}
function parseDashboardSettings(value) {
  if (value == null) return defaultDashboardSettings();
  const parsed = typeof value === "string" ? JSON.parse(value) : structuredClone(value);
  // Upgrade the complete former navigation list in memory; reading never writes settings.
  const added = ["eotm", "reports", "development", "operationalReports"];
  if(Array.isArray(parsed?.navigation?.items)){
   const ids=parsed.navigation.items.map(row=>row.id);
   if(ids.every(id=>NAVIGATION.some(row=>row[0]===id))&&NAVIGATION.filter(([id])=>!added.includes(id)).every(([id])=>ids.includes(id)))for(const id of added)if(!ids.includes(id)){const after={eotm:'performance',reports:'time',development:'succession',operationalReports:'reports'}[id];parsed.navigation.items.splice(parsed.navigation.items.findIndex(row=>row.id===after)+1,0,{id,visible:true});}
  }
  return validateDashboardSettings(parsed);
}
function visibleNavigation(config) {
  return config.navigation.items.filter(item => item.visible).map(item => NAVIGATION.find(([id]) => id === item.id));
}
function filterAttention(items, config) {
  const rank = { critical: 0, danger: 0, warning: 1, info: 2 };
  const visible = items.filter(item => config.attention[item.severity === "danger" ? "critical" : item.severity] !== false);
  if (config.attention.sort === "severity") visible.sort((a, b) => (rank[a.severity] ?? 0) - (rank[b.severity] ?? 0));
  // Critical issues cannot be displaced by the item limit, even in source order.
  const limited = visible.slice(0, config.attention.maxItems);
  for (const item of visible) if (["critical", "danger"].includes(item.severity) && !limited.includes(item)) limited.push(item);
  return limited;
}
function resetDashboardCategory(config, category) {
  const defaults = defaultDashboardSettings();
  if (!Object.hasOwn(defaults, category) || category === "version") throw new Error("Unknown dashboard category");
  return { ...structuredClone(config), [category]: defaults[category] };
}
function dashboardCssVariables(config) {
  const a = config.appearance;
  return { "--ops-primary": ({ purple: "var(--theme-featured-bg,#43215f)", plum: "var(--theme-primary-strong,#53265d)", indigo: "var(--theme-primary,#40316c)" })[a.primary], "--ops-secondary": a.secondary === "gold" ? "var(--theme-primary-soft,#f4c65b)" : "var(--theme-sidebar-active-bg,#f8cd36)", "--ops-card-accent": a.cardAccent === "purple" ? "var(--theme-card-icon-fg,#70458f)" : THEMES.cardAccent[a.cardAccent], "--ops-header-accent": a.headerAccent === "purple" ? "var(--theme-accent-text,#43215f)" : THEMES.headerAccent[a.headerAccent], "--ops-radius": a.radius === "soft" ? "18px" : "6px", "--dashboard-line": a.border === "defined" ? "var(--theme-card-accent,#aa9ab7)" : "var(--theme-card-border,#e9e5ee)", "--ops-columns": config.dashboard.columns };
}
function landingPath(config) {
  if (config.landing.view === "last-used" || (config.landing.destination !== "dashboard" && config.landing.date === "last-used")) return "/operations?uiEntry=1";
  return NAVIGATION.find(([id]) => id === config.landing.destination)?.[3] || "/opmanager";
}
function resolveEntry(config, remembered, today) {
  const destination = config.landing.view === "last-used" && NAVIGATION.some(([id]) => id === remembered?.id && !["dashboard", "settings", "audit"].includes(id)) ? remembered.id : config.landing.destination;
  const path = NAVIGATION.find(([id]) => id === destination)?.[3] || "/opmanager";
  if (!path.startsWith("/operations/")) return path;
  const url = new URL(path, "http://local");
  if (["roster", "daily", "evaluation", "trips", "birthdays", "offers", "stock"].includes(destination)) {
    const lastDate = remembered?.date;
    const valid = typeof lastDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(lastDate) && !Number.isNaN(Date.parse(lastDate)) && new Date(lastDate).toISOString().slice(0, 10) === lastDate;
    url.searchParams.set("date", config.landing.date === "last-used" && valid ? lastDate : today);
  }
  return url.pathname + url.search + url.hash;
}
module.exports = { DASHBOARD_SETTING_KEY, SECTIONS, CARDS, NAVIGATION, THEMES, defaultDashboardSettings, validateDashboardSettings, parseDashboardSettings, visibleNavigation, filterAttention, resetDashboardCategory, dashboardCssVariables, landingPath, resolveEntry };
