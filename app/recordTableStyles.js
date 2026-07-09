export const defaultRecordTableStyles = {
  headerBackgroundColor: "#32124c",
  headerTextColor: "#ffffff",
  tableTextColor: "#32124c",
  borderColor: "#eadfca",
  alternateRowColor: "#fffdf4",
  hoverRowColor: "#f6effc",
  timeColor: "#32124c",
  timeFontSize: 13,
  actorFontSize: 12,
  actorFontWeight: 900,
  totalColor: "#e31937",
  cellPaddingY: 9,
  cellPaddingX: 10,
  minWidth: 1500,
};

export const recordTableStylePresets = {
  classic: defaultRecordTableStyles,
  clean: {
    ...defaultRecordTableStyles,
    headerBackgroundColor: "#004b8d",
    borderColor: "#dce8f4",
    alternateRowColor: "#f8fbff",
    hoverRowColor: "#edf6ff",
    timeColor: "#004b8d",
    totalColor: "#c3002f",
  },
  highContrast: {
    ...defaultRecordTableStyles,
    headerBackgroundColor: "#111827",
    headerTextColor: "#ffffff",
    tableTextColor: "#111827",
    borderColor: "#6b7280",
    alternateRowColor: "#f3f4f6",
    hoverRowColor: "#e5e7eb",
    timeColor: "#000000",
    totalColor: "#b00020",
    timeFontSize: 14,
    actorFontSize: 13,
  },
  printFriendly: {
    ...defaultRecordTableStyles,
    headerBackgroundColor: "#ffffff",
    headerTextColor: "#111111",
    tableTextColor: "#111111",
    borderColor: "#9ca3af",
    alternateRowColor: "#ffffff",
    hoverRowColor: "#ffffff",
    timeColor: "#111111",
    totalColor: "#111111",
    cellPaddingY: 7,
  },
};

export function normalizeRecordTableStyles(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = {};
    }
  }

  return { ...defaultRecordTableStyles, ...(parsed || {}) };
}

export function applyRecordTableStyles(styles) {
  if (typeof document === "undefined") return;
  const normalized = normalizeRecordTableStyles(styles);
  const root = document.documentElement;

  root.style.setProperty("--record-header-bg", normalized.headerBackgroundColor);
  root.style.setProperty("--record-header-text", normalized.headerTextColor);
  root.style.setProperty("--record-table-text", normalized.tableTextColor);
  root.style.setProperty("--record-border", normalized.borderColor);
  root.style.setProperty("--record-row-alt", normalized.alternateRowColor);
  root.style.setProperty("--record-row-hover", normalized.hoverRowColor);
  root.style.setProperty("--record-time-color", normalized.timeColor);
  root.style.setProperty("--record-time-font-size", `${Number(normalized.timeFontSize) || defaultRecordTableStyles.timeFontSize}px`);
  root.style.setProperty("--record-actor-font-size", `${Number(normalized.actorFontSize) || defaultRecordTableStyles.actorFontSize}px`);
  root.style.setProperty("--record-actor-font-weight", String(Number(normalized.actorFontWeight) || defaultRecordTableStyles.actorFontWeight));
  root.style.setProperty("--record-total-color", normalized.totalColor);
  root.style.setProperty("--record-cell-padding-y", `${Number(normalized.cellPaddingY) || defaultRecordTableStyles.cellPaddingY}px`);
  root.style.setProperty("--record-cell-padding-x", `${Number(normalized.cellPaddingX) || defaultRecordTableStyles.cellPaddingX}px`);
  root.style.setProperty("--record-table-min-width", `${Number(normalized.minWidth) || defaultRecordTableStyles.minWidth}px`);
}
