const monthNamesEn = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function dateParts(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US-u-nu-latn", {
    timeZone: "Africa/Cairo",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(date).reduce((current, part) => {
    current[part.type] = part.value;
    return current;
  }, {});

  const monthIndex = Math.max(0, Math.min(11, Number(parts.month) - 1));

  return {
    day: Number(parts.day),
    month: monthNamesEn[monthIndex],
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    period: parts.dayPeriod,
  };
}

export function formatCairoDateLabel(value) {
  const parts = dateParts(value);
  if (!parts) return "-";
  return `${parts.day}-${parts.month}`;
}

export function formatCairoTime(value) {
  const parts = dateParts(value);
  if (!parts) return "-";
  return `\u2066${parts.hour}:${parts.minute}:${parts.second} ${parts.period}\u2069`;
}

export function formatCairoShortTime(value) {
  const parts = dateParts(value);
  if (!parts) return "-";
  const period = String(parts.period || "").toUpperCase() === "AM" ? "ص" : "م";
  return `\u2066${parts.hour}:${parts.minute} ${period}\u2069`;
}

export function formatCairoItemTime(value) {
  const parts = dateParts(value);
  if (!parts) return "";
  return `\u2066${parts.hour}:${parts.minute} ${String(parts.period || "").toUpperCase()}\u2069`;
}

export function formatCairoDateTime(value) {
  const parts = dateParts(value);
  if (!parts) return "-";
  return `\u2066${parts.day}-${parts.month} ${parts.hour}:${parts.minute} ${parts.period}\u2069`;
}
