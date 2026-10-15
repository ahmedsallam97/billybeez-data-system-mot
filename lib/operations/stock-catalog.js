const DEFAULT_BRACELET_TYPES = Object.freeze([
  { code: "KID", label: "Kid", showInRoster: true, required: true },
  { code: "TODDLER", label: "Toddler", showInRoster: false, required: false },
  { code: "S_N", label: "S.N", showInRoster: false, required: false },
  { code: "VISITOR", label: "Visitor", showInRoster: false, required: false },
  { code: "TRIP", label: "Trip", showInRoster: false, required: false, system: true },
  { code: "BIRTHDAY", label: "Birthday", showInRoster: false, required: false, system: true },
]);

function normalizeBraceletTypes(value) {
  const source = Array.isArray(value) ? value : [];
  const defaults = new Map(DEFAULT_BRACELET_TYPES.map((item) => [item.code, item]));
  const seen = new Set();
  const normalized = [];
  for (const raw of [...source, ...DEFAULT_BRACELET_TYPES]) {
    if (!raw || typeof raw !== "object") continue;
    const code = String(raw.code || "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const fallback = defaults.get(code) || { showInRoster: false, required: false };
    const showInRoster = raw.showInRoster == null ? fallback.showInRoster === true : raw.showInRoster === true;
    normalized.push({
      code,
      label: String(raw.label || fallback.label || code).trim() || code,
      showInRoster,
      required: showInRoster && (raw.required == null ? fallback.required === true : raw.required === true),
      system: raw.system === true || fallback.system === true,
    });
  }
  return normalized;
}

function normalizePlanningCatalogs(value) {
  const source = value && typeof value === "object" ? value : {};
  const stockCatalog = source.stockCatalog && typeof source.stockCatalog === "object" ? source.stockCatalog : {};
  const { braceletFields: _legacyBraceletFields, ...currentStockCatalog } = stockCatalog;
  return {
    ...source,
    stockCatalog: {
      ...currentStockCatalog,
      braceletUsages: normalizeBraceletTypes(stockCatalog.braceletUsages),
    },
  };
}

module.exports = { DEFAULT_BRACELET_TYPES, normalizeBraceletTypes, normalizePlanningCatalogs };
