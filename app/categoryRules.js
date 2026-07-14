const categoryPriority = [
  "tickets",
  "ticket",
  "extra",
  "extra items",
  "bb offers",
  "bb offer",
  "thursday offer",
  "superfriday",
  "super friday",
  "waffarha",
  "bogo",
  "kidzapp",
  "exclusives",
  "exclusive",
  "s-card",
  "s card",
  "valu",
  "value",
  "special needs",
  "trips",
  "trip",
  "birthdays",
  "birthday",
  "test",
];

function normalizeCategoryName(categoryName) {
  return String(categoryName || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function categoryRank(categoryName) {
  const normalized = normalizeCategoryName(categoryName);
  const exactIndex = categoryPriority.indexOf(normalized);
  if (exactIndex >= 0) return exactIndex;

  const fuzzyIndex = categoryPriority.findIndex((item) => normalized.includes(item));
  return fuzzyIndex >= 0 ? fuzzyIndex : 500;
}

function cairoWeekday() {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    weekday: "long",
  }).format(new Date()).toLowerCase();
}

const dayKeyToLong = {
  sun: "sunday",
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
};

function cairoNowParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date).map((part) => [part.type, part.value]));
  const hour = Number(parts.hour) === 24 ? 0 : Number(parts.hour) || 0;
  return {
    weekday: String(parts.weekday || "").slice(0, 3).toLowerCase(),
    minutes: hour * 60 + (Number(parts.minute) || 0),
  };
}

function timeToMinutes(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function parseAvailabilityRules(value) {
  if (!value) return null;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function ruleLabel(rules) {
  const days = Array.isArray(rules?.days) ? rules.days.map((day) => dayKeyToLong[day] || day).join(", ") : "";
  const time = rules?.startTime && rules?.endTime ? `${rules.startTime} - ${rules.endTime}` : "";
  return [days, time].filter(Boolean).join(" / ");
}

export function orderProductCategories(categories) {
  const unique = [...new Set(categories.filter(Boolean))];
  return unique.sort((a, b) => {
    const rankDiff = categoryRank(a) - categoryRank(b);
    if (rankDiff !== 0) return rankDiff;
    return String(a).localeCompare(String(b), "en", { sensitivity: "base" });
  });
}

export function categoryAvailability(categoryName, weekday = cairoWeekday()) {
  const normalized = normalizeCategoryName(categoryName);

  if (normalized.includes("thursday offer")) {
    return { available: weekday === "thursday", opensOn: "Thursday" };
  }

  if (normalized.includes("superfriday") || normalized.includes("super friday")) {
    return { available: weekday === "friday", opensOn: "Friday" };
  }

  return { available: true, opensOn: "" };
}

export function productAvailability(product, date = new Date()) {
  const rules = parseAvailabilityRules(product?.availabilityRules)
    || parseAvailabilityRules(product?.categoryAvailabilityRules)
    || parseAvailabilityRules(product?.category?.availabilityRules);
  if (!rules) return categoryAvailability(product?.categoryName);

  const { weekday, minutes } = cairoNowParts(date);
  const days = Array.isArray(rules.days) ? rules.days.map((day) => String(day).toLowerCase()) : [];
  const start = timeToMinutes(rules.startTime);
  const end = timeToMinutes(rules.endTime);
  const label = ruleLabel(rules);

  if (days.length && !days.includes(weekday)) {
    return { available: false, opensOn: label || "Scheduled" };
  }

  if (start !== null && end !== null) {
    const inWindow = start <= end ? minutes >= start && minutes <= end : minutes >= start || minutes <= end;
    if (!inWindow) return { available: false, opensOn: label || "Scheduled" };
  }

  return { available: true, opensOn: "" };
}

export function categoryToneClass(categoryName) {
  const normalized = normalizeCategoryName(categoryName);

  if (normalized === "all") return "category-all";
  if (["tickets", "ticket", "extra", "extra items", "bb offers", "bb offer"].some((item) => normalized.includes(item))) {
    return "category-ticket-offer";
  }
  if (normalized.includes("thursday offer") || normalized.includes("superfriday") || normalized.includes("super friday")) {
    return "category-day-offer";
  }
  if (["waffarha", "bogo", "kidzapp", "exclusives", "exclusive", "s-card", "s card", "valu", "value"].some((item) => normalized.includes(item))) {
    return "category-partner";
  }
  if (normalized.includes("special needs")) return "category-special-needs";
  if (normalized.includes("trips") || normalized.includes("trip")) return "category-trips";
  if (normalized.includes("birthdays") || normalized.includes("birthday")) return "category-birthdays";
  if (normalized.includes("test")) return "category-test";
  if (["drink", "juice", "water", "pepsi", "coffee", "latte", "cappuccino", "hot", "cold"].some((word) => normalized.includes(word))) {
    return "category-drink";
  }

  return "category-food";
}

export function productCardVisual(product, fallbackText = "?") {
  const hasColors = product?.cardColorStart || product?.cardColorEnd || product?.cardTextColor;
  return {
    text: product?.iconText || fallbackText,
    style: hasColors ? {
      "--product-card-start": product.cardColorStart || "#3d1859",
      "--product-card-end": product.cardColorEnd || product.cardColorStart || "#8a62b2",
      "--product-card-text": product.cardTextColor || "#ffffff",
      "--product-card-accent": product.cardAccentColor || "#e31937",
    } : undefined,
    className: hasColors ? "product-custom-visual" : categoryToneClass(product?.categoryName),
  };
}
