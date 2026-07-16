const { prisma } = require("./db");
const { ROLE_MATRIX } = require("./role-matrix");

const DEFAULT_UI_MESSAGE_ENGLISH_TEXT = {
  kitchenTicketQueued: "Kitchen ticket is already in the print queue",
  printJobPending: "Preparing the order",
  geideaRegistered: "Registered on system by\n{employee} · {time}",
  paymentSaved: "Payment saved as {method}",
  settingsSaved: "Settings saved",
  uiMessagesSaved: "UI messages saved",
  employeeStyleSaved: "Employee name style saved",
  employeeSaved: "Employee saved",
  productSaved: "Product saved",
  userSaved: "User saved",
  rolePermissionsSaved: "Role permissions saved",
  backupCreated: "Backup created",
  backupRestored: "Backup restored. Restart the app if old data is still visible.",
  orderSaved: "Order {id} saved",
  orderUpdated: "Order updated",
  itemAdded: "Item added",
  itemRemoved: "Item removed",
  customerLeft: "Customer marked as left",
  customerPresent: "Customer marked as present",
  delivered: "Order marked delivered",
  geideaSaved: "Order registered on system",
  orderArchived: "Order archived",
  businessOpened: "Business day opened",
  businessClosed: "Business day closed",
  leftUnpaid: "Customer left without paying",
  leftNeedsGeidea: "Customer left and is not registered on system",
  exitEmployee: "Exit employee\n{employee} · {time}",
  archivedAt: "Archived at: {time}",
  closedAt: "Closed: {time}",
  printJobPrinted: "Kitchen ticket printed",
  printJobFailed: "Kitchen ticket print failed",
};

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
    label: "System registration alert",
    text: "تم التسجيل على السيستم بواسطة\n{employee} · {time}",
    backgroundColor: "#ffe2c2",
    textColor: "#8f3400",
    borderColor: "#e66b00",
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
  settingsSaved: {
    label: "Settings saved toast",
    text: "تم حفظ الإعدادات",
    backgroundColor: "#32124c",
    textColor: "#ffffff",
    borderColor: "#e31937",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  uiMessagesSaved: {
    label: "UI messages saved toast",
    text: "تم حفظ رسائل الواجهة",
    backgroundColor: "#32124c",
    textColor: "#ffffff",
    borderColor: "#e31937",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  employeeStyleSaved: {
    label: "Employee style saved toast",
    text: "تم حفظ ستايل أسماء الموظفين",
    backgroundColor: "#32124c",
    textColor: "#ffffff",
    borderColor: "#e31937",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  employeeSaved: {
    label: "Employee saved toast",
    text: "تم حفظ الموظف",
    backgroundColor: "#32124c",
    textColor: "#ffffff",
    borderColor: "#e31937",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  productSaved: {
    label: "Product saved toast",
    text: "تم حفظ المنتج",
    backgroundColor: "#32124c",
    textColor: "#ffffff",
    borderColor: "#e31937",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  userSaved: {
    label: "User saved toast",
    text: "تم حفظ اليوزر",
    backgroundColor: "#32124c",
    textColor: "#ffffff",
    borderColor: "#e31937",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  rolePermissionsSaved: {
    label: "Role permissions saved toast",
    text: "تم حفظ صلاحيات الأدوار",
    backgroundColor: "#32124c",
    textColor: "#ffffff",
    borderColor: "#e31937",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  backupCreated: {
    label: "Backup created toast",
    text: "تم إنشاء Backup",
    backgroundColor: "#005eb8",
    textColor: "#ffffff",
    borderColor: "#34c3e0",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  backupRestored: {
    label: "Backup restored toast",
    text: "تم استرجاع النسخة. اعمل Restart للتطبيق لو البيانات القديمة ما زالت ظاهرة.",
    backgroundColor: "#005eb8",
    textColor: "#ffffff",
    borderColor: "#34c3e0",
    fontSize: 15,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  orderSaved: {
    label: "Order saved toast",
    text: "تم حفظ الطلب {id}",
    backgroundColor: "#32124c",
    textColor: "#ffffff",
    borderColor: "#e31937",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  orderUpdated: {
    label: "Order updated toast",
    text: "تم تحديث الطلب",
    backgroundColor: "#32124c",
    textColor: "#ffffff",
    borderColor: "#e31937",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  itemAdded: {
    label: "Item added toast",
    text: "تمت إضافة المنتج",
    backgroundColor: "#32124c",
    textColor: "#ffffff",
    borderColor: "#e31937",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  itemRemoved: {
    label: "Item removed toast",
    text: "تم حذف المنتج",
    backgroundColor: "#32124c",
    textColor: "#ffffff",
    borderColor: "#e31937",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  customerLeft: {
    label: "Customer left toast",
    text: "تم تسجيل خروج العميل",
    backgroundColor: "#c55100",
    textColor: "#ffffff",
    borderColor: "#ff8a2b",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  customerPresent: {
    label: "Customer present toast",
    text: "تم رجوع العميل لموجود",
    backgroundColor: "#00843d",
    textColor: "#ffffff",
    borderColor: "#7ed68b",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  delivered: {
    label: "Delivered toast",
    text: "تم تسجيل الطلب كتم التسليم",
    backgroundColor: "#ffc400",
    textColor: "#32124c",
    borderColor: "#ffdf65",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  geideaSaved: {
    label: "System saved toast",
    text: "تم تسجيل الطلب على السيستم",
    backgroundColor: "#c55100",
    textColor: "#ffffff",
    borderColor: "#ff8a2b",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  orderArchived: {
    label: "Order archived toast",
    text: "تم أرشفة الطلب",
    backgroundColor: "#005eb8",
    textColor: "#ffffff",
    borderColor: "#34c3e0",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  businessOpened: {
    label: "Business day opened toast",
    text: "تم فتح يوم التشغيل",
    backgroundColor: "#00843d",
    textColor: "#ffffff",
    borderColor: "#7ed68b",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  businessClosed: {
    label: "Business day closed toast",
    text: "تم قفل يوم التشغيل",
    backgroundColor: "#c8102e",
    textColor: "#ffffff",
    borderColor: "#ff6b7f",
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
    label: "Customer left without system alert",
    text: "العميل خرج ولسه متسجلش على السيستم",
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
    text: "موظف تسجيل الخروج\n{employee} · {time}",
    backgroundColor: "#fde5eb",
    textColor: "#8f061f",
    borderColor: "#f3a2b2",
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

for (const [key, textEn] of Object.entries(DEFAULT_UI_MESSAGE_ENGLISH_TEXT)) {
  if (DEFAULT_UI_MESSAGE_CONFIG[key]) DEFAULT_UI_MESSAGE_CONFIG[key].textEn = textEn;
}

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
  general: {
    label: "General account names",
    color: "#004b8d",
    backgroundColor: "#d8ecff",
    borderColor: "#8bbce8",
    fontSize: 11,
    fontWeight: 900,
    fontStyle: "normal",
    fontFamily: "",
  },
};

const DEFAULT_RECORD_TABLE_STYLE_CONFIG = {
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

const DEFAULT_INVOICE_LAYOUT_CONFIG = {
  front: {
    label: "Front",
    paperSize: "80mm",
    logoUrl: "/bb-logo.png",
    footerMessage: "Thanks for making memories with us!",
    fontSize: 11,
    lineHeight: 1.25,
    logoWidthMm: 38,
    qrSizeMm: 34,
    showLogo: true,
    showCompany: true,
    showBranch: true,
    showTin: true,
    showSerial: true,
    showOrderId: true,
    showBracelet: true,
    showCustomer: true,
    showPhone: true,
    showChildren: true,
    showCashier: true,
    showEmployee: true,
    showPayment: true,
    showSystemRegistration: true,
    showTax: false,
    showQr: true,
    showFooter: true,
  },
  data: {
    label: "Data",
    paperSize: "80mm",
    logoUrl: "/bb-logo.png",
    footerMessage: "Thanks for making memories with us!",
    fontSize: 11,
    lineHeight: 1.25,
    logoWidthMm: 38,
    qrSizeMm: 34,
    showLogo: true,
    showCompany: true,
    showBranch: true,
    showTin: true,
    showSerial: true,
    showOrderId: true,
    showBracelet: true,
    showCustomer: true,
    showPhone: true,
    showChildren: true,
    showCashier: true,
    showEmployee: true,
    showPayment: true,
    showSystemRegistration: true,
    showTax: false,
    showQr: true,
    showFooter: true,
  },
  restaurant: {
    label: "Restaurant",
    paperSize: "80mm",
    logoUrl: "/bb-logo.png",
    footerMessage: "Thanks for making memories with us!",
    fontSize: 11,
    lineHeight: 1.25,
    logoWidthMm: 38,
    qrSizeMm: 34,
    showLogo: true,
    showCompany: true,
    showBranch: true,
    showTin: true,
    showSerial: true,
    showOrderId: true,
    showBracelet: false,
    showCustomer: false,
    showPhone: false,
    showChildren: false,
    showCashier: true,
    showEmployee: false,
    showPayment: true,
    showSystemRegistration: true,
    showTax: false,
    showQr: true,
    showFooter: true,
  },
};

const DEFAULT_EMPLOYEE_DEPARTMENT_CONFIG = [
  { id: "OPERATION", name: "التشغيل", nameEn: "Operation", kind: "DATA", active: true, locked: true },
  { id: "CASHIER", name: "كاشير", nameEn: "Cashier", kind: "DATA", active: true, locked: false },
  { id: "KITCHEN", name: "المطبخ", nameEn: "Kitchen", kind: "KITCHEN", active: true, locked: true },
];

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
  BRANCH_ADDRESS: {
    value: "",
    description: "Branch address shown on invoices and reports",
  },
  BRANCH_PHONE: {
    value: "19881",
    description: "Branch phone number",
  },
  COMPANY_NAME: {
    value: "BillyBeez",
    description: "Company name shown on invoices",
  },
  POS_NAME: {
    value: "BDS MOT POS",
    description: "POS/register name shown on invoices",
  },
  BRANCH_TIN: {
    value: "474-214-206",
    description: "Printed tax identification number",
  },
  BRANCH_ACTIVITY_CODE: {
    value: "",
    description: "Egyptian Tax Authority activity code",
  },
  ETA_ENVIRONMENT: {
    value: "SANDBOX",
    description: "Egyptian Tax Authority environment: SANDBOX or PRODUCTION",
  },
  ETA_QR_MODE: {
    value: "INTERNAL",
    description: "QR mode for invoices: INTERNAL, ETA, or BOTH",
  },
  PUBLIC_APP_BASE_URL: {
    value: "http://127.0.0.1:3000",
    description: "Base URL used to generate internal invoice QR codes",
  },
  DEFAULT_FRONT_DEVICE_ID: {
    value: "DEVICE_1",
    description: "Default front POS device",
  },
  DEFAULT_KITCHEN_DEVICE_ID: {
    value: "DEVICE_5",
    description: "Default kitchen POS device",
  },
  DEFAULT_KITCHEN_CASHIER_DEVICE_ID: {
    value: "DEVICE_9",
    description: "Default restaurant cashier POS device",
  },
  INVOICE_LOGO_URL: {
    value: "/bb-logo.png",
    description: "Invoice logo URL",
  },
  INVOICE_PAPER_SIZE: {
    value: "80mm",
    description: "Invoice paper size",
  },
  INVOICE_FOOTER_MESSAGE: {
    value: "Thanks for making memories with us!",
    description: "Invoice footer message",
  },
  INVOICE_SHOW_TAX: {
    value: "false",
    description: "Show tax line on invoice",
  },
  INVOICE_TAX_RATE: {
    value: "14",
    description: "Invoice tax percentage",
  },
  INVOICE_CONTACT_NUMBER: {
    value: "19881",
    description: "Invoice contact number",
  },
  INVOICE_WEBSITE: {
    value: "www.billybeezeg.com",
    description: "Invoice website",
  },
  INVOICE_PRINTER_NAME: {
    value: "",
    description: "Default invoice printer name for local print agent",
  },
  KITCHEN_PRINTER_NAME: {
    value: "",
    description: "Default kitchen printer name for the local print agent",
  },
  PRINT_AGENT_URL: {
    value: "http://127.0.0.1:9107",
    description: "Local silent print agent URL",
  },
  PRINT_COPIES_INVOICE: {
    value: "1",
    description: "Default invoice copies",
  },
  PRINT_COPIES_KITCHEN: {
    value: "1",
    description: "Default kitchen ticket copies",
  },
  PRINT_AUTO_INVOICE: {
    value: "true",
    description: "Auto print invoice after payment",
  },
  PRINT_AUTO_KITCHEN: {
    value: "true",
    description: "Auto print kitchen ticket when preparation starts",
  },
  KITCHEN_TICKET_CATEGORIES: {
    value: JSON.stringify({
      categoryIds: ["MEALS", "BURGERS", "SANDWICH"],
      categoryNames: ["Meals", "Burgers", "Sandwiches"],
      productIds: [],
    }),
    description: "Product categories included in kitchen ticket",
  },
  CUSTOM_PAYMENT_PROVIDER_1: {
    value: "Custom 1",
    description: "Editable custom payment provider 1",
  },
  CUSTOM_PAYMENT_PROVIDER_2: {
    value: "Custom 2",
    description: "Editable custom payment provider 2",
  },
  LOYALTY_ENTRANCE_POINTS_PER_VISIT: {
    value: "10",
    description: "Entrance loyalty points earned for each paid visit",
  },
  LOYALTY_RESTAURANT_POINTS_PER_EGP: {
    value: "1",
    description: "Restaurant loyalty points earned per EGP paid",
  },
  LOYALTY_POINTS_PER_EGP: {
    value: "1",
    description: "Points required to pay one EGP with Loyalty Points",
  },
  LOYALTY_POINTS_EXPIRY_DAYS: {
    value: "365",
    description: "Default loyalty points validity in days",
  },
  LOYALTY_AUTO_ISSUE_CARD: {
    value: "true",
    description: "Automatically issue a loyalty account after the first paid order",
  },
  BUSINESS_MANUAL_CLOSE_ONLY: {
    value: "true",
    description: "Business day closes only by manager action",
  },
  ARCHIVE_REQUIRES_CUSTOMER_LEFT: {
    value: "true",
    description: "Orders can only archive after data team marks customer left",
  },
  WORKFLOW_ALLOW_PAID_ORDER_EDIT_ROLES: {
    value: "ADMIN,MANAGER",
    description: "Roles allowed to edit paid orders",
  },
  WORKFLOW_ALLOW_PAYMENT_BEFORE_DELIVERY: {
    value: "false",
    description: "Allow payment before delivery",
  },
  WORKFLOW_REQUIRE_GEIDEA_BEFORE_ARCHIVE: {
    value: "true",
    description: "Require system registration before archive",
  },
  WORKFLOW_REQUIRE_PAYMENT_BEFORE_ARCHIVE: {
    value: "true",
    description: "Require payment before archive",
  },
  WORKFLOW_ALLOW_EXIT_BEFORE_PAYMENT: {
    value: "true",
    description: "Allow customer exit before payment with alert",
  },
  REPORT_DEFAULT_TAB: {
    value: "daily",
    description: "Default manager reports tab",
  },
  REPORT_SHOW_CASH_VISA_GEIDEA: {
    value: "true",
    description: "Show cash, visa, and system breakdowns",
  },
  REPORT_ENABLE_EXCEL_EXPORT: {
    value: "true",
    description: "Enable Excel/CSV export",
  },
  REPORT_ENABLE_PDF_EXPORT: {
    value: "true",
    description: "Enable PDF print export",
  },
  FRONT_DASHBOARD_DAILY_TARGET: {
    value: "10000",
    description: "Daily front desk sales target in EGP",
  },
  FRONT_DASHBOARD_SHOW_CHILDREN: {
    value: "true",
    description: "Show current children card on front dashboard",
  },
  FRONT_DASHBOARD_SHOW_CUSTOMERS: {
    value: "true",
    description: "Show current customers card on front dashboard",
  },
  FRONT_DASHBOARD_SHOW_TRIPS: {
    value: "true",
    description: "Show current trips card on front dashboard",
  },
  FRONT_DASHBOARD_SHOW_BIRTHDAYS: {
    value: "true",
    description: "Show current birthdays card on front dashboard",
  },
  FRONT_DASHBOARD_SHOW_TARGET: {
    value: "true",
    description: "Show daily target progress card on front dashboard",
  },
  AUDIT_RETENTION_DAYS: {
    value: "180",
    description: "Audit log retention in days",
  },
  AUDIT_EXPORT_ENABLED: {
    value: "true",
    description: "Enable activity export",
  },
  BACKUP_AUTO_DAILY: {
    value: "true",
    description: "Enable daily automatic database backup",
  },
  BACKUP_RETENTION_DAYS: {
    value: "30",
    description: "Backup retention in days",
  },
  UI_MESSAGE_CONFIG: {
    value: JSON.stringify(DEFAULT_UI_MESSAGE_CONFIG),
    description: "Editable UI messages, alert text, and visual styles",
  },
  EMPLOYEE_NAME_STYLE_CONFIG: {
    value: JSON.stringify(DEFAULT_EMPLOYEE_NAME_STYLE_CONFIG),
    description: "Editable employee name colors and typography",
  },
  RECORD_TABLE_STYLE_CONFIG: {
    value: JSON.stringify(DEFAULT_RECORD_TABLE_STYLE_CONFIG),
    description: "Editable manager order records table colors, font sizes, and spacing",
  },
  INVOICE_LAYOUT_CONFIG: {
    value: JSON.stringify(DEFAULT_INVOICE_LAYOUT_CONFIG),
    description: "Editable invoice layouts by department",
  },
  EMPLOYEE_DEPARTMENT_CONFIG: {
    value: JSON.stringify(DEFAULT_EMPLOYEE_DEPARTMENT_CONFIG),
    description: "Editable employee departments for data and restaurant workflows",
  },
  ROLE_PERMISSION_CONFIG: {
    value: JSON.stringify(ROLE_MATRIX),
    description: "Editable API role permissions",
  },
});

const SETTINGS_CACHE_TTL_MS = 10_000;
let defaultSettingsReadyPromise = null;
let settingsCache = null;
let settingsCacheExpiresAt = 0;

function clearSettingsCache() {
  settingsCache = null;
  settingsCacheExpiresAt = 0;
}

async function ensureDefaultSettings(client = prisma) {
  const writeDefaults = () => Promise.all(Object.entries(DEFAULT_SETTINGS).map(([key, setting]) => client.systemSetting.upsert({
    where: { key },
    create: {
      key,
      value: setting.value,
      description: setting.description,
    },
    update: {},
  })));

  if (client !== prisma) {
    await writeDefaults();
    return;
  }

  if (!defaultSettingsReadyPromise) {
    defaultSettingsReadyPromise = writeDefaults().then((result) => {
      clearSettingsCache();
      return result;
    }).catch((error) => {
      defaultSettingsReadyPromise = null;
      throw error;
    });
  }

  await defaultSettingsReadyPromise;
}

async function getSettingsRows() {
  const now = Date.now();

  if (settingsCache && settingsCacheExpiresAt > now) {
    return settingsCache;
  }

  const rows = await prisma.systemSetting.findMany({ orderBy: { key: "asc" } });
  const seen = new Set(rows.map((row) => row.key));
  const withDefaults = [
    ...rows,
    ...Object.entries(DEFAULT_SETTINGS)
      .filter(([key]) => !seen.has(key))
      .map(([key, setting]) => ({
        key,
        value: setting.value,
        description: setting.description,
        updatedBy: null,
        updatedAt: null,
      })),
  ].sort((a, b) => a.key.localeCompare(b.key));

  settingsCache = withDefaults;
  settingsCacheExpiresAt = now + SETTINGS_CACHE_TTL_MS;
  return settingsCache;
}

async function getSetting(key, fallback = "") {
  try {
    const rows = await getSettingsRows();
    const setting = rows.find((row) => row.key === key);
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
  DEFAULT_RECORD_TABLE_STYLE_CONFIG,
  DEFAULT_INVOICE_LAYOUT_CONFIG,
  DEFAULT_EMPLOYEE_DEPARTMENT_CONFIG,
  DEFAULT_UI_MESSAGE_CONFIG,
  clearSettingsCache,
  ensureDefaultSettings,
  getBooleanSetting,
  getNumberSetting,
  getSetting,
  getSettingsRows,
};
