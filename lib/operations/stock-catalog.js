const DEFAULT_BRACELET_TYPES = Object.freeze([
  { code: "KID", label: "Kid", material: "PAPER", color: "#a154e8", colorName: "Light Purple", showInRoster: true, required: true },
  { code: "TODDLER", label: "Toddler", material: "PAPER", color: "#f2a7c3", colorName: "Pink", showInRoster: false, required: false },
  { code: "S_N", label: "S.N", material: "PAPER", color: "#5aa9e6", colorName: "Blue", showInRoster: false, required: false },
  { code: "VISITOR", label: "Visitor", material: "PAPER", color: "#f2c94c", colorName: "Yellow", showInRoster: false, required: false },
  { code: "TRIP", label: "Trip", material: "PAPER", color: "#39a96b", colorName: "Green", showInRoster: false, required: false, system: true },
  { code: "BIRTHDAY", label: "Birthday", material: "PAPER", color: "#e05260", colorName: "Red", showInRoster: false, required: false, system: true },
]);

function normalizeColor(value, fallback = "#cccccc") {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

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
    const fallback = defaults.get(code) || { material: "PAPER", color: "#cccccc", colorName: "", showInRoster: false, required: false };
    const showInRoster = raw.showInRoster == null ? fallback.showInRoster === true : raw.showInRoster === true;
    normalized.push({
      ...fallback,
      ...raw,
      code,
      label: String(raw.label || fallback.label || code).trim() || code,
      material: String(raw.material || fallback.material || "PAPER").trim().toUpperCase(),
      color: normalizeColor(raw.color, fallback.color),
      colorName: String(raw.colorName || fallback.colorName || "").trim(),
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
