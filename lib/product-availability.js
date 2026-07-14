const dayKeyToLong = {
  sun: "sunday",
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
};

function normalizeCategoryName(categoryName) {
  return String(categoryName || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function cairoWeekday(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    weekday: "long",
  }).format(date).toLowerCase();
}

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
  if (!product?.active) return { available: false, opensOn: "Inactive" };

  const rules = parseAvailabilityRules(product.availabilityRules);
  if (!rules) return categoryAvailability(product.categoryName || product.category?.name, cairoWeekday(date));

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

export function findUnavailableProducts(products) {
  return products
    .map((product) => ({ product, availability: productAvailability(product) }))
    .filter(({ availability }) => !availability.available);
}
