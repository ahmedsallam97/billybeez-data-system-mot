const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

function normalizeWeekdays(value) {
  let input = value;
  if (typeof input === "string") {
    try { input = JSON.parse(input); } catch { input = input.split(","); }
  }
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
}

function offerAppliesOnDate(offer, date) {
  if (!offer?.active || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) return false;
  if (offer.effectiveFrom && date < offer.effectiveFrom) return false;
  if (offer.effectiveTo && date > offer.effectiveTo) return false;
  const weekdays = normalizeWeekdays(offer.weekdaysJson);
  if (!weekdays.length) return true;
  return weekdays.includes(new Date(`${date}T00:00:00.000Z`).getUTCDay());
}

function stockAvailable(item = {}) {
  const cashier = Math.max(0, Number(item.cashierQuantity || 0));
  const warehouse = Math.max(0, Number(item.warehouseQuantity || 0));
  const splitTotal = cashier + warehouse;
  if (splitTotal > 0 || Number(item.availableStock || 0) === 0) return splitTotal;
  return Math.max(0, Number(item.availableStock || 0) - Number(item.allocated || 0) - Number(item.issued || 0));
}

function stockKey({ stockCategory, usageType, size, rollStyle, color, material }) {
  const clean = (value, fallback = "NA") => String(value || fallback).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || fallback;
  const category = clean(stockCategory, "BRACELET");
  if (category === "BRACELET") return `BRACELET_${clean(usageType)}_${clean(material)}_${clean(color)}`;
  if (category === "SOCKS") return `SOCKS_${clean(size)}_${clean(color)}`;
  return `${category}_${clean(rollStyle, "PLAIN")}`;
}

module.exports = { ALL_WEEKDAYS, normalizeWeekdays, offerAppliesOnDate, stockAvailable, stockKey };
