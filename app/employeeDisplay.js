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

export function employeeGenderClass(name) {
  const normalized = String(name || "").trim().toLocaleLowerCase("en");
  if (!normalized || normalized === "-") return "";

  return femaleNameTokens.some((token) => normalized.includes(token.toLocaleLowerCase("en")))
    ? "employee-name-female"
    : "employee-name-male";
}
