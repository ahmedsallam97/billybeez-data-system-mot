const femaleNameTokens = [
  "مهرا",
  "الاء",
  "آلاء",
  "سلمي",
  "سلمى",
  "شيماء",
  "mahra",
  "alaa nassar",
  "salma",
  "shaimaa",
  "shaima",
];

export const defaultEmployeeNameStyles = {
  male: {
    label: "Male employee names",
    color: "#32124c",
    fontSize: 15,
    fontWeight: 900,
    fontStyle: "normal",
    fontFamily: "",
  },
  female: {
    label: "Female employee names",
    color: "#d61f69",
    fontSize: 15,
    fontWeight: 900,
    fontStyle: "normal",
    fontFamily: "",
  },
};

export function employeeGenderClass(name) {
  const normalized = String(name || "").trim().toLocaleLowerCase("en");
  if (!normalized || normalized === "-") return "";

  return femaleNameTokens.some((token) => normalized.includes(token.toLocaleLowerCase("en")))
    ? "employee-name-female"
    : "employee-name-male";
}

export function normalizeEmployeeNameStyles(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = {};
    }
  }

  return {
    male: { ...defaultEmployeeNameStyles.male, ...(parsed?.male || {}) },
    female: { ...defaultEmployeeNameStyles.female, ...(parsed?.female || {}) },
  };
}

export function applyEmployeeNameStyles(styles) {
  if (typeof document === "undefined") return;
  const normalized = normalizeEmployeeNameStyles(styles);
  const root = document.documentElement;

  Object.entries(normalized).forEach(([key, style]) => {
    root.style.setProperty(`--employee-${key}-color`, style.color || defaultEmployeeNameStyles[key].color);
    root.style.setProperty(`--employee-${key}-font-size`, `${Number(style.fontSize) || defaultEmployeeNameStyles[key].fontSize}px`);
    root.style.setProperty(`--employee-${key}-font-weight`, String(Number(style.fontWeight) || defaultEmployeeNameStyles[key].fontWeight));
    root.style.setProperty(`--employee-${key}-font-style`, style.fontStyle || defaultEmployeeNameStyles[key].fontStyle);
    root.style.setProperty(`--employee-${key}-font-family`, style.fontFamily ? `${style.fontFamily}, inherit` : "inherit");
  });
}
