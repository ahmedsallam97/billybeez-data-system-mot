const { prisma } = require("./db");

const DEFAULT_UI_MESSAGE_CONFIG = {
  kitchenTicketQueued: {
    label: "Kitchen ticket queue message",
    text: "تيكت المطبخ موجود بالفعل في صف الطباعة",
    backgroundColor: "#005eb8",
    textColor: "#ffffff",
    borderColor: "#e31937",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  printJobPending: {
    label: "Preparation status message",
    text: "جاري تجهيز الأوردر",
    backgroundColor: "#e8f1ff",
    textColor: "#005eb8",
    borderColor: "#9dc3ef",
    fontSize: 12,
    fontWeight: 900,
    minHeight: 34,
    radius: 8,
  },
  geideaRegistered: {
    label: "Geidea registered alert",
    text: "تم التسجيل على جيديا بواسطة\n{employee} · {time}",
    backgroundColor: "#e8f8ff",
    textColor: "#005eb8",
    borderColor: "#b8d7f7",
    fontSize: 12,
    fontWeight: 900,
    minHeight: 41,
    radius: 8,
  },
  paymentSaved: {
    label: "Payment saved toast",
    text: "تم حفظ الدفع كـ {method}",
    backgroundColor: "#32124c",
    textColor: "#ffffff",
    borderColor: "#e31937",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  leftUnpaid: {
    label: "Customer left unpaid alert",
    text: "العميل خرج من غير ما يحاسب",
    backgroundColor: "#fde5eb",
    textColor: "#8f061f",
    borderColor: "#f3a2b2",
    fontSize: 14,
    fontWeight: 900,
    minHeight: 41,
    radius: 8,
  },
  leftNeedsGeidea: {
    label: "Customer left without Geidea alert",
    text: "العميل خرج ولسه متسجلش على جيديا",
    backgroundColor: "#ffe2c2",
    textColor: "#8f3400",
    borderColor: "#e66b00",
    fontSize: 14,
    fontWeight: 900,
    minHeight: 41,
    radius: 8,
  },
  exitEmployee: {
    label: "Exit employee alert",
    text: "موظف تسجيل الخروج\n{employee}",
    backgroundColor: "#fff3e8",
    textColor: "#c55100",
    borderColor: "#ffd2ad",
    fontSize: 13,
    fontWeight: 900,
    minHeight: 41,
    radius: 8,
  },
  archivedAt: {
    label: "Archived alert",
    text: "وقت الأرشفة: {time}",
    backgroundColor: "#eef6ff",
    textColor: "#005eb8",
    borderColor: "#b8d7f7",
    fontSize: 12,
    fontWeight: 900,
    minHeight: 32,
    radius: 8,
  },
  closedAt: {
    label: "Closed alert",
    text: "مغلق: {time}",
    backgroundColor: "#eef6ff",
    textColor: "#005eb8",
    borderColor: "#b8d7f7",
    fontSize: 12,
    fontWeight: 900,
    minHeight: 32,
    radius: 8,
  },
  printJobPrinted: {
    label: "Kitchen ticket printed alert",
    text: "تم طباعة تيكت المطبخ",
    backgroundColor: "#e8f8e5",
    textColor: "#197b1f",
    borderColor: "#a4d99d",
    fontSize: 12,
    fontWeight: 900,
    minHeight: 34,
    radius: 8,
  },
  printJobFailed: {
    label: "Kitchen ticket failed alert",
    text: "فشل طباعة تيكت المطبخ",
    backgroundColor: "#fde5eb",
    textColor: "#8f061f",
    borderColor: "#f3a2b2",
    fontSize: 12,
    fontWeight: 900,
    minHeight: 34,
    radius: 8,
  },
};

const DEFAULT_EMPLOYEE_NAME_STYLE_CONFIG = {
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

const DEFAULT_SETTINGS = Object.freeze({
  BUSINESS_DAY_PASSWORD: {
    value: process.env.BUSINESS_DAY_PASSWORD || "112411",
    description: "Password required when cashier or restaurant controls the business day",
  },
  BUSINESS_OPEN_HOUR: {
    value: "7",
    description: "Business day opening hour in Africa/Cairo time",
  },
  BUSINESS_CLOSE_HOUR: {
    value: "1",
    description: "Business day closing hour in Africa/Cairo time",
  },
  BRANCH_NAME: {
    value: "BillyBeez MOA",
    description: "Printed branch name",
  },
  BRANCH_TIN: {
    value: "474-214-206",
    description: "Printed tax identification number",
  },
  KITCHEN_PRINTER_NAME: {
    value: "",
    description: "Default kitchen printer name for the local print agent",
  },
  ARCHIVE_REQUIRES_CUSTOMER_LEFT: {
    value: "true",
    description: "Orders can only archive after data team marks customer left",
  },
  UI_MESSAGE_CONFIG: {
    value: JSON.stringify(DEFAULT_UI_MESSAGE_CONFIG),
    description: "Editable UI messages, alert text, and visual styles",
  },
  EMPLOYEE_NAME_STYLE_CONFIG: {
    value: JSON.stringify(DEFAULT_EMPLOYEE_NAME_STYLE_CONFIG),
    description: "Editable employee name colors and typography",
  },
});

async function ensureDefaultSettings(client = prisma) {
  await Promise.all(Object.entries(DEFAULT_SETTINGS).map(([key, setting]) => client.systemSetting.upsert({
    where: { key },
    create: {
      key,
      value: setting.value,
      description: setting.description,
    },
    update: {},
  })));
}

async function getSetting(key, fallback = "") {
  try {
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    return setting?.value ?? DEFAULT_SETTINGS[key]?.value ?? fallback;
  } catch {
    return DEFAULT_SETTINGS[key]?.value ?? fallback;
  }
}

async function getNumberSetting(key, fallback) {
  const value = Number(await getSetting(key, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

async function getBooleanSetting(key, fallback = false) {
  const value = String(await getSetting(key, fallback ? "true" : "false")).toLowerCase();
  return ["1", "true", "yes", "on"].includes(value);
}

module.exports = {
  DEFAULT_SETTINGS,
  DEFAULT_EMPLOYEE_NAME_STYLE_CONFIG,
  DEFAULT_UI_MESSAGE_CONFIG,
  ensureDefaultSettings,
  getBooleanSetting,
  getNumberSetting,
  getSetting,
};
