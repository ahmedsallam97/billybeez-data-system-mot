const DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG = {
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
  visibleSections: { roster: true, leaves: true, notes: true, footer: true, attendance: true, breaks: true, rotation: true },
  cardContent: {
    trips: "No trips added",
    birthdays: "No birthdays added",
    offers: "No offers added",
    bracelets: "Kids: Red\nToddlers: Light blue\nTrip: Green\nS.N: Purple\nVisitor: Brown",
  },
  operationalNotes: "• Follow your assigned rotation.\n• Fill break times when leaving and returning.\n• Contact the shift leader for any changes.",
  roleColors: { female: "#fff0a8", male: "#e7d6f6", cashier: "#b9e2c3", leader: "#c3e9f6", cashierLeader: "#d5b9ec" },
  cardColors: { trips: "#3182bd", birthdays: "#4f8c5c", offers: "#d98a31", bracelets: "#2e7da5" },
  labels: {
    trips: "TODAY'S TRIP(S)", birthdays: "TODAY'S BIRTHDAY(IES)", offers: "TODAY'S OFFERS", bracelets: "BRACELET COLORS",
    employee: "EMPLOYEE", attendance: "ATTENDANCE", break: "BREAK", rotation: "ROTATION (HOURLY)", rotationTime: "ROTATION TIME",
    in: "IN", out: "OUT", from: "FROM", to: "TO", morningShift: "MORNING SHIFT (AM)", betweenShift: "BETWEEN SHIFT (BW)", nightShift: "NIGHT SHIFT (PM)",
    frontCashier: "Front Cashier", cashier: "Cashier", teamLeader: "Team Leader", cashierLeader: "Front Cashier | Team Leader",
    leaves: "TODAY'S LEAVES / OFF", notes: "OPERATIONAL NOTES", noLeaves: "No leave / off in the published schedule", noNotices: "No operational notices recorded", noOffers: "No active offers", noBracelets: "No wristband stock recorded",
    offerAdmits: "Admits", childSingular: "child", childPlural: "children", remaining: "remaining", page: "Page",
  },
  currency: "EGP",
  weekdayLocale: "en-US",
};

const DEFAULT_OPS_MOTIVATION_PHRASES = [
  "Great teams make great days.", "Every smile starts with us.", "Own the moment. Make it count.", "Safe play starts with a focused team.",
  "Small actions create big memories.", "Bring energy, bring care, bring joy.", "One team. One standard. Every day.", "Make every guest feel seen.",
  "Prepared teams create happy kids.", "Lead with kindness and attention.", "Consistency is our superpower.", "Today is another chance to shine.",
  "Be proud of the details.", "Create joy in every interaction.", "Support each other, serve every guest.", "A strong shift starts with teamwork.",
  "Bring your best, then help others do the same.", "Care deeply. Work smart. Have fun.", "Make safety and smiles our signature.", "Together, we make the difference.",
];

const LEGACY_TEMPLATE_TEXT = new Set([
  "PLAY • LEARN • CELEBRATE",
  "SAFE PLAY • HAPPY KIDS • AMAZING TEAMS",
]);

function normalizeDailyOperationsTemplateConfig(value) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const normalized = {
    ...DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG,
    ...input,
    visibleCards: { ...DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG.visibleCards, ...(input.visibleCards || {}) },
    visibleSections: { ...DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG.visibleSections, ...(input.visibleSections || {}) },
    cardContent: { ...DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG.cardContent, ...(input.cardContent || {}) },
    roleColors: { ...DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG.roleColors, ...(input.roleColors || {}) },
    cardColors: { ...DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG.cardColors, ...(input.cardColors || {}) },
    labels: { ...DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG.labels, ...(input.labels || {}) },
    cardOrder: Array.isArray(input.cardOrder) && input.cardOrder.length ? [...input.cardOrder] : [...DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG.cardOrder],
    sectionOrder: Array.isArray(input.sectionOrder) && input.sectionOrder.length ? [...input.sectionOrder] : [...DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG.sectionOrder],
  };
  delete normalized.fillerRows;
  delete normalized.rotationHours;
  if (LEGACY_TEMPLATE_TEXT.has(String(normalized.subtitle || "").trim())) normalized.subtitle = DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG.subtitle;
  if (LEGACY_TEMPLATE_TEXT.has(String(normalized.footerMotto || "").trim())) normalized.footerMotto = DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG.footerMotto;
  return normalized;
}

function normalizeMotivationPhrases(value) {
  const phrases = Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const current = phrases.filter((item) => !LEGACY_TEMPLATE_TEXT.has(item));
  return current.length ? current : [...DEFAULT_OPS_MOTIVATION_PHRASES];
}

module.exports = {
  DEFAULT_DAILY_OPERATIONS_TEMPLATE_CONFIG,
  DEFAULT_OPS_MOTIVATION_PHRASES,
  LEGACY_TEMPLATE_TEXT,
  normalizeDailyOperationsTemplateConfig,
  normalizeMotivationPhrases,
};
