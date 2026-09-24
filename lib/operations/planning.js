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
  const committed = Math.max(0, Number(item.allocated || 0)) + Math.max(0, Number(item.issued || 0));
  const splitTotal = cashier + warehouse;
  if (splitTotal > 0 || Number(item.availableStock || 0) === 0) return Math.max(0, splitTotal - committed);
  return Math.max(0, Number(item.availableStock || 0) - committed);
}

function stockIssueUpdate(item = {}, quantity = 0) {
  const requested = Math.max(0, Number(quantity || 0));
  if (!Number.isFinite(requested) || requested <= 0) throw new Error("Issue quantity must be greater than zero");
  const allocated = Math.max(0, Number(item.allocated || 0));
  const issued = Math.max(0, Number(item.issued || 0));
  const fromReservation = Math.min(allocated, requested);
  const unreserved = requested - fromReservation;
  if (stockAvailable(item) < unreserved) throw new Error("Not enough available stock to issue this quantity");
  return {
    allocated: allocated - fromReservation,
    issued: issued + requested,
    fromReservation,
    unreserved,
  };
}

function stockCanDelete(item = {}) {
  return Math.max(0, Number(item.allocated || 0)) === 0 && Math.max(0, Number(item.issued || 0)) === 0;
}

function selectBraceletStock(stockRows = [], usageType, quantity = 0, offset = 0) {
  const required = Math.max(0, Number(quantity || 0));
  const candidates = stockRows
    .filter((item) => item.stockCategory === "BRACELET" && item.usageType === usageType && stockAvailable(item) > 0 && stockAvailable(item) >= required)
    .sort((left, right) => stockAvailable(right) - stockAvailable(left) || String(left.color || "").localeCompare(String(right.color || "")));
  if (!candidates.length) return null;
  return candidates[Math.abs(Number(offset || 0)) % candidates.length];
}

function stockKey({ stockCategory, usageType, size, rollStyle, color, material }) {
  const clean = (value, fallback = "NA") => String(value || fallback).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || fallback;
  const category = clean(stockCategory, "BRACELET");
  if (category === "BRACELET") return `BRACELET_${clean(usageType)}_${clean(material)}_${clean(color)}`;
  if (category === "SOCKS") return `SOCKS_${clean(size)}_${clean(color)}`;
  return `${category}_${clean(rollStyle, "PLAIN")}`;
}

module.exports = { ALL_WEEKDAYS, normalizeWeekdays, offerAppliesOnDate, stockAvailable, stockIssueUpdate, stockCanDelete, selectBraceletStock, stockKey };
