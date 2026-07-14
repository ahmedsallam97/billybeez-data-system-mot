"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "../ToastProvider";
import { useI18n } from "../i18n";
import OrderAlerts from "../OrderAlerts";
import OrderItemsSummary from "../OrderItemsSummary";
import { applyEmployeeNameStyles, employeeGenderClass, normalizeEmployeeNameStyles } from "../employeeDisplay";
import { applyRecordTableStyles, normalizeRecordTableStyles, recordTableStylePresets } from "../recordTableStyles";
import { formatUiMessage, normalizeUiMessages, uiMessageStyle } from "../uiMessages";
import { formatCairoDateLabel, formatCairoTime } from "../dateTime";
import {
  departmentLabel as configuredDepartmentLabel,
  employeeDepartmentValue,
  normalizeDepartmentId,
  normalizeEmployeeDepartments,
} from "../../lib/employee-departments";
import { kitchenTicketRuleValue, parseKitchenTicketRules } from "../../lib/kitchen-ticket-rules";

const roles = ["ADMIN", "MANAGER", "CASHIER", "KITCHEN", "DATA"];
const permissionKeys = [
  "BUSINESS_DAY_READ",
  "BUSINESS_DAY_WRITE",
  "DASHBOARD_READ",
  "EMPLOYEE_READ",
  "EMPLOYEE_MANAGE",
  "ORDER_READ",
  "ORDER_CREATE",
  "ORDER_EDIT_ITEMS",
  "ORDER_DELIVER",
  "ORDER_PAY",
  "ORDER_CUSTOMER_LEFT",
  "ORDER_GEIDEA_REGISTER",
  "ORDER_ARCHIVE",
  "ORDER_UNARCHIVE",
  "PRINT_JOB_READ",
  "PRINT_JOB_CREATE",
  "PRINT_JOB_UPDATE",
  "SYSTEM_SETTING_READ",
  "SYSTEM_SETTING_MANAGE",
  "PRODUCT_READ",
  "PRODUCT_MANAGE",
  "DEVICE_READ",
  "DEVICE_MANAGE",
  "PAYMENT_PROVIDER_READ",
  "PAYMENT_PROVIDER_MANAGE",
  "USER_MANAGE",
  "BACKUP_MANAGE",
];

function normalizeRolePermissions(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = {};
    }
  }

  return Object.fromEntries(permissionKeys.map((permission) => {
    const allowed = Array.isArray(parsed?.[permission]) ? parsed[permission] : [];
    return [permission, allowed.map((role) => String(role).toUpperCase()).filter((role) => roles.includes(role))];
  }));
}

const invoiceLayoutTypes = ["front", "data", "restaurant"];
const defaultInvoiceLayout = {
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
};

function normalizeInvoiceLayouts(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = {};
    }
  }
  return Object.fromEntries(invoiceLayoutTypes.map((type) => {
    const savedLayout = parsed?.[type] && typeof parsed[type] === "object" ? parsed[type] : null;
    return [type, {
      ...defaultInvoiceLayout,
      ...(type === "restaurant" && !savedLayout ? { showBracelet: false, showCustomer: false, showPhone: false, showChildren: false, showEmployee: false } : {}),
      ...(savedLayout || {}),
    }];
  }));
}

const emptyEmployeeForm = {
  id: "",
  name: "",
  department: "OPERATION",
  active: true,
};

const emptyEmployeeDepartmentForm = {
  id: "",
  name: "",
  nameEn: "",
  kind: "DATA",
  active: true,
  locked: false,
};

const emptyProductForm = {
  id: "",
  name: "",
  price: "",
  originalPrice: "",
  netSales: "",
  taxAmount: "",
  taxRate: "",
  etaItemCode: "",
  etaCodeType: "",
  etaUnitType: "",
  etaTaxType: "",
  etaTaxSubType: "",
  department: "KITCHEN",
  categoryId: "",
  categoryName: "",
  imageUrl: "",
  iconText: "",
  cardColorStart: "#3d1859",
  cardColorEnd: "#8a62b2",
  cardTextColor: "#ffffff",
  cardAccentColor: "#e31937",
  availabilityDays: [],
  availabilityStartTime: "",
  availabilityEndTime: "",
  popular: false,
  printOnKitchen: true,
  showInDataOrder: true,
  showInQuickOrder: true,
  active: true,
  sortOrder: 100,
};

const emptyCategoryForm = {
  id: "",
  name: "",
  department: "KITCHEN",
  color: "#3d1859",
  availabilityDays: [],
  availabilityStartTime: "",
  availabilityEndTime: "",
  active: true,
  showInDataOrder: true,
  showInQuickOrder: true,
  sortOrder: 100,
};

const emptyUserForm = {
  id: "",
  accountType: "GENERAL",
  employeeId: "",
  name: "",
  username: "",
  password: "",
  role: "DATA",
  active: true,
};

const emptyDeviceForm = {
  id: "",
  deviceNo: 1,
  name: "",
  type: "FRONT",
  active: true,
  invoicePrinterName: "",
  kitchenPrinterName: "",
  posSerial: "",
  branchCode: "",
};

const emptyPaymentProviderForm = {
  id: "",
  name: "",
  type: "CUSTOM",
  method: "CUSTOM_1",
  active: true,
  editable: true,
  showInFrontOrder: true,
  showInDataOrder: true,
  showInQuickOrder: true,
  sortOrder: 100,
  reportBucket: "CUSTOM",
};

const productDepartments = ["ENTRANCE", "KITCHEN", "KITCHEN_CASHIER"];
const deviceTypes = ["FRONT", "KITCHEN", "KITCHEN_CASHIER"];
const paymentProviderTypes = ["CASH", "VISA", "CUSTOM"];
const paymentProviderMethods = ["CASH", "VISA", "KIDZAPP", "WAFFARHA", "E_INVOICE", "CUSTOM_1", "CUSTOM_2"];
const productAvailabilityDays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function parseProductAvailabilityRules(value) {
  if (!value) return { days: [], startTime: "", endTime: "" };
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return {
      days: Array.isArray(parsed.days) ? parsed.days.filter((day) => productAvailabilityDays.includes(day)) : [],
      startTime: /^\d{2}:\d{2}$/.test(String(parsed.startTime || "")) ? parsed.startTime : "",
      endTime: /^\d{2}:\d{2}$/.test(String(parsed.endTime || "")) ? parsed.endTime : "",
    };
  } catch {
    return { days: [], startTime: "", endTime: "" };
  }
}

function buildProductAvailabilityRules(form) {
  if (!form.availabilityDays.length && !form.availabilityStartTime && !form.availabilityEndTime) return "";
  return JSON.stringify({
    days: form.availabilityDays,
    startTime: form.availabilityStartTime,
    endTime: form.availabilityEndTime,
  });
}

function productPreviewText(form) {
  const icon = String(form.iconText || "").trim();
  if (icon) return icon.slice(0, 4).toUpperCase();

  const name = String(form.name || "").trim();
  if (!name) return "S2";

  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

const uiMessageGroups = [
  {
    titleKey: "manager.uiMessageGroupOrders",
    keys: ["orderSaved", "orderUpdated", "itemAdded", "itemRemoved", "customerLeft", "customerPresent", "delivered", "orderArchived"],
  },
  {
    titleKey: "manager.uiMessageGroupPayment",
    keys: ["paymentSaved", "geideaSaved", "geideaRegistered", "leftUnpaid", "leftNeedsGeidea", "exitEmployee"],
  },
  {
    titleKey: "manager.uiMessageGroupPrinting",
    keys: ["kitchenTicketQueued", "printJobPending", "printJobPrinted", "printJobFailed"],
  },
  {
    titleKey: "manager.uiMessageGroupBusiness",
    keys: ["businessOpened", "businessClosed", "archivedAt", "closedAt"],
  },
  {
    titleKey: "manager.uiMessageGroupSettings",
    keys: ["settingsSaved", "uiMessagesSaved", "employeeStyleSaved", "employeeSaved", "productSaved", "userSaved", "rolePermissionsSaved", "backupCreated", "backupRestored"],
  },
];

const managerBootSettingsKeys = [
  "UI_MESSAGE_CONFIG",
  "ROLE_PERMISSION_CONFIG",
  "EMPLOYEE_NAME_STYLE_CONFIG",
  "EMPLOYEE_DEPARTMENT_CONFIG",
  "RECORD_TABLE_STYLE_CONFIG",
  "REPORT_DEFAULT_TAB",
  "REPORT_SHOW_CASH_VISA_GEIDEA",
  "REPORT_ENABLE_EXCEL_EXPORT",
  "REPORT_ENABLE_PDF_EXPORT",
  "REPORT_ORDERS_CARD_ICON_URL",
  "REPORT_ORDERS_CARD_COLOR_START",
  "REPORT_ORDERS_CARD_COLOR_END",
  "REPORT_ORDERS_CARD_TEXT_COLOR",
  "REPORT_AVERAGE_CARD_ICON_URL",
  "REPORT_AVERAGE_CARD_COLOR_START",
  "REPORT_AVERAGE_CARD_COLOR_END",
  "REPORT_AVERAGE_CARD_TEXT_COLOR",
  "REPORT_GEIDEA_CARD_ICON_URL",
  "REPORT_GEIDEA_CARD_COLOR_START",
  "REPORT_GEIDEA_CARD_COLOR_END",
  "REPORT_GEIDEA_CARD_TEXT_COLOR",
  "REPORT_PAID_CARD_ICON_URL",
  "REPORT_PAID_CARD_COLOR_START",
  "REPORT_PAID_CARD_COLOR_END",
  "REPORT_PAID_CARD_TEXT_COLOR",
].join(",");

function cairoTodayIso() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function monthToDateFilter(day = cairoTodayIso()) {
  const month = day.slice(0, 7);
  return {
    day,
    month,
    year: day.slice(0, 4),
    from: `${month}-01`,
    to: day,
  };
}

export default function ManagerClient() {
  const toast = useToast();
  const { language, t, formatNumber, currency, labelAudit, labelBusinessMessage, labelDepartment, labelMethod, labelOrderStage, labelStatus, formatDateTime } = useI18n();
  const [data, setData] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [users, setUsers] = useState([]);
  const [devices, setDevices] = useState([]);
  const [paymentProviders, setPaymentProviders] = useState([]);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm);
  const [employeeDepartmentForm, setEmployeeDepartmentForm] = useState(emptyEmployeeDepartmentForm);
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [deviceForm, setDeviceForm] = useState(emptyDeviceForm);
  const [paymentProviderForm, setPaymentProviderForm] = useState(emptyPaymentProviderForm);
  const [viewMode, setViewMode] = useState("TODAY");
  const [dateFilterMode, setDateFilterMode] = useState("RANGE");
  const [dateFilter, setDateFilter] = useState(() => monthToDateFilter());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => monthToDateFilter().month);
  const [filter, setFilter] = useState("ALL");
  const [archiveFilter, setArchiveFilter] = useState("ALL");
  const [managerTab, setManagerTab] = useState("orders");
  const [settingsTab, setSettingsTab] = useState("employees");
  const [employeeFilter, setEmployeeFilter] = useState({ query: "", department: "ALL", status: "ALL" });
  const [productFilter, setProductFilter] = useState({ query: "", department: "ALL", category: "ALL", status: "ALL", popular: "ALL" });
  const [categoryFilter, setCategoryFilter] = useState({ query: "", department: "ALL", status: "ALL" });
  const [selectedProductIds, setSelectedProductIds] = useState([]);
  const [customerFilter, setCustomerFilter] = useState("");
  const [userFilter, setUserFilter] = useState({ query: "", role: "ALL", status: "ALL" });
  const [deviceFilter, setDeviceFilter] = useState({ query: "", type: "ALL", status: "ALL" });
  const [paymentProviderFilter, setPaymentProviderFilter] = useState({ query: "", type: "ALL", status: "ALL" });
  const [healthFilter, setHealthFilter] = useState("ALL");
  const [recordQuery, setRecordQuery] = useState("");
  const [settingsSearch, setSettingsSearch] = useState("");
  const [query, setQuery] = useState("");
  const [orderRenderLimit, setOrderRenderLimit] = useState(30);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [orderItemForm, setOrderItemForm] = useState({ productId: "", qty: 1 });
  const [managerPaymentEmployeeId, setManagerPaymentEmployeeId] = useState("");
  const [managerGeideaEmployeeId, setManagerGeideaEmployeeId] = useState("");
  const [printFrameUrl, setPrintFrameUrl] = useState("");
  const [reportPrintHtml, setReportPrintHtml] = useState("");
  const [uiMessages, setUiMessages] = useState(normalizeUiMessages());
  const [employeeNameStyles, setEmployeeNameStyles] = useState(normalizeEmployeeNameStyles());
  const [recordTableStyles, setRecordTableStyles] = useState(normalizeRecordTableStyles());
  const [settingsMap, setSettingsMap] = useState({});
  const [settingsLoadMode, setSettingsLoadMode] = useState("boot");
  const [invoiceLayouts, setInvoiceLayouts] = useState(normalizeInvoiceLayouts());
  const [invoiceDesignerTab, setInvoiceDesignerTab] = useState("front");
  const [backups, setBackups] = useState([]);
  const [rolePermissions, setRolePermissions] = useState(normalizeRolePermissions());
  const [dashboardMode, setDashboardMode] = useState("light");
  const [resourceStatus, setResourceStatus] = useState({
    employees: "idle",
    products: "idle",
    categories: "idle",
    customers: "idle",
    users: "idle",
    devices: "idle",
    paymentProviders: "idle",
    backups: "idle",
  });
  const [loadError, setLoadError] = useState("");
  const [uiPrefsReady, setUiPrefsReady] = useState(false);

  const employeeDepartments = normalizeEmployeeDepartments(settingsMap.EMPLOYEE_DEPARTMENT_CONFIG || "");
  const activeEmployeeDepartments = employeeDepartments.filter((department) => department.active);
  const restaurantDepartmentIds = new Set(employeeDepartments.filter((department) => department.kind === "KITCHEN" && department.active).map((department) => department.id));

  function labelEmployeeDepartment(department) {
    return configuredDepartmentLabel(department, settingsMap.EMPLOYEE_DEPARTMENT_CONFIG || "", language);
  }

  function isRestaurantEmployee(employee) {
    return restaurantDepartmentIds.has(employee?.department);
  }

  function roleForEmployeeDepartment(department) {
    const row = employeeDepartments.find((item) => item.id === department);
    if (department === "CASHIER") return "CASHIER";
    if (row?.kind === "KITCHEN") return "KITCHEN";
    return "DATA";
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const savedManagerTab = localStorage.getItem("managerTab");
    const savedSettingsTab = localStorage.getItem("managerSettingsTab");
    const savedViewMode = localStorage.getItem("managerViewMode");
    const savedFilter = localStorage.getItem("managerPaymentFilter");
    const savedArchiveFilter = localStorage.getItem("managerArchiveFilter");
    const savedDateFilterMode = localStorage.getItem("managerDateFilterMode");
    const savedDateFilter = localStorage.getItem("managerDateFilter");
    const savedDateDefaultVersion = localStorage.getItem("managerDateFilterDefaultVersion");
    const shouldUseSavedDateFilter = savedDateDefaultVersion === "month-to-date-v1";

    if (["orders", "review", "reports", "settings", "records", "activity"].includes(savedManagerTab)) setManagerTab(savedManagerTab);
    if (["employees", "customers", "products", "users", "devices", "paymentProviders", "branch", "invoice", "printing", "business", "workflow", "reports", "recordsStyle", "auditBackup", "backupRestore", "messages"].includes(savedSettingsTab)) setSettingsTab(savedSettingsTab);
    if (["TODAY", "HISTORY"].includes(savedViewMode)) setViewMode(savedViewMode);
    if (["ALL", "CASH", "VISA", "UNPAID"].includes(savedFilter)) setFilter(savedFilter);
    if (["ALL", "ACTIVE", "ARCHIVED", "UNREGISTERED"].includes(savedArchiveFilter)) setArchiveFilter(savedArchiveFilter);
    if (shouldUseSavedDateFilter && ["DAY", "YESTERDAY", "MONTH", "YEAR", "RANGE"].includes(savedDateFilterMode)) setDateFilterMode(savedDateFilterMode);
    if (shouldUseSavedDateFilter && savedDateFilter) {
      try {
        const parsedDateFilter = JSON.parse(savedDateFilter);
        if (parsedDateFilter && typeof parsedDateFilter === "object") {
          setDateFilter({
            day: parsedDateFilter.day || "",
            month: parsedDateFilter.month || "",
            year: parsedDateFilter.year || "",
            from: parsedDateFilter.from || "",
            to: parsedDateFilter.to || "",
          });
          if (parsedDateFilter.month) setCalendarMonth(parsedDateFilter.month);
          else if (parsedDateFilter.day) setCalendarMonth(String(parsedDateFilter.day).slice(0, 7));
        }
      } catch {}
    } else {
      const nextFilter = monthToDateFilter();
      setDateFilterMode("RANGE");
      setDateFilter(nextFilter);
      setCalendarMonth(nextFilter.month);
      localStorage.setItem("managerDateFilterDefaultVersion", "month-to-date-v1");
    }
    setUiPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!uiPrefsReady) return;
    localStorage.setItem("managerTab", managerTab);
  }, [managerTab, uiPrefsReady]);

  useEffect(() => {
    if (!uiPrefsReady) return;
    localStorage.setItem("managerSettingsTab", settingsTab);
  }, [settingsTab, uiPrefsReady]);

  useEffect(() => {
    if (!uiPrefsReady) return;
    localStorage.setItem("managerViewMode", viewMode);
  }, [viewMode, uiPrefsReady]);

  useEffect(() => {
    if (!uiPrefsReady) return;
    localStorage.setItem("managerPaymentFilter", filter);
  }, [filter, uiPrefsReady]);

  useEffect(() => {
    if (!uiPrefsReady) return;
    localStorage.setItem("managerArchiveFilter", archiveFilter);
  }, [archiveFilter, uiPrefsReady]);

  useEffect(() => {
    if (!uiPrefsReady) return;
    localStorage.setItem("managerDateFilterMode", dateFilterMode);
    localStorage.setItem("managerDateFilter", JSON.stringify(dateFilter));
  }, [dateFilterMode, dateFilter, uiPrefsReady]);

  useEffect(() => {
    setOrderRenderLimit(30);
  }, [viewMode, filter, archiveFilter, healthFilter, query, dateFilterMode, dateFilter.day, dateFilter.month, dateFilter.year, dateFilter.from, dateFilter.to]);

  useEffect(() => {
    if (!selectedOrder) return;
    ensureEmployeesLoaded();
    ensureProductsLoaded();
    const restaurantEmployees = employees.filter((employee) => isRestaurantEmployee(employee) && employee.active);
    setManagerPaymentEmployeeId(selectedOrder.paymentEmployeeId || restaurantEmployees[0]?.id || "");
    setManagerGeideaEmployeeId(selectedOrder.geideaEmployeeId || restaurantEmployees[0]?.id || "");
    setOrderItemForm((current) => ({ productId: current.productId || products[0]?.id || "", qty: current.qty || 1 }));
  }, [selectedOrder, employees, products, settingsMap.EMPLOYEE_DEPARTMENT_CONFIG]);

  useEffect(() => {
    if (managerTab !== "settings") return;
    if (settingsLoadMode !== "full") loadSettingsOnly();
    if (["employees", "users"].includes(settingsTab)) ensureEmployeesLoaded();
    if (["products", "printing"].includes(settingsTab)) {
      ensureProductsLoaded();
      ensureCategoriesLoaded();
    }
    if (settingsTab === "customers") ensureCustomersLoaded();
    if (settingsTab === "users") ensureUsersLoaded();
    if (settingsTab === "devices") ensureDevicesLoaded();
    if (settingsTab === "paymentProviders") ensurePaymentProvidersLoaded();
    if (settingsTab === "backupRestore") ensureBackupsLoaded();
  }, [managerTab, settingsTab, settingsLoadMode]);

  useEffect(() => {
    if (!data || dashboardMode === "full") return;
    const selectedDifferentDay = dateFilterMode === "DAY" && dateFilter.day && data?.reportBusinessDate && dateFilter.day !== data.reportBusinessDate;
    if (["reports", "records", "activity"].includes(managerTab) || viewMode === "HISTORY" || dateFilterMode !== "DAY" || selectedDifferentDay) {
      loadDashboardFull();
    }
  }, [data, dashboardMode, managerTab, viewMode, dateFilterMode, dateFilter.day]);

  useEffect(() => {
    if (!data?.reportBusinessDate || dateFilter.day) return;
    const month = String(data.reportBusinessDate).slice(0, 7);
    const year = String(data.reportBusinessDate).slice(0, 4);
    setCalendarMonth(month);
    setDateFilter({ day: data.reportBusinessDate, month, year, from: data.reportBusinessDate, to: data.reportBusinessDate });
  }, [data?.reportBusinessDate, dateFilter.day]);

  async function load() {
    setLoadError("");
    const fetchOptions = { cache: "no-store", credentials: "include" };
    let dashboardRes;
    let settingsRes;

    try {
      [dashboardRes, settingsRes] = await Promise.all([
        fetch("/api/dashboard?light=1", fetchOptions),
        fetch(`/api/settings?keys=${managerBootSettingsKeys}`, fetchOptions),
      ]);
    } catch (error) {
      setLoadError(error?.message || t("common.loading"));
      return;
    }

    if (![dashboardRes, settingsRes].every((res) => res.ok)) {
      setLoadError("Failed to load manager data");
      return;
    }

    const [dashboardData, settingsData] = await Promise.all([
      dashboardRes.json(),
      settingsRes.json(),
    ]);

    setData(dashboardData);
    setDashboardMode("light");
    setSettingsLoadMode("boot");
    const nextSettingsMap = Object.fromEntries((settingsData.settings || []).map((setting) => [setting.key, setting.value]));
    setSettingsMap(nextSettingsMap);
    setUiMessages(normalizeUiMessages(nextSettingsMap.UI_MESSAGE_CONFIG));
    setRolePermissions(normalizeRolePermissions(nextSettingsMap.ROLE_PERMISSION_CONFIG));
    setInvoiceLayouts(normalizeInvoiceLayouts(nextSettingsMap.INVOICE_LAYOUT_CONFIG));
    const employeeStyleSetting = settingsData.settings?.find((item) => item.key === "EMPLOYEE_NAME_STYLE_CONFIG");
    const normalizedEmployeeStyles = normalizeEmployeeNameStyles(employeeStyleSetting?.value);
    setEmployeeNameStyles(normalizedEmployeeStyles);
    applyEmployeeNameStyles(normalizedEmployeeStyles);
    const recordStyleSetting = settingsData.settings?.find((item) => item.key === "RECORD_TABLE_STYLE_CONFIG");
    const normalizedRecordStyles = normalizeRecordTableStyles(recordStyleSetting?.value);
    setRecordTableStyles(normalizedRecordStyles);
    applyRecordTableStyles(normalizedRecordStyles);
  }

  async function loadDashboardFull() {
    const res = await fetch("/api/dashboard", { cache: "no-store", credentials: "include" });
    if (!res.ok) return;
    setData(await res.json());
    setDashboardMode("full");
  }

  async function loadSettingsOnly() {
    const res = await fetch("/api/settings", { cache: "no-store", credentials: "include" });
    if (!res.ok) return;
    const settingsData = await res.json();
    const nextSettingsMap = Object.fromEntries((settingsData.settings || []).map((setting) => [setting.key, setting.value]));
    setSettingsMap(nextSettingsMap);
    setSettingsLoadMode("full");
    setUiMessages(normalizeUiMessages(nextSettingsMap.UI_MESSAGE_CONFIG));
    setRolePermissions(normalizeRolePermissions(nextSettingsMap.ROLE_PERMISSION_CONFIG));
    setInvoiceLayouts(normalizeInvoiceLayouts(nextSettingsMap.INVOICE_LAYOUT_CONFIG));
  }

  async function loadEmployees() {
    setResourceStatus((current) => ({ ...current, employees: "loading" }));
    const res = await fetch("/api/employees?department=ALL&includeInactive=true", { cache: "no-store", credentials: "include" });
    if (!res.ok) {
      setResourceStatus((current) => ({ ...current, employees: "error" }));
      return;
    }
    setEmployees(await res.json());
    setResourceStatus((current) => ({ ...current, employees: "loaded" }));
  }

  async function loadProducts() {
    setResourceStatus((current) => ({ ...current, products: "loading" }));
    const res = await fetch("/api/products?includeInactive=true", { cache: "no-store", credentials: "include" });
    if (!res.ok) {
      setResourceStatus((current) => ({ ...current, products: "error" }));
      return;
    }
    setProducts(await res.json());
    setResourceStatus((current) => ({ ...current, products: "loaded" }));
  }

  async function loadCategories() {
    setResourceStatus((current) => ({ ...current, categories: "loading" }));
    const res = await fetch("/api/categories?includeInactive=true", { cache: "no-store", credentials: "include" });
    if (!res.ok) {
      setResourceStatus((current) => ({ ...current, categories: "error" }));
      return;
    }
    const result = await res.json();
    setCategories(Array.isArray(result.categories) ? result.categories : []);
    setResourceStatus((current) => ({ ...current, categories: "loaded" }));
  }

  async function loadCustomers(queryValue = customerFilter) {
    setResourceStatus((current) => ({ ...current, customers: "loading" }));
    const params = queryValue.trim() ? `?q=${encodeURIComponent(queryValue.trim())}` : "";
    const res = await fetch(`/api/customers${params}`, { cache: "no-store", credentials: "include" });
    if (!res.ok) {
      setResourceStatus((current) => ({ ...current, customers: "error" }));
      return;
    }
    const result = await res.json();
    const nextCustomers = Array.isArray(result.customers) ? result.customers : [];
    setCustomers(nextCustomers);
    setSelectedCustomer((current) => current ? nextCustomers.find((customer) => customer.id === current.id) || current : current);
    setResourceStatus((current) => ({ ...current, customers: "loaded" }));
  }

  async function loadUsers() {
    setResourceStatus((current) => ({ ...current, users: "loading" }));
    const res = await fetch("/api/users", { cache: "no-store", credentials: "include" });
    if (!res.ok) {
      setResourceStatus((current) => ({ ...current, users: "error" }));
      return;
    }
    const usersData = await res.json();
    setUsers(Array.isArray(usersData) ? usersData : []);
    setResourceStatus((current) => ({ ...current, users: "loaded" }));
  }

  async function loadDevices() {
    setResourceStatus((current) => ({ ...current, devices: "loading" }));
    const res = await fetch("/api/devices", { cache: "no-store", credentials: "include" });
    if (!res.ok) {
      setResourceStatus((current) => ({ ...current, devices: "error" }));
      return;
    }
    const result = await res.json();
    setDevices(Array.isArray(result.devices) ? result.devices : []);
    setResourceStatus((current) => ({ ...current, devices: "loaded" }));
  }

  async function loadPaymentProviders() {
    setResourceStatus((current) => ({ ...current, paymentProviders: "loading" }));
    const res = await fetch("/api/payment-providers", { cache: "no-store", credentials: "include" });
    if (!res.ok) {
      setResourceStatus((current) => ({ ...current, paymentProviders: "error" }));
      return;
    }
    const result = await res.json();
    setPaymentProviders(Array.isArray(result.providers) ? result.providers : []);
    setResourceStatus((current) => ({ ...current, paymentProviders: "loaded" }));
  }

  async function loadBackups() {
    setResourceStatus((current) => ({ ...current, backups: "loading" }));
    const res = await fetch("/api/backups", { cache: "no-store", credentials: "include" });
    if (!res.ok) {
      setResourceStatus((current) => ({ ...current, backups: "error" }));
      return;
    }
    const result = await res.json();
    setBackups(Array.isArray(result.backups) ? result.backups : []);
    setResourceStatus((current) => ({ ...current, backups: "loaded" }));
  }

  function ensureEmployeesLoaded() {
    if (resourceStatus.employees === "idle" || resourceStatus.employees === "error") loadEmployees();
  }

  function ensureProductsLoaded() {
    if (resourceStatus.products === "idle" || resourceStatus.products === "error") loadProducts();
  }

  function ensureCategoriesLoaded() {
    if (resourceStatus.categories === "idle" || resourceStatus.categories === "error") loadCategories();
  }

  function ensureCustomersLoaded() {
    if (resourceStatus.customers === "idle" || resourceStatus.customers === "error") loadCustomers();
  }

  function ensureUsersLoaded() {
    if (resourceStatus.users === "idle" || resourceStatus.users === "error") loadUsers();
  }

  function ensureDevicesLoaded() {
    if (resourceStatus.devices === "idle" || resourceStatus.devices === "error") loadDevices();
  }

  function ensurePaymentProvidersLoaded() {
    if (resourceStatus.paymentProviders === "idle" || resourceStatus.paymentProviders === "error") loadPaymentProviders();
  }

  function ensureBackupsLoaded() {
    if (resourceStatus.backups === "idle" || resourceStatus.backups === "error") loadBackups();
  }

  function clearOrderFilters() {
    setQuery("");
    setFilter("ALL");
    setArchiveFilter("ALL");
    setHealthFilter("ALL");
  }

  function orderAlertClass(order) {
    if (order.archivedAt) return "archived-order";
    if (!order.customerLeft || order.archivedAt) return "";
    if (order.paymentStatus !== "PAID") return "left-unpaid";
    return order.geideaRegisteredAt ? "" : "needs-system";
  }

  function orderUrlId(orderId) {
    return encodeURIComponent(orderId);
  }

  function showUiToast(key, values = {}, type = "info") {
    toast(formatUiMessage(uiMessages[key], values), type, uiMessageStyle(uiMessages[key]));
  }

  function printInvoice(orderId) {
    setPrintFrameUrl(`/invoice/${orderUrlId(orderId)}?print=${Date.now()}`);
    window.setTimeout(() => setPrintFrameUrl(""), 5000);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function updateSettingValue(key, value) {
    setSettingsMap((current) => ({ ...current, [key]: value }));
  }

  async function saveSettingsGroup(fields) {
    for (const field of fields) {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: field.key,
          value: String(settingsMap[field.key] ?? ""),
        }),
      });
      const result = await res.json();

      if (!result.success) {
        toast(result.error || t("manager.settingsSaveFailed"), "error");
        return;
      }
    }

    showUiToast("settingsSaved");
    await loadSettingsOnly();
  }

  function updateInvoiceLayoutValue(key, value) {
    setInvoiceLayouts((current) => ({
      ...current,
      [invoiceDesignerTab]: {
        ...current[invoiceDesignerTab],
        [key]: value,
      },
    }));
  }

  async function saveInvoiceSettings() {
    const invoiceFields = [
      ...settingsGroups.invoice.map((field) => ({ key: field.key, value: String(settingsMap[field.key] ?? "") })),
      { key: "INVOICE_LAYOUT_CONFIG", value: JSON.stringify(invoiceLayouts) },
    ];

    for (const field of invoiceFields) {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(field),
      });
      const result = await res.json();
      if (!result.success) {
        toast(result.error || t("manager.settingsSaveFailed"), "error");
        return;
      }
    }
    showUiToast("settingsSaved");
    await loadSettingsOnly();
  }

  function renderSettingsFields(fields) {
    const categoryOptions = [...new Map(products.map((product) => [
      product.categoryId || product.categoryName,
      {
        id: product.categoryId || product.categoryName,
        name: product.categoryName || product.categoryId,
      },
    ]).filter(([id]) => Boolean(id))).values()];

    function updateKitchenTicketRules(part, value, checked) {
      const currentRules = parseKitchenTicketRules(settingsMap.KITCHEN_TICKET_CATEGORIES);
      const selected = new Set(currentRules[part] || []);

      if (checked) {
        selected.add(value);
      } else {
        selected.delete(value);
      }

      updateSettingValue("KITCHEN_TICKET_CATEGORIES", kitchenTicketRuleValue({
        ...currentRules,
        [part]: [...selected],
      }));
    }

    function renderKitchenTicketRules(field) {
      const rules = parseKitchenTicketRules(settingsMap[field.key]);
      const selectedCategoryIds = new Set(rules.categoryIds || []);
      const selectedCategoryNames = new Set((rules.categoryNames || []).map((name) => String(name || "").toLowerCase()));
      const selectedProductIds = new Set(rules.productIds || []);

      return (
        <div className="admin-setting-field kitchen-ticket-settings">
          <span>{field.label}</span>
          <div className="settings-check-grid">
            <div>
              <b>{t("settings.kitchenTicketCategoryList")}</b>
              <div className="settings-check-list">
                {categoryOptions.map((category) => (
                  <label className="toggle-row" key={category.id}>
                    <input
                      type="checkbox"
                      checked={selectedCategoryIds.has(category.id) || selectedCategoryNames.has(String(category.name || "").toLowerCase())}
                      onChange={(event) => updateKitchenTicketRules("categoryIds", category.id, event.target.checked)}
                    />
                    <span>{category.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <b>{t("settings.kitchenTicketProductList")}</b>
              <div className="settings-check-list">
                {products.map((product) => (
                  <label className="toggle-row" key={product.id}>
                    <input
                      type="checkbox"
                      checked={selectedProductIds.has(product.id)}
                      onChange={(event) => updateKitchenTicketRules("productIds", product.id, event.target.checked)}
                    />
                    <span>{product.name} <small>{product.categoryName}</small></span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <small className="muted">{t("settings.kitchenTicketRulesHint")}</small>
        </div>
      );
    }

    return (
      <div className="admin-settings-grid">
        {fields.map((field) => field.type === "kitchenTicketRules" ? (
          <div key={field.key}>{renderKitchenTicketRules(field)}</div>
        ) : (
          <label className="admin-setting-field" key={field.key}>
            <span>{field.label}</span>
            {field.type === "select" ? (
              <select
                aria-label={field.label}
                value={settingsMap[field.key] ?? field.defaultValue ?? ""}
                onChange={(event) => updateSettingValue(field.key, event.target.value)}
              >
                {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : field.type === "checkbox" ? (
              <span className="toggle-row setting-toggle">
                <input
                  type="checkbox"
                  checked={["1", "true", "yes", "on"].includes(String(settingsMap[field.key] ?? field.defaultValue ?? "").toLowerCase())}
                  onChange={(event) => updateSettingValue(field.key, event.target.checked ? "true" : "false")}
                />
                <span>{["1", "true", "yes", "on"].includes(String(settingsMap[field.key] ?? field.defaultValue ?? "").toLowerCase()) ? t("common.yes") : t("common.no")}</span>
              </span>
            ) : (
              <input
                type={field.type || "text"}
                min={field.min}
                value={settingsMap[field.key] ?? field.defaultValue ?? ""}
                onChange={(event) => updateSettingValue(field.key, event.target.value)}
              />
            )}
          </label>
        ))}
      </div>
    );
  }

  function settingsSection(tab, title, hint, fields) {
    if (settingsTab !== tab) return null;

    return (
      <section className="employee-manager">
        <div className="row">
          <div>
            <h3>{title}</h3>
            <div className="muted">{hint}</div>
          </div>
          <button className="btn-confirm" onClick={() => saveSettingsGroup(fields)}>{t("common.save")}</button>
        </div>
        {renderSettingsFields(fields)}
      </section>
    );
  }

  function invoiceLayoutLabel(type) {
    if (type === "front") return t("settings.invoiceFront");
    if (type === "restaurant") return t("settings.invoiceRestaurant");
    return t("settings.invoiceData");
  }

  function renderInvoiceSettings() {
    if (settingsTab !== "invoice") return null;

    const layout = invoiceLayouts[invoiceDesignerTab] || defaultInvoiceLayout;
    const invoicePreviewStyle = {
      "--invoice-width": layout.paperSize === "A4" ? "190mm" : layout.paperSize,
      "--invoice-font-size": `${Number(layout.fontSize) || 11}px`,
      "--invoice-line-height": Number(layout.lineHeight) || 1.25,
      "--invoice-logo-width": `${Number(layout.logoWidthMm) || 38}mm`,
      "--invoice-qr-size": `${Number(layout.qrSizeMm) || 30}mm`,
    };
    const booleanFields = [
      ["showLogo", t("settings.invoiceShowLogo")],
      ["showCompany", t("settings.invoiceShowCompany")],
      ["showBranch", t("settings.invoiceShowBranch")],
      ["showTin", t("settings.invoiceShowTin")],
      ["showSerial", t("settings.invoiceShowSerial")],
      ["showOrderId", t("settings.invoiceShowOrderId")],
      ["showBracelet", t("settings.invoiceShowBracelet")],
      ["showCustomer", t("settings.invoiceShowCustomer")],
      ["showPhone", t("settings.invoiceShowPhone")],
      ["showChildren", t("settings.invoiceShowChildren")],
      ["showCashier", t("settings.invoiceShowCashier")],
      ["showEmployee", t("settings.invoiceShowEmployee")],
      ["showPayment", t("settings.invoiceShowPayment")],
      ["showSystemRegistration", t("settings.invoiceShowSystem")],
      ["showTax", t("settings.showTax")],
      ["showQr", t("settings.invoiceShowQr")],
      ["showFooter", t("settings.invoiceShowFooter")],
    ];

    return (
      <section className="employee-manager invoice-designer-section">
        <div className="row">
          <div>
            <h3>{t("settings.invoiceSettings")}</h3>
            <div className="muted">{t("settings.invoiceDesignerHint")}</div>
          </div>
          <button className="btn-confirm" onClick={saveInvoiceSettings}>{t("common.save")}</button>
        </div>
        {renderSettingsFields(settingsGroups.invoice)}
        <div className="tabs invoice-layout-tabs">
          {invoiceLayoutTypes.map((type) => (
            <button key={type} className={invoiceDesignerTab === type ? "active" : ""} onClick={() => setInvoiceDesignerTab(type)}>
              {invoiceLayoutLabel(type)}
            </button>
          ))}
        </div>
        <div className="invoice-designer-grid">
          <div className="invoice-layout-editor">
            <div className="form-grid invoice-layout-form">
              <label>
                <span>{t("settings.invoiceLogo")}</span>
                <input value={layout.logoUrl || ""} onChange={(event) => updateInvoiceLayoutValue("logoUrl", event.target.value)} />
              </label>
              <label>
                <span>{t("settings.footerMessage")}</span>
                <input value={layout.footerMessage || ""} onChange={(event) => updateInvoiceLayoutValue("footerMessage", event.target.value)} />
              </label>
              <label>
                <span>{t("settings.paperSize")}</span>
                <select value={layout.paperSize || "80mm"} onChange={(event) => updateInvoiceLayoutValue("paperSize", event.target.value)}>
                  <option value="80mm">80mm</option>
                  <option value="58mm">58mm</option>
                  <option value="A4">A4</option>
                </select>
              </label>
              <label>
                <span>{t("settings.invoiceFontSize")}</span>
                <input type="number" min="8" max="24" value={layout.fontSize} onChange={(event) => updateInvoiceLayoutValue("fontSize", event.target.value)} />
              </label>
              <label>
                <span>{t("settings.invoiceLineHeight")}</span>
                <input type="number" min="1" max="2" step="0.05" value={layout.lineHeight} onChange={(event) => updateInvoiceLayoutValue("lineHeight", event.target.value)} />
              </label>
              <label>
                <span>{t("settings.invoiceLogoWidth")}</span>
                <input type="number" min="10" max="90" value={layout.logoWidthMm} onChange={(event) => updateInvoiceLayoutValue("logoWidthMm", event.target.value)} />
              </label>
              <label>
                <span>{t("settings.invoiceQrSize")}</span>
                <input type="number" min="12" max="70" value={layout.qrSizeMm} onChange={(event) => updateInvoiceLayoutValue("qrSizeMm", event.target.value)} />
              </label>
            </div>
            <div className="invoice-layout-toggles">
              {booleanFields.map(([key, label]) => (
                <label className="toggle-row" key={key}>
                  <input type="checkbox" checked={Boolean(layout[key])} onChange={(event) => updateInvoiceLayoutValue(key, event.target.checked)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="invoice-preview-wrap">
            <div className="invoice invoice-preview" style={invoicePreviewStyle}>
              {layout.showLogo && <div className="invoice-logo-wrap"><img src={layout.logoUrl || "/bb-logo.png"} alt="Billy Beez" className="invoice-logo" /></div>}
              <div className="receipt-center">
                {layout.showCompany && <><b>{t("invoice.welcome")}</b><div>{settingsMap.COMPANY_NAME || "BillyBeez"}</div></>}
                {layout.showBranch && <div>{settingsMap.BRANCH_NAME || "BillyBeez MOA"}</div>}
                {layout.showTin && <div>{t("invoice.tin")}: {settingsMap.BRANCH_TIN || "474-214-206"}</div>}
              </div>
              <div className="receipt-rule" />
              <div className="receipt-meta">
                {layout.showSerial && <><span>{t("invoice.serial")}</span><b>0000100001</b></>}
                {layout.showOrderId && <><span>{t("common.orderId")}</span><b>ORD#24</b></>}
                {layout.showBracelet && <><span>{t("common.bracelet")}</span><b>211333</b></>}
                <span>{t("invoice.date")}</span><b>12:45 PM</b>
                {layout.showCustomer && <><span>{t("common.customer")}</span><b>Ahmed Salam</b></>}
                {layout.showPhone && <><span>{t("common.phone")}</span><b>01027606747</b></>}
                {layout.showChildren && <><span>{t("common.children")}</span><b>Adam, Salim</b></>}
                {layout.showCashier && <><span>{t("common.cashier")}</span><b>Admin</b></>}
                {layout.showEmployee && <><span>{t("common.employee")}</span><b>محمد جمال</b></>}
                {layout.showPayment && <><span>{t("common.payment")}</span><b>{t("common.cash")}</b></>}
                {layout.showSystemRegistration && <><span>{t("common.geideaRegisteredBy")}</span><b>محمد أيمن · 12:46 PM</b></>}
              </div>
              <div className="receipt-rule" />
              <div className="receipt-items">
                <div className="receipt-item receipt-item-head"><span>{t("invoice.item")}</span><span>{t("common.qty")}</span><span>{t("invoice.rate")}</span><span>{t("invoice.amount")}</span></div>
                <div className="receipt-item"><span>Pepsi</span><span>1</span><span>30.00</span><b>30.00</b></div>
                <div className="receipt-item"><span>Chicken Burger</span><span>1</span><span>155.00</span><b>155.00</b></div>
              </div>
              <div className="receipt-rule" />
              <div className="receipt-totals">
                <span>{t("invoice.subtotal")}</span><b>185.00</b>
                {layout.showTax && <><span>VAT {settingsMap.INVOICE_TAX_RATE || 14}%</span><b>25.90</b></>}
                <span>{t("common.orderTotal")}</span><b>185.00</b>
              </div>
              {layout.showQr && <><div className="receipt-rule" /><div className="receipt-qr"><div className="invoice-qr-placeholder">QR</div><span>{t("invoice.qrCode")}</span></div></>}
              {layout.showFooter && <><div className="receipt-rule" /><div className="receipt-footer"><div>{layout.footerMessage || settingsMap.INVOICE_FOOTER_MESSAGE || t("invoice.thanks")}</div><div>{t("invoice.contact")}: {settingsMap.INVOICE_CONTACT_NUMBER || "19881"}</div></div></>}
            </div>
          </div>
        </div>
      </section>
    );
  }

  function paymentButtonClass(order, method, baseClass) {
    return `${baseClass} ${order.paymentStatus === "PAID" && order.paymentMethod === method ? "payment-selected" : ""}`;
  }

  function orderStageClass(order) {
    if (order.geideaRegisteredAt) return "meta-system";
    if (order.paymentStatus === "PAID") return order.paymentMethod === "VISA" ? "meta-visa" : "meta-cash";
    if (order.kitchenStatus === "DELIVERED") return "meta-delivered";
    return order.kitchenPrintJob ? "meta-preparing" : "meta-pending";
  }

  function filterLabel(item) {
    if (item === "ALL") return t("common.all");
    if (item === "UNPAID") return t("common.unpaid");
    return labelMethod(item);
  }

  function archiveLabel(item) {
    if (item === "ALL") return t("common.all");
    if (item === "ACTIVE") return t("common.active");
    if (item === "UNREGISTERED") return t("manager.notRegisteredGeidea");
    return t("common.archived");
  }

  function labelDeviceType(type) {
    if (type === "FRONT") return t("manager.frontDevice");
    if (type === "KITCHEN") return t("manager.restaurantDevice");
    if (type === "KITCHEN_CASHIER") return t("manager.kitchenCashierDevice");
    return type || "-";
  }

  function orderSourceKey(order) {
    if (order.deviceType === "FRONT") return "FRONT";
    if (order.deviceType === "KITCHEN_CASHIER") return "QUICK_RESTAURANT";
    const items = order.items || [];
    if (items.some((item) => item.department === "KITCHEN_CASHIER")) return "QUICK_RESTAURANT";
    if (items.some((item) => item.department === "KITCHEN")) return "DATA_RESTAURANT";
    return "DATA";
  }

  function labelOrderSource(source) {
    return t(`source.${source}`);
  }

  function labelPaymentProviderType(type) {
    if (type === "CASH") return t("common.cash");
    if (type === "VISA") return t("common.visa");
    if (type === "CUSTOM") return t("manager.customPayment");
    return type || "-";
  }

  function restaurantEmployees() {
    return employees.filter((employee) => isRestaurantEmployee(employee) && employee.active);
  }

  function confirmDanger(message = t("manager.confirmDanger")) {
    return window.confirm(message);
  }

  function applyOrderUpdate(updatedOrder) {
    if (!updatedOrder) return false;

    setData((current) => {
      if (!current?.orders) return current;
      const exists = current.orders.some((order) => order.id === updatedOrder.id);
      const nextOrders = exists
        ? current.orders.map((order) => order.id === updatedOrder.id ? updatedOrder : order)
        : [updatedOrder, ...current.orders];
      return { ...current, orders: nextOrders };
    });

    setSelectedOrder((current) => current?.id === updatedOrder.id ? updatedOrder : current);
    return true;
  }

  async function refreshAfterOrderChange(orderId, closeModal = false, updatedOrder = null) {
    if (!applyOrderUpdate(updatedOrder)) await load();

    if (closeModal) {
      setSelectedOrder(null);
      return;
    }

    if (updatedOrder) return;

    const res = await fetch(`/api/orders/${orderUrlId(orderId)}`);
    const result = await res.json();
    if (result.success) setSelectedOrder(result.order);
  }

  function isUnclosedOrder(order) {
    const currentBusinessDate = data?.businessState?.businessDate;
    return Boolean(currentBusinessDate && order.businessDate && order.businessDate !== currentBusinessDate);
  }

  function orderBusinessDate(order) {
    return String(order?.businessDate || order?.createdAt || "").slice(0, 10);
  }

  function isCurrentSelectedDay() {
    return dateFilterMode === "DAY" && dateFilter.day && dateFilter.day === data?.reportBusinessDate;
  }

  function isOrderInSelectedPeriod(order) {
    const businessDate = orderBusinessDate(order);
    if (!businessDate) return false;
    if (dateFilterMode === "MONTH") {
      return dateFilter.month ? businessDate.startsWith(dateFilter.month) : true;
    }
    if (dateFilterMode === "YEAR") {
      return dateFilter.year ? businessDate.startsWith(dateFilter.year) : true;
    }
    if (dateFilterMode === "RANGE") {
      const from = dateFilter.from || "0000-01-01";
      const to = dateFilter.to || "9999-12-31";
      return businessDate >= from && businessDate <= to;
    }
    return dateFilter.day ? businessDate === dateFilter.day : true;
  }

  function selectedPeriodLabel() {
    if (dateFilterMode === "MONTH") return dateFilter.month || data?.reportBusinessDate?.slice(0, 7) || "";
    if (dateFilterMode === "YEAR") return dateFilter.year || data?.reportBusinessDate?.slice(0, 4) || "";
    if (dateFilterMode === "RANGE") return `${dateFilter.from || "..."} - ${dateFilter.to || "..."}`;
    return dateFilter.day || data?.reportBusinessDate || "";
  }

  function dateFromIso(day, offset = 0) {
    const date = new Date(`${day}T00:00:00`);
    date.setDate(date.getDate() + offset);
    return date.toISOString().slice(0, 10);
  }

  function monthLabel(monthValue) {
    if (!monthValue) return "";
    const date = new Date(`${monthValue}-01T00:00:00`);
    return date.toLocaleDateString(language === "ar" ? "ar-EG" : "en-US", { month: "long", year: "numeric" });
  }

  function dayNameLabels() {
    return language === "ar" ? ["س", "ح", "ن", "ث", "ر", "خ", "ج"] : ["S", "M", "T", "W", "T", "F", "S"];
  }

  function calendarDays() {
    const month = calendarMonth || dateFilter.month || data?.reportBusinessDate?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const [year, monthNumber] = month.split("-").map(Number);
    const first = new Date(year, monthNumber - 1, 1);
    const daysInMonth = new Date(year, monthNumber, 0).getDate();
    const startOffset = first.getDay();
    const days = Array.from({ length: startOffset }, () => null);
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(`${month}-${String(day).padStart(2, "0")}`);
    }
    return days;
  }

  function shiftCalendarMonth(step) {
    const month = calendarMonth || data?.reportBusinessDate?.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const [year, monthNumber] = month.split("-").map(Number);
    const next = new Date(year, monthNumber - 1 + step, 1);
    setCalendarMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  }

  function applyDatePreset(mode) {
    const baseDay = data?.reportBusinessDate || new Date().toISOString().slice(0, 10);
    const targetDay = mode === "YESTERDAY" ? dateFromIso(baseDay, -1) : baseDay;
    const month = calendarMonth || targetDay.slice(0, 7);
    const year = month.slice(0, 4);
    if (mode === "DAY" || mode === "YESTERDAY") {
      const day = targetDay;
      setDateFilterMode(mode);
      setCalendarMonth(day.slice(0, 7));
      setDateFilter({ day, month: day.slice(0, 7), year: day.slice(0, 4), from: day, to: day });
      setDatePickerOpen(false);
      return;
    }
    if (mode === "MONTH") {
      setDateFilterMode("MONTH");
      setDateFilter((current) => ({ ...current, day: `${month}-01`, month, year, from: `${month}-01`, to: `${month}-31` }));
      setDatePickerOpen(false);
      return;
    }
    if (mode === "YEAR") {
      setDateFilterMode("YEAR");
      setDateFilter((current) => ({ ...current, day: `${year}-01-01`, month: `${year}-01`, year, from: `${year}-01-01`, to: `${year}-12-31` }));
      setDatePickerOpen(false);
    }
  }

  function applyMonthToDate() {
    const nextFilter = monthToDateFilter(data?.reportBusinessDate || cairoTodayIso());
    setDateFilterMode("RANGE");
    setCalendarMonth(nextFilter.month);
    setDateFilter(nextFilter);
    setDatePickerOpen(false);
  }

  function selectCalendarDay(day) {
    if (!day) return;
    const month = day.slice(0, 7);
    if (dateFilterMode === "RANGE" && dateFilter.from && dateFilter.from === dateFilter.to) {
      const from = day < dateFilter.from ? day : dateFilter.from;
      const to = day < dateFilter.from ? dateFilter.from : day;
      setDateFilter((current) => ({ ...current, from, to, day: from, month: from.slice(0, 7), year: from.slice(0, 4) }));
      return;
    }
    setDateFilterMode("RANGE");
    setDateFilter((current) => ({ ...current, day, month, year: day.slice(0, 4), from: day, to: day }));
  }

  function calendarDayClass(day) {
    if (!day) return "empty";
    if (dateFilterMode === "RANGE") {
      if (day === dateFilter.from || day === dateFilter.to) return "selected";
      if (dateFilter.from && dateFilter.to && day > dateFilter.from && day < dateFilter.to) return "in-range";
      return "";
    }
    return day === dateFilter.day ? "selected" : "";
  }

  function renderDateRangePicker() {
    return (
      <div className="date-range-control">
        <button type="button" className="date-picker-trigger" onClick={() => setDatePickerOpen((current) => !current)} aria-expanded={datePickerOpen}>
          <span className="date-range-icon" aria-hidden="true" />
          <span className="date-picker-label">{selectedPeriodLabel() || t("manager.dateRange")}</span>
        </button>
        {datePickerOpen && (
          <div className="date-picker-popover">
            <div className="date-picker-tabs">
              {[
                ["DAY", t("manager.rangeToday"), () => applyDatePreset("DAY")],
                ["YESTERDAY", t("manager.rangeYesterday"), () => applyDatePreset("YESTERDAY")],
                ["MONTH", t("manager.rangeMonth"), () => applyDatePreset("MONTH")],
                ["YEAR", t("manager.rangeYear"), () => applyDatePreset("YEAR")],
              ].map(([mode, label, onClick]) => (
                <button key={mode} type="button" className={dateFilterMode === mode ? "secondary" : ""} onClick={onClick}>{label}</button>
              ))}
            </div>
            <div className="date-picker-head">
              <button type="button" className="icon-step" onClick={() => shiftCalendarMonth(-1)}>‹</button>
              <b>{monthLabel(calendarMonth || dateFilter.month)}</b>
              <button type="button" className="icon-step" onClick={() => shiftCalendarMonth(1)}>›</button>
            </div>
            <div className="weekday-grid">{dayNameLabels().map((day) => <span key={day}>{day}</span>)}</div>
            <div className="calendar-grid">
              {calendarDays().map((day, index) => (
                <button type="button" key={day || `empty-${index}`} className={calendarDayClass(day)} disabled={!day} onClick={() => selectCalendarDay(day)}>
                  {day ? Number(day.slice(-2)) : ""}
                </button>
              ))}
            </div>
            <div className="date-picker-foot">
              <span>{selectedPeriodLabel()}</span>
              <button type="button" className="btn-confirm" onClick={() => setDatePickerOpen(false)}>{t("common.save")}</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const currentArchivedOrders = useMemo(
    () => (data?.orders || []).filter((order) => order.archivedAt).map((order) => ({ ...order, isCurrentArchive: true })),
    [data],
  );

  const duplicateActiveBracelets = useMemo(() => {
    const bracelets = new Map();
    (data?.orders || []).forEach((order) => {
      if (order.archivedAt) return;
      const bracelet = String(order.braceletNo || "").trim();
      if (!bracelet) return;
      const orders = bracelets.get(bracelet) || [];
      orders.push(order);
      bracelets.set(bracelet, orders);
    });
    return Array.from(bracelets.entries())
      .filter(([, orders]) => orders.length > 1)
      .map(([bracelet, orders]) => ({ bracelet, orders }));
  }, [data]);

  const healthRows = useMemo(() => {
    const activeOrders = (data?.orders || []).filter((order) => !order.archivedAt);
    const duplicateCount = duplicateActiveBracelets.reduce((sum, group) => sum + group.orders.length, 0);
    const paidNotGeidea = activeOrders.filter((order) => order.paymentStatus === "PAID" && !order.geideaRegisteredAt);
    const leftUnpaidOrders = activeOrders.filter((order) => order.customerLeft && order.paymentStatus !== "PAID");
    const oldOpenOrders = activeOrders.filter((order) => data?.reportBusinessDate && order.businessDate && order.businessDate !== data.reportBusinessDate);
    const printFailed = activeOrders.filter((order) => order.kitchenPrintJob?.status === "FAILED");

    return [
      { key: "duplicates", label: t("manager.healthDuplicates"), value: duplicateCount, tone: duplicateCount ? "danger" : "ok", variant: "health-duplicates" },
      { key: "paidNotGeidea", label: t("manager.healthPaidNotGeidea"), value: paidNotGeidea.length, tone: paidNotGeidea.length ? "warning" : "ok", variant: "health-geidea" },
      { key: "leftUnpaid", label: t("manager.healthLeftUnpaid"), value: leftUnpaidOrders.length, tone: leftUnpaidOrders.length ? "danger" : "ok", variant: "health-unpaid" },
      { key: "oldOpen", label: t("manager.healthOldOpen"), value: oldOpenOrders.length, tone: oldOpenOrders.length ? "warning" : "ok", variant: "health-old" },
      { key: "printFailed", label: t("manager.healthPrintFailed"), value: printFailed.length, tone: printFailed.length ? "danger" : "ok", variant: "health-print" },
    ];
  }, [data, duplicateActiveBracelets, t]);

  const cleanupIssueGroups = useMemo(() => {
    const activeOrders = (data?.orders || []).filter((order) => !order.archivedAt);
    const duplicateOrders = duplicateActiveBracelets.flatMap((group) => group.orders.map((order) => ({ ...order, cleanupBraceletGroup: group.bracelet })));
    const paidNotGeidea = activeOrders.filter((order) => order.paymentStatus === "PAID" && !order.geideaRegisteredAt);
    const leftUnpaidOrders = activeOrders.filter((order) => order.customerLeft && order.paymentStatus !== "PAID");
    const oldOpenOrders = activeOrders.filter((order) => data?.reportBusinessDate && order.businessDate && order.businessDate !== data.reportBusinessDate);
    const printFailed = activeOrders.filter((order) => order.kitchenPrintJob?.status === "FAILED");

    return [
      { key: "duplicates", label: t("manager.healthDuplicates"), tone: "danger", rows: duplicateOrders },
      { key: "paidNotGeidea", label: t("manager.healthPaidNotGeidea"), tone: "warning", rows: paidNotGeidea },
      { key: "leftUnpaid", label: t("manager.healthLeftUnpaid"), tone: "danger", rows: leftUnpaidOrders },
      { key: "oldOpen", label: t("manager.healthOldOpen"), tone: "warning", rows: oldOpenOrders },
      { key: "printFailed", label: t("manager.healthPrintFailed"), tone: "danger", rows: printFailed },
    ].filter((group) => group.rows.length > 0);
  }, [data, duplicateActiveBracelets, t]);

  const historyRows = useMemo(
    () => [...currentArchivedOrders, ...(data?.orderHistory || [])],
    [currentArchivedOrders, data],
  );

  const allPeriodRows = useMemo(() => {
    const seen = new Set();
    return [...(data?.orders || []), ...(data?.orderHistory || [])].filter((order) => {
      const key = `${order.id || order.originalOrderId}-${order.businessDate || ""}-${order.isHistory ? "history" : "live"}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [data]);

  const visibleOrders = useMemo(() => {
    let rows = viewMode === "HISTORY" ? historyRows : data?.orders || [];
    if (viewMode !== "HISTORY" && !isCurrentSelectedDay()) rows = allPeriodRows;
    rows = rows.filter(isOrderInSelectedPeriod);

    const currentSelectedDay = isCurrentSelectedDay();

    if (filter === "UNPAID") rows = rows.filter((order) => order.paymentStatus !== "PAID");
    if (filter === "CASH" || filter === "VISA") rows = rows.filter((order) => order.paymentStatus === "PAID" && order.paymentMethod === filter);
    if (viewMode === "TODAY" && archiveFilter === "ALL" && currentSelectedDay) rows = rows.filter((order) => !isUnclosedOrder(order));
    if (viewMode === "TODAY" && archiveFilter === "ACTIVE") rows = rows.filter((order) => !order.archivedAt && (!currentSelectedDay || !isUnclosedOrder(order)));
    if (viewMode === "TODAY" && archiveFilter === "ARCHIVED") rows = rows.filter((order) => order.archivedAt && (!currentSelectedDay || !isUnclosedOrder(order)));
    if (viewMode === "TODAY" && archiveFilter === "UNREGISTERED") rows = rows.filter((order) => !order.geideaRegisteredAt);
    if (healthFilter !== "ALL") {
      const duplicateBracelets = new Set(duplicateActiveBracelets.map((group) => group.bracelet));
      rows = rows.filter((order) => {
        if (healthFilter === "duplicates") return duplicateBracelets.has(String(order.braceletNo || "").trim());
        if (healthFilter === "paidNotGeidea") return order.paymentStatus === "PAID" && !order.geideaRegisteredAt;
        if (healthFilter === "leftUnpaid") return order.customerLeft && order.paymentStatus !== "PAID";
        if (healthFilter === "oldOpen") return data?.reportBusinessDate && order.businessDate && order.businessDate !== data.reportBusinessDate && !order.archivedAt;
        if (healthFilter === "printFailed") return order.kitchenPrintJob?.status === "FAILED";
        return true;
      });
    }

    const search = query.trim().toLowerCase();
    if (search) {
      rows = rows.filter((order) => [
        order.id,
        order.businessDate,
        order.braceletNo,
        order.customerPhone,
        order.childNames,
        order.cashier,
        order.dataEmployee,
      ].some((value) => String(value || "").toLowerCase().includes(search)));
    }

    return rows;
  }, [data, viewMode, historyRows, allPeriodRows, filter, archiveFilter, healthFilter, duplicateActiveBracelets, query, dateFilterMode, dateFilter]);

  const renderedOrders = useMemo(
    () => visibleOrders.slice(0, orderRenderLimit),
    [visibleOrders, orderRenderLimit],
  );

  const periodOrders = useMemo(
    () => allPeriodRows.filter(isOrderInSelectedPeriod),
    [allPeriodRows, dateFilterMode, dateFilter],
  );

  const periodAuditLogs = useMemo(() => {
    return (data?.auditLogs || []).filter((log) => {
      const logDate = String(log.createdAt || "").slice(0, 10);
      return isDateInSelectedPeriod(logDate);
    });
  }, [data, dateFilterMode, dateFilter]);

  const periodOrderRecords = useMemo(() => {
    const search = recordQuery.trim().toLowerCase();
    return (data?.orderRecords || []).filter((record) => {
      const recordDate = record.businessDate || String(record.orderCreatedAt || record.createdAt || "").slice(0, 10);
      if (!isDateInSelectedPeriod(recordDate)) return false;
      if (!search) return true;
      return [record.braceletNo, record.orderId, record.childNames].some((value) => String(value || "").toLowerCase().includes(search));
    });
  }, [data, dateFilterMode, dateFilter, recordQuery]);

  const periodReports = useMemo(() => buildPeriodReports(periodOrders), [periodOrders]);

  function isDateInSelectedPeriod(dateValue) {
    if (!dateValue) return false;
    if (dateFilterMode === "MONTH") return dateFilter.month ? dateValue.startsWith(dateFilter.month) : true;
    if (dateFilterMode === "YEAR") return dateFilter.year ? dateValue.startsWith(dateFilter.year) : true;
    if (dateFilterMode === "RANGE") {
      const from = dateFilter.from || "0000-01-01";
      const to = dateFilter.to || "9999-12-31";
      return dateValue >= from && dateValue <= to;
    }
    return dateFilter.day ? dateValue === dateFilter.day : true;
  }

  function buildPeriodReports(orders) {
    const paymentMap = new Map();
    const productMap = new Map();
    const productQtyMap = new Map();
    const statusMap = new Map();
    const sourceMap = new Map();
    const cashierMap = new Map();
    const employeeMap = new Map();
    const braceletMap = new Map();
    const dayMap = new Map();
    let totalSales = 0;
    let paidSales = 0;
    let geideaCount = 0;

    orders.forEach((order) => {
      const total = Number(order.total) || 0;
      totalSales += total;
      if (order.paymentStatus === "PAID") paidSales += total;
      if (order.geideaRegisteredAt) geideaCount += 1;

      const paymentKey = order.paymentStatus === "PAID" ? (order.paymentMethod || "UNKNOWN") : "UNPAID";
      const paymentRow = paymentMap.get(paymentKey) || { method: paymentKey, count: 0, total: 0 };
      paymentRow.count += 1;
      paymentRow.total += paymentKey === "UNPAID" ? 0 : total;
      paymentMap.set(paymentKey, paymentRow);

      const sourceKey = orderSourceKey(order);
      const sourceRow = sourceMap.get(sourceKey) || { source: sourceKey, count: 0, total: 0, paidTotal: 0, unpaidTotal: 0 };
      sourceRow.count += 1;
      sourceRow.total += total;
      if (order.paymentStatus === "PAID") sourceRow.paidTotal += total;
      else sourceRow.unpaidTotal += total;
      sourceMap.set(sourceKey, sourceRow);

      const statusKey = order.archivedAt ? "ARCHIVED" : order.paymentStatus;
      const statusRow = statusMap.get(statusKey) || { status: statusKey, count: 0 };
      statusRow.count += 1;
      statusMap.set(statusKey, statusRow);

      const cashierName = order.cashier || "-";
      const cashierRow = cashierMap.get(cashierName) || { name: cashierName, total: 0 };
      cashierRow.total += total;
      cashierMap.set(cashierName, cashierRow);

      const employeeName = order.dataEmployee || "-";
      const employeeRow = employeeMap.get(employeeName) || { name: employeeName, total: 0 };
      employeeRow.total += total;
      employeeMap.set(employeeName, employeeRow);

      const bracelet = order.braceletNo || "-";
      const braceletRow = braceletMap.get(bracelet) || { bracelet, total: 0 };
      braceletRow.total += total;
      braceletMap.set(bracelet, braceletRow);

      const day = orderBusinessDate(order);
      if (day) {
        const dayRow = dayMap.get(day) || { date: day, total: 0 };
        dayRow.total += total;
        dayMap.set(day, dayRow);
      }

      (order.items || []).forEach((item) => {
        const name = item.name || "-";
        const productRow = productMap.get(name) || { name, total: 0 };
        productRow.total += Number(item.total) || 0;
        productMap.set(name, productRow);

        const qtyRow = productQtyMap.get(name) || { name, qty: 0 };
        qtyRow.qty += Number(item.qty) || 0;
        productQtyMap.set(name, qtyRow);
      });
    });

    const byTotal = (a, b) => b.total - a.total;
    const orderCount = orders.length;
    const topOrders = [...orders]
      .sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0))
      .slice(0, 6)
      .map((order) => ({
        id: order.id,
        braceletNo: order.braceletNo,
        childNames: order.childNames,
        total: Number(order.total) || 0,
        status: order.archivedAt ? "ARCHIVED" : order.paymentStatus,
      }));

    return {
      summary: {
        orderCount,
        totalSales,
        paidSales,
        averageOrder: orderCount ? totalSales / orderCount : 0,
        geideaRate: orderCount ? Math.round((geideaCount / orderCount) * 100) : 0,
      },
      paymentBreakdown: [...paymentMap.values()].sort(byTotal),
      sourceBreakdown: [...sourceMap.values()].sort(byTotal),
      topProducts: [...productMap.values()].sort(byTotal).slice(0, 8),
      topProductQty: [...productQtyMap.values()].sort((a, b) => b.qty - a.qty).slice(0, 8),
      statusBreakdown: [...statusMap.values()].sort((a, b) => b.count - a.count),
      cashierPerformance: [...cashierMap.values()].sort(byTotal).slice(0, 8),
      dataEmployeePerformance: [...employeeMap.values()].sort(byTotal).slice(0, 8),
      topBracelets: [...braceletMap.values()].sort(byTotal).slice(0, 8),
      dailySales: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
      topOrders,
    };
  }

  function recordActor(record, prefix) {
    return record[`${prefix}ByEmployeeName`] || record[`${prefix}ByUserName`] || "-";
  }

  function recordActorClass(record, prefix) {
    const employeeName = record[`${prefix}ByEmployeeName`];
    if (employeeName) return employeeGenderClass(employeeName);
    return record[`${prefix}ByUserName`] ? "general-account-name" : "";
  }

  function recordStep(record, prefix, dateKey, labelKey, extra = "") {
    const dateValue = record[dateKey];
    return (
      <div className={`record-step ${dateValue ? "done" : ""}`}>
        <b>{t(labelKey)}</b>
        <span>{dateValue ? formatDateTime(dateValue) : "-"}</span>
        <small>{dateValue ? `${recordActor(record, prefix)}${extra ? ` · ${extra}` : ""}` : "-"}</small>
      </div>
    );
  }

  function recordStepText(record, prefix, dateKey, extra = "") {
    const dateValue = record[dateKey];
    if (!dateValue) return "-";
    const actor = recordActor(record, prefix);
    return `${formatRecordTime(dateValue)} - ${actor}${extra ? ` - ${extra}` : ""}`;
  }

  function recordStepCell(record, prefix, dateKey, extra = "", extraClassName = "") {
    const dateValue = record[dateKey];
    if (!dateValue) return <span className="record-step-empty">-</span>;
    const actor = recordActor(record, prefix);
    return (
      <span className="record-step-cell">
        <b>{formatRecordTime(dateValue)}</b>
        <small>
          <span className={recordActorClass(record, prefix)}>{actor}</span>
          {extra ? <em className={extraClassName}> - {extra}</em> : null}
        </small>
      </span>
    );
  }

  function archiveStepCell(record) {
    if (!record.archivedAt) return <span className="record-step-empty">-</span>;
    return (
      <span className="record-step-cell">
        <b>{formatRecordTime(record.archivedAt)}</b>
      </span>
    );
  }

  function recordLastActivity(record) {
    return (data?.auditLogs || []).find((log) => log.orderId === record.orderId);
  }

  function recordActivityCell(record) {
    const activity = recordLastActivity(record);
    if (!activity) return <span className="record-step-empty">-</span>;
    return (
      <span className="record-step-cell record-activity-cell">
        <b>{formatRecordTime(activity.createdAt)}</b>
        <small><span className="general-account-name">{activity.user || "System"}</span></small>
        <em>{labelAudit(activity.summary || activity.action)}</em>
      </span>
    );
  }

  function formatRecordTime(dateValue) {
    return formatCairoTime(dateValue);
  }

  function formatRecordDateHeading(dateValue) {
    if (!dateValue) return "";
    return formatCairoDateLabel(`${String(dateValue).slice(0, 10)}T00:00:00`);
  }

  function recordDateHeading() {
    const dateValue = periodOrderRecords[0]?.businessDate || dateFilter.day || data?.reportBusinessDate || "";
    const formatted = formatRecordDateHeading(dateValue);
    return formatted ? ` - ${formatted}` : "";
  }

  async function payOrder(orderId, paymentMethod, paymentEmployeeId = managerPaymentEmployeeId) {
    const res = await fetch(`/api/orders/${orderUrlId(orderId)}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethod, paymentEmployeeId }),
    });
    const result = await res.json();
    if (result.success) {
      toast(
        formatUiMessage(uiMessages.paymentSaved, { method: labelMethod(paymentMethod) }),
        "info",
        uiMessageStyle(uiMessages.paymentSaved)
      );
      await refreshAfterOrderChange(orderId, false, result.order);
    } else {
      toast(result.error || t("manager.paymentUpdateFailed"), "error");
    }
  }

  async function runOrderAction(orderId, action, body = null, closeModal = false) {
    if (["archive", "unarchive"].includes(action) && !confirmDanger()) return;

    const actionPath = action === "geidea" ? "system" : action;
    const res = await fetch(`/api/orders/${orderUrlId(orderId)}/${actionPath}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.orderUpdateFailed"), "error");
      return;
    }

    showUiToast("orderUpdated");
    await refreshAfterOrderChange(orderId, closeModal, result.order);
  }

  async function mergeDuplicateOrders(targetOrder, sourceOrders) {
    if (!targetOrder || !sourceOrders.length || !confirmDanger()) return;

    const res = await fetch(`/api/orders/${orderUrlId(targetOrder.id)}/merge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceOrderIds: sourceOrders.map((order) => order.id) }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.mergeOrderFailed"), "error");
      return;
    }

    toast(t("manager.orderMerged"), "info");
    await refreshAfterOrderChange(targetOrder.id);
  }

  async function addOrderItem(orderId) {
    if (!orderItemForm.productId) {
      toast(t("manager.selectProductFirst"), "error");
      return;
    }

    const res = await fetch(`/api/orders/${orderUrlId(orderId)}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ productId: orderItemForm.productId, qty: orderItemForm.qty }] }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.orderUpdateFailed"), "error");
      return;
    }

    showUiToast("itemAdded");
    await refreshAfterOrderChange(orderId, false, result.order);
  }

  async function removeOrderItem(orderId, itemId) {
    if (!confirmDanger()) return;

    const res = await fetch(`/api/orders/${orderUrlId(orderId)}/items`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.orderUpdateFailed"), "error");
      return;
    }

    showUiToast("itemRemoved");
    await refreshAfterOrderChange(orderId, false, result.order);
  }

  function resetEmployeeForm() {
    setEmployeeForm(emptyEmployeeForm);
  }

  function resetEmployeeDepartmentForm() {
    setEmployeeDepartmentForm(emptyEmployeeDepartmentForm);
  }

  function resetProductForm() {
    setProductForm(emptyProductForm);
  }

  function resetCategoryForm() {
    setCategoryForm(emptyCategoryForm);
  }

  function resetUserForm() {
    setUserForm(emptyUserForm);
  }

  function resetDeviceForm() {
    setDeviceForm(emptyDeviceForm);
  }

  function resetPaymentProviderForm() {
    setPaymentProviderForm(emptyPaymentProviderForm);
  }

  function editEmployee(employee) {
    setEmployeeForm({
      id: employee.id,
      name: employee.name,
      department: employee.department,
      active: employee.active,
    });
  }

  function editEmployeeDepartment(department) {
    setEmployeeDepartmentForm({
      id: department.id,
      name: department.name || "",
      nameEn: department.nameEn || "",
      kind: department.kind || "DATA",
      active: department.active !== false,
      locked: Boolean(department.locked),
    });
  }

  function editProduct(product) {
    const availabilityRules = parseProductAvailabilityRules(product.availabilityRules);
    setProductForm({
      id: product.id,
      name: product.name,
      price: product.price,
      originalPrice: product.originalPrice ?? "",
      netSales: product.netSales ?? "",
      taxAmount: product.taxAmount ?? "",
      taxRate: product.taxRate ?? "",
      etaItemCode: product.etaItemCode || "",
      etaCodeType: product.etaCodeType || "",
      etaUnitType: product.etaUnitType || "",
      etaTaxType: product.etaTaxType || "",
      etaTaxSubType: product.etaTaxSubType || "",
      department: product.department || "KITCHEN",
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      imageUrl: product.imageUrl || "",
      iconText: product.iconText || "",
      cardColorStart: product.cardColorStart || "#3d1859",
      cardColorEnd: product.cardColorEnd || "#8a62b2",
      cardTextColor: product.cardTextColor || "#ffffff",
      cardAccentColor: product.cardAccentColor || "#e31937",
      availabilityDays: availabilityRules.days,
      availabilityStartTime: availabilityRules.startTime,
      availabilityEndTime: availabilityRules.endTime,
      popular: product.popular,
      printOnKitchen: product.printOnKitchen !== false,
      showInDataOrder: product.department === "KITCHEN" && product.showInDataOrder !== false,
      showInQuickOrder: product.department !== "ENTRANCE" && product.showInQuickOrder !== false,
      active: product.active,
      sortOrder: product.sortOrder || 100,
    });
  }

  function editUser(user) {
    setUserForm({
      id: user.id,
      accountType: user.accountType || (user.employeeId ? "EMPLOYEE" : "GENERAL"),
      employeeId: user.employeeId || "",
      name: user.name,
      username: user.username,
      password: "",
      role: user.role,
      active: user.active,
    });
  }

  function editCategory(category) {
    const availabilityRules = parseProductAvailabilityRules(category.availabilityRules);
    setCategoryForm({
      id: category.id,
      name: category.name,
      department: category.department || "KITCHEN",
      color: category.color || "#3d1859",
      availabilityDays: availabilityRules.days,
      availabilityStartTime: availabilityRules.startTime,
      availabilityEndTime: availabilityRules.endTime,
      active: category.active,
      showInDataOrder: category.department === "KITCHEN" && category.showInDataOrder !== false,
      showInQuickOrder: category.department !== "ENTRANCE" && category.showInQuickOrder !== false,
      sortOrder: category.sortOrder || 100,
    });
  }

  function editDevice(device) {
    setDeviceForm({
      id: device.id,
      deviceNo: device.deviceNo || 1,
      name: device.name || "",
      type: device.type || "FRONT",
      active: device.active !== false,
      invoicePrinterName: device.invoicePrinterName || "",
      kitchenPrinterName: device.kitchenPrinterName || "",
      posSerial: device.posSerial || "",
      branchCode: device.branchCode || "",
    });
  }

  function editPaymentProvider(provider) {
    setPaymentProviderForm({
      id: provider.id,
      name: provider.name || "",
      type: provider.type || "CUSTOM",
      method: provider.method || "CUSTOM_1",
      active: provider.active !== false,
      editable: provider.editable !== false,
      showInFrontOrder: provider.showInFrontOrder !== false,
      showInDataOrder: provider.showInDataOrder !== false,
      showInQuickOrder: provider.showInQuickOrder !== false,
      sortOrder: provider.sortOrder || 100,
      reportBucket: provider.reportBucket || provider.type || "CUSTOM",
    });
  }

  async function saveEmployee() {
    const method = employeeForm.id ? "PATCH" : "POST";
    const res = await fetch("/api/employees", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(employeeForm),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.employeeSaveFailed"), "error");
      return;
    }

    showUiToast("employeeSaved");
    resetEmployeeForm();
    await loadEmployees();
  }

  async function saveEmployeeDepartments(nextDepartments) {
    const value = employeeDepartmentValue(nextDepartments);
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "EMPLOYEE_DEPARTMENT_CONFIG", value }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.departmentSaveFailed"), "error");
      return false;
    }

    setSettingsMap((current) => ({ ...current, EMPLOYEE_DEPARTMENT_CONFIG: value }));
    toast(t("manager.departmentSaved"), "success");
    return true;
  }

  async function saveEmployeeDepartment() {
    const id = normalizeDepartmentId(employeeDepartmentForm.id);
    const name = employeeDepartmentForm.name.trim();
    const nameEn = employeeDepartmentForm.nameEn.trim();

    if (!id || !name) {
      toast(t("manager.departmentRequired"), "error");
      return;
    }

    const existing = employeeDepartments.find((department) => department.id === id);
    const nextDepartments = [
      ...employeeDepartments.filter((department) => department.id !== id),
      {
        id,
        name,
        nameEn: nameEn || name,
        kind: employeeDepartmentForm.kind === "KITCHEN" ? "KITCHEN" : "DATA",
        active: employeeDepartmentForm.active !== false,
        locked: Boolean(existing?.locked || employeeDepartmentForm.locked),
      },
    ];

    const saved = await saveEmployeeDepartments(nextDepartments);
    if (saved) resetEmployeeDepartmentForm();
  }

  async function toggleEmployeeDepartment(department) {
    if (department.locked) {
      toast(t("manager.departmentLocked"), "error");
      return;
    }
    if (!confirmDanger()) return;

    const nextDepartments = employeeDepartments.map((item) => (
      item.id === department.id ? { ...item, active: !item.active } : item
    ));
    await saveEmployeeDepartments(nextDepartments);
  }

  async function toggleEmployee(employee) {
    if (!confirmDanger()) return;

    const res = await fetch("/api/employees", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: employee.id,
        name: employee.name,
        department: employee.department,
        active: !employee.active,
      }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.employeeSaveFailed"), "error");
      return;
    }

    showUiToast("employeeSaved");
    await loadEmployees();
  }

  async function saveProduct() {
    const method = productForm.id ? "PATCH" : "POST";
    const productPayload = {
      ...productForm,
      showInDataOrder: productForm.department === "KITCHEN" && productForm.showInDataOrder !== false,
      showInQuickOrder: productForm.department !== "ENTRANCE" && productForm.showInQuickOrder !== false,
      printOnKitchen: productForm.department !== "ENTRANCE" && productForm.printOnKitchen !== false,
      availabilityRules: buildProductAvailabilityRules(productForm),
    };
    delete productPayload.availabilityDays;
    delete productPayload.availabilityStartTime;
    delete productPayload.availabilityEndTime;
    const res = await fetch("/api/products", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(productPayload),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.productSaveFailed"), "error");
      return;
    }

    showUiToast("productSaved");
    resetProductForm();
    await loadProducts();
    await loadCategories();
  }

  async function saveCategory() {
    const method = categoryForm.id ? "PATCH" : "POST";
    const payload = {
      ...categoryForm,
      showInDataOrder: categoryForm.department === "KITCHEN" && categoryForm.showInDataOrder !== false,
      showInQuickOrder: categoryForm.department !== "ENTRANCE" && categoryForm.showInQuickOrder !== false,
      availabilityRules: buildProductAvailabilityRules(categoryForm),
    };
    delete payload.availabilityDays;
    delete payload.availabilityStartTime;
    delete payload.availabilityEndTime;
    const res = await fetch("/api/categories", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.categorySaveFailed"), "error");
      return;
    }

    toast(t("manager.categorySaved"), "success");
    resetCategoryForm();
    await loadCategories();
  }

  function exportCustomersCsv() {
    const queryPart = customerFilter.trim() ? `&q=${encodeURIComponent(customerFilter.trim())}` : "";
    window.open(`/api/customers?export=csv${queryPart}`, "_blank", "noopener,noreferrer");
  }

  async function toggleProduct(product) {
    if (!confirmDanger()) return;

    const res = await fetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...product, active: !product.active }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.productSaveFailed"), "error");
      return;
    }

    showUiToast("productSaved");
    await loadProducts();
  }

  async function toggleCategory(category) {
    if (!confirmDanger()) return;

    const res = await fetch("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...category, active: !category.active }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.categorySaveFailed"), "error");
      return;
    }

    toast(t("manager.categorySaved"), "success");
    await loadCategories();
  }

  function toggleProductSelection(productId) {
    setSelectedProductIds((current) => (
      current.includes(productId)
        ? current.filter((id) => id !== productId)
        : [...current, productId]
    ));
  }

  function selectVisibleProducts() {
    setSelectedProductIds([...new Set(visibleProductsSettings.map((product) => product.id))]);
  }

  function clearProductSelection() {
    setSelectedProductIds([]);
  }

  async function bulkUpdateProducts(updates) {
    if (!selectedProductIds.length) {
      toast(t("manager.noProductsSelected"), "error");
      return;
    }

    const res = await fetch("/api/products", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedProductIds, updates }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.productSaveFailed"), "error");
      return;
    }

    toast(t("manager.bulkProductsSaved"), "success");
    clearProductSelection();
    await loadProducts();
  }

  async function rankProductsBySales() {
    const ids = selectedProductIds.length ? selectedProductIds : visibleProductsSettings.map((product) => product.id);

    if (!ids.length) {
      toast(t("manager.noProductsSelected"), "error");
      return;
    }

    const res = await fetch("/api/products", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids, rankBySales: true }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.productSaveFailed"), "error");
      return;
    }

    toast(t("manager.productsRankedBySales"), "success");
    clearProductSelection();
    await loadProducts();
  }

  async function saveUser() {
    const method = userForm.id ? "PATCH" : "POST";
    const res = await fetch("/api/users", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(userForm),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.userSaveFailed"), "error");
      return;
    }

    showUiToast("userSaved");
    resetUserForm();
    await loadUsers();
  }

  async function toggleUser(user) {
    if (!confirmDanger()) return;

    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...user, password: "", active: !user.active }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.userSaveFailed"), "error");
      return;
    }

    showUiToast("userSaved");
    await loadUsers();
  }

  async function saveDevice() {
    const method = deviceForm.id ? "PATCH" : "POST";
    const res = await fetch("/api/devices", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...deviceForm,
        deviceNo: Number(deviceForm.deviceNo) || 1,
      }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.deviceSaveFailed"), "error");
      return;
    }

    toast(t("manager.deviceSaved"), "info");
    resetDeviceForm();
    await loadDevices();
  }

  async function toggleDevice(device) {
    if (!confirmDanger()) return;

    const res = await fetch("/api/devices", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...device, active: !device.active }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.deviceSaveFailed"), "error");
      return;
    }

    toast(t("manager.deviceSaved"), "info");
    await loadDevices();
  }

  async function savePaymentProvider() {
    const method = paymentProviderForm.id ? "PATCH" : "POST";
    const res = await fetch("/api/payment-providers", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...paymentProviderForm,
        sortOrder: Number(paymentProviderForm.sortOrder) || 100,
      }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.paymentProviderSaveFailed"), "error");
      return;
    }

    toast(t("manager.paymentProviderSaved"), "info");
    resetPaymentProviderForm();
    await loadPaymentProviders();
  }

  async function togglePaymentProvider(provider) {
    if (!confirmDanger()) return;

    const res = await fetch("/api/payment-providers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...provider, active: !provider.active }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.paymentProviderSaveFailed"), "error");
      return;
    }

    toast(t("manager.paymentProviderSaved"), "info");
    await loadPaymentProviders();
  }

  function updateUiMessage(key, field, value) {
    setUiMessages((current) => ({
      ...current,
      [key]: {
        ...current[key],
        [field]: ["fontSize", "fontWeight", "minHeight", "radius"].includes(field) ? Number(value) : value,
      },
    }));
  }

  async function saveUiMessages() {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "UI_MESSAGE_CONFIG",
        value: JSON.stringify(uiMessages),
      }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.uiMessagesSaveFailed"), "error");
      return;
    }

    setUiMessages(normalizeUiMessages(result.setting?.value));
    showUiToast("uiMessagesSaved");
  }

  function updateEmployeeNameStyle(group, field, value) {
    setEmployeeNameStyles((current) => {
      const next = {
        ...current,
        [group]: {
          ...current[group],
          [field]: ["fontSize", "fontWeight"].includes(field) ? Number(value) : value,
        },
      };
      applyEmployeeNameStyles(next);
      return next;
    });
  }

  async function saveEmployeeNameStyles() {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "EMPLOYEE_NAME_STYLE_CONFIG",
        value: JSON.stringify(employeeNameStyles),
      }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.employeeStyleSaveFailed"), "error");
      return;
    }

    const normalized = normalizeEmployeeNameStyles(result.setting?.value);
    setEmployeeNameStyles(normalized);
    applyEmployeeNameStyles(normalized);
    showUiToast("employeeStyleSaved");
  }

  function updateRecordTableStyle(field, value) {
    setRecordTableStyles((current) => {
      const next = {
        ...current,
        [field]: ["timeFontSize", "actorFontSize", "actorFontWeight", "cellPaddingY", "cellPaddingX", "minWidth"].includes(field) ? Number(value) : value,
      };
      applyRecordTableStyles(next);
      return next;
    });
  }

  function applyRecordPreset(name) {
    const preset = recordTableStylePresets[name];
    if (!preset) return;
    const normalized = normalizeRecordTableStyles(preset);
    setRecordTableStyles(normalized);
    applyRecordTableStyles(normalized);
  }

  async function saveRecordTableStyles() {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "RECORD_TABLE_STYLE_CONFIG",
        value: JSON.stringify(recordTableStyles),
      }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.recordStyleSaveFailed"), "error");
      return;
    }

    const normalized = normalizeRecordTableStyles(result.setting?.value);
    setRecordTableStyles(normalized);
    applyRecordTableStyles(normalized);
    showUiToast("settingsSaved");
  }

  async function refreshBackups() {
    const res = await fetch("/api/backups");
    const result = await res.json();
    setBackups(Array.isArray(result.backups) ? result.backups : []);
  }

  async function createManualBackup() {
    const res = await fetch("/api/backups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create" }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.backupFailed"), "error");
      return;
    }

    showUiToast("backupCreated");
    await refreshBackups();
  }

  function downloadBackup(name) {
    window.location.href = `/api/backups/${encodeURIComponent(name)}`;
  }

  async function restoreDatabaseBackup(name) {
    if (!confirm(t("manager.restoreBackupConfirm"))) return;
    const res = await fetch("/api/backups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore", name }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.restoreBackupFailed"), "error");
      return;
    }

    showUiToast("backupRestored");
    await refreshBackups();
  }

  function toggleRolePermission(permission, role) {
    setRolePermissions((current) => {
      const selected = new Set(current[permission] || []);
      if (selected.has(role)) {
        selected.delete(role);
      } else {
        selected.add(role);
      }

      return { ...current, [permission]: [...selected] };
    });
  }

  function setAllRolePermissions(checked) {
    setRolePermissions(Object.fromEntries(permissionKeys.map((permission) => [
      permission,
      checked ? [...roles] : [],
    ])));
  }

  async function saveRolePermissions() {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "ROLE_PERMISSION_CONFIG",
        value: JSON.stringify(rolePermissions),
      }),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.rolePermissionsSaveFailed"), "error");
      return;
    }

    setRolePermissions(normalizeRolePermissions(result.setting?.value));
    showUiToast("rolePermissionsSaved");
  }

  function renderUiMessageEditor(key) {
    const message = uiMessages[key];
    if (!message) return null;
    const title = t(`uiMessage.${key}`);

    return (
      <div className="ui-message-editor" key={key}>
        <div className="ui-message-editor-head">
          <b>{title === `uiMessage.${key}` ? message.label || key : title}</b>
          <span>{key}</span>
        </div>
        <div className="ui-message-texts">
          <label>
            <span>{t("manager.messageTextArabic")}</span>
            <textarea
              aria-label={t("manager.messageTextArabic")}
              value={message.text}
              onChange={(event) => updateUiMessage(key, "text", event.target.value)}
              rows={3}
              placeholder={t("manager.messageTextArabic")}
            />
          </label>
          <label>
            <span>{t("manager.messageTextEnglish")}</span>
            <textarea
              aria-label={t("manager.messageTextEnglish")}
              value={message.textEn || ""}
              onChange={(event) => updateUiMessage(key, "textEn", event.target.value)}
              rows={3}
              dir="ltr"
              placeholder={t("manager.messageTextEnglish")}
            />
          </label>
        </div>
        <div className="ui-message-fields">
          <label>
            <span>{t("manager.backgroundColor")}</span>
            <input type="color" value={message.backgroundColor} onChange={(event) => updateUiMessage(key, "backgroundColor", event.target.value)} />
          </label>
          <label>
            <span>{t("manager.textColor")}</span>
            <input type="color" value={message.textColor} onChange={(event) => updateUiMessage(key, "textColor", event.target.value)} />
          </label>
          <label>
            <span>{t("manager.borderColor")}</span>
            <input type="color" value={message.borderColor} onChange={(event) => updateUiMessage(key, "borderColor", event.target.value)} />
          </label>
          <label>
            <span>{t("manager.textAlign")}</span>
            <select
              aria-label={t("manager.textAlign")}
              value={message.textAlign || "center"}
              onChange={(event) => updateUiMessage(key, "textAlign", event.target.value)}
            >
              <option value="right">{t("manager.alignRight")}</option>
              <option value="center">{t("manager.alignCenter")}</option>
              <option value="left">{t("manager.alignLeft")}</option>
            </select>
          </label>
          <label>
            <span>{t("manager.fontSize")}</span>
            <input type="number" min="10" max="28" value={message.fontSize} onChange={(event) => updateUiMessage(key, "fontSize", event.target.value)} />
          </label>
          <label>
            <span>{t("manager.fontWeight")}</span>
            <input type="number" min="400" max="950" step="50" value={message.fontWeight} onChange={(event) => updateUiMessage(key, "fontWeight", event.target.value)} />
          </label>
          <label>
            <span>{t("manager.minHeight")}</span>
            <input type="number" min="24" max="90" value={message.minHeight} onChange={(event) => updateUiMessage(key, "minHeight", event.target.value)} />
          </label>
          <label>
            <span>{t("manager.radius")}</span>
            <input type="number" min="0" max="24" value={message.radius} onChange={(event) => updateUiMessage(key, "radius", event.target.value)} />
          </label>
        </div>
        <div className="ui-message-preview" style={uiMessageStyle(message)}>
          {formatUiMessage(message, {
            employee: "محمد أمين",
            time: "01:38:25 PM",
            method: labelMethod("CASH"),
            id: "ORD#1",
          }).split("\n").map((line, index) => <span key={index}>{line}</span>)}
        </div>
      </div>
    );
  }

  function dailyReviewRows() {
    const dayOrders = periodOrders;
    return {
      orders: dayOrders,
      cash: dayOrders.filter((order) => order.paymentStatus === "PAID" && order.paymentMethod === "CASH").reduce((sum, order) => sum + order.total, 0),
      visa: dayOrders.filter((order) => order.paymentStatus === "PAID" && order.paymentMethod === "VISA").reduce((sum, order) => sum + order.total, 0),
      unregistered: dayOrders.filter((order) => !order.geideaRegisteredAt),
      leftUnpaid: dayOrders.filter((order) => order.customerLeft && order.paymentStatus !== "PAID"),
    };
  }

  function exportDailyCsv() {
    const review = dailyReviewRows();
    const rows = [
      ["Business Date", selectedPeriodLabel()],
      ["Cash Total", review.cash],
      ["Visa Total", review.visa],
      ["Not Registered System", review.unregistered.length],
      ["Left Without Paying", review.leftUnpaid.length],
      [],
      ["Order", "Bracelet", "Children", "Phone", "Payment", "Method", "Total", "System", "Left"],
      ...review.orders.map((order) => [
        order.id,
        order.braceletNo,
        order.childNames,
        order.customerPhone || "",
        order.paymentStatus,
        order.paymentMethod,
        order.total,
        order.geideaRegisteredAt ? "YES" : "NO",
        order.customerLeft ? "YES" : "NO",
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `billybeez-daily-report-${selectedPeriodLabel() || "today"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function printDailyReport() {
    const review = dailyReviewRows();
    const rows = review.orders.map((order) => `
      <tr>
        <td>${escapeHtml(order.id)}</td>
        <td>${escapeHtml(order.braceletNo)}</td>
        <td>${escapeHtml(order.childNames)}</td>
        <td>${escapeHtml(order.paymentStatus)} / ${escapeHtml(order.paymentMethod)}</td>
        <td>${escapeHtml(order.total)}</td>
        <td>${order.geideaRegisteredAt ? "YES" : "NO"}</td>
      </tr>
    `).join("");
    setReportPrintHtml(`
      <html><head><title>Daily Report</title>
      <style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:8px;text-align:start}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:16px 0}.metric{border:1px solid #ddd;padding:12px}</style>
      </head><body>
      <h1>BillyBeez Daily Report - ${escapeHtml(selectedPeriodLabel())}</h1>
      <div class="metrics">
        <div class="metric"><b>Cash</b><br>${escapeHtml(review.cash)}</div>
        <div class="metric"><b>Visa</b><br>${escapeHtml(review.visa)}</div>
        <div class="metric"><b>Not System</b><br>${review.unregistered.length}</div>
        <div class="metric"><b>Left Unpaid</b><br>${review.leftUnpaid.length}</div>
      </div>
      <table><thead><tr><th>Order</th><th>Bracelet</th><th>Children</th><th>Payment</th><th>Total</th><th>System</th></tr></thead><tbody>${rows}</tbody></table>
      <script>window.print()</script>
      </body></html>
    `);
    window.setTimeout(() => setReportPrintHtml(""), 5000);
  }

  function reportSections() {
    return [
      {
        title: t("manager.paymentBreakdown"),
        rows: periodReports.paymentBreakdown.map((row) => [labelMethod(row.method), `${currency(row.total)} (${formatNumber(row.count)})`]),
      },
      {
        title: t("manager.sourceBreakdown"),
        rows: periodReports.sourceBreakdown.map((row) => [labelOrderSource(row.source), `${currency(row.total)} (${formatNumber(row.count)})`]),
      },
      {
        title: t("manager.topProducts"),
        rows: periodReports.topProducts.map((product) => [product.name, currency(product.total)]),
      },
      {
        title: t("manager.statusBreakdown"),
        rows: periodReports.statusBreakdown.map((row) => [labelStatus(row.status), formatNumber(row.count)]),
      },
      {
        title: t("manager.cashierPerformance"),
        rows: periodReports.cashierPerformance.map((row) => [row.name, currency(row.total)]),
      },
      {
        title: t("manager.employees"),
        rows: periodReports.dataEmployeePerformance.map((row) => [row.name, currency(row.total)]),
      },
      {
        title: t("manager.topBracelets"),
        rows: periodReports.topBracelets.map((row) => [row.bracelet, currency(row.total)]),
      },
      {
        title: t("manager.dailySales"),
        rows: periodReports.dailySales.map((row) => [row.date, currency(row.total)]),
      },
    ];
  }

  function exportReportsCsv() {
    const rows = [
      [t("manager.tabReports"), selectedPeriodLabel()],
      [],
      ...reportSections().flatMap((section) => [
        [section.title],
        ...section.rows,
        [],
      ]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `billybeez-reports-${selectedPeriodLabel() || "today"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function printReportsPdf() {
    const dir = document.documentElement.dir || "rtl";
    const sections = reportSections().map((section) => `
      <section>
        <h2>${escapeHtml(section.title)}</h2>
        <table>
          <tbody>
            ${section.rows.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><th>${escapeHtml(value)}</th></tr>`).join("")}
          </tbody>
        </table>
      </section>
    `).join("");
    setReportPrintHtml(`
      <html dir="${escapeHtml(dir)}"><head><title>${escapeHtml(t("manager.tabReports"))}</title>
      <style>
        body{font-family:Arial,Tahoma,sans-serif;padding:24px;color:#210037}
        h1{margin:0 0 16px;font-size:24px}
        h2{margin:18px 0 8px;font-size:18px}
        table{width:100%;border-collapse:collapse;margin-bottom:8px}
        td,th{border:1px solid #ddd;padding:8px;text-align:start}
        th{font-weight:900}
        section{break-inside:avoid}
      </style>
      </head><body>
      <h1>${escapeHtml(t("manager.tabReports"))} - ${escapeHtml(selectedPeriodLabel())}</h1>
      ${sections}
      <script>window.print()</script>
      </body></html>
    `);
    window.setTimeout(() => setReportPrintHtml(""), 5000);
  }

  function recordExportRows() {
    return periodOrderRecords.map((record) => [
      record.orderId,
      record.braceletNo,
      record.childNames || "",
      record.orderTotal,
      recordStepText(record, "orderCreated", "orderCreatedAt"),
      recordStepText(record, "preparationStarted", "preparationStartedAt"),
      recordStepText(record, "delivered", "deliveredAt"),
      recordStepText(record, "paid", "paidAt", record.paymentMethod ? labelMethod(record.paymentMethod) : ""),
      recordStepText(record, "geidea", "geideaRegisteredAt"),
      recordStepText(record, "customerLeft", "customerLeftAt"),
      record.archivedAt ? formatRecordTime(record.archivedAt) : "-",
      recordLastActivity(record)?.summary || recordLastActivity(record)?.action || "-",
    ]);
  }

  function exportRecordsCsv() {
    const rows = [
      [t("manager.orderRecords"), selectedPeriodLabel()],
      [],
      [
        t("common.order"),
        t("common.bracelet"),
        t("common.children"),
        t("common.orderTotal"),
        `${t("manager.recordCreated")}${recordDateHeading()}`,
        `${t("manager.recordPreparation")}${recordDateHeading()}`,
        `${t("manager.recordDelivered")}${recordDateHeading()}`,
        `${t("manager.recordPaid")}${recordDateHeading()}`,
        `${t("manager.recordGeidea")}${recordDateHeading()}`,
        `${t("manager.recordLeft")}${recordDateHeading()}`,
        `${t("manager.recordArchived")}${recordDateHeading()}`,
        t("manager.recordLastActivity"),
      ],
      ...recordExportRows(),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `billybeez-order-records-${selectedPeriodLabel() || "today"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function printRecordsPdf() {
    const dir = document.documentElement.dir || "rtl";
    const rows = recordExportRows().map((row) => `
      <tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>
    `).join("");
    setReportPrintHtml(`
      <html dir="${escapeHtml(dir)}"><head><title>${escapeHtml(t("manager.orderRecords"))}</title>
      <style>
        body{font-family:Arial,Tahoma,sans-serif;padding:16px;color:#210b3c}
        h1{font-size:20px;margin:0 0 10px}
        table{width:100%;border-collapse:collapse;font-size:10px}
        th,td{border:1px solid #ddd;padding:6px;text-align:start;vertical-align:top;white-space:nowrap}
        th{background:#301848;color:#fff}
      </style>
      </head><body>
      <h1>${escapeHtml(t("manager.orderRecords"))} - ${escapeHtml(selectedPeriodLabel())}</h1>
      <table>
        <thead><tr>
          <th>${escapeHtml(t("common.order"))}</th>
          <th>${escapeHtml(t("common.bracelet"))}</th>
          <th>${escapeHtml(t("common.children"))}</th>
          <th>${escapeHtml(t("common.orderTotal"))}</th>
          <th>${escapeHtml(`${t("manager.recordCreated")}${recordDateHeading()}`)}</th>
          <th>${escapeHtml(`${t("manager.recordPreparation")}${recordDateHeading()}`)}</th>
          <th>${escapeHtml(`${t("manager.recordDelivered")}${recordDateHeading()}`)}</th>
          <th>${escapeHtml(`${t("manager.recordPaid")}${recordDateHeading()}`)}</th>
          <th>${escapeHtml(`${t("manager.recordGeidea")}${recordDateHeading()}`)}</th>
          <th>${escapeHtml(`${t("manager.recordLeft")}${recordDateHeading()}`)}</th>
          <th>${escapeHtml(`${t("manager.recordArchived")}${recordDateHeading()}`)}</th>
          <th>${escapeHtml(t("manager.recordLastActivity"))}</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <script>window.print()</script>
      </body></html>
    `);
    window.setTimeout(() => setReportPrintHtml(""), 5000);
  }

  if (!data) {
    return (
      <div className="manager-skeleton" aria-busy="true">
        <section className="grid five">
          {[1, 2, 3, 4, 5].map((item) => <div className="card metric skeleton-card" key={item} />)}
        </section>
        <section className="panel manager-main-tabs skeleton-tabs" />
        <section className="panel skeleton-orders">
          <div className="skeleton-line" />
          <div className="skeleton-line wide" />
          <div className="grid three honey-grid">
            {[1, 2, 3].map((item) => <div className="card order-cell skeleton-order-cell" key={item} />)}
          </div>
          <div className="muted">{loadError || t("common.loading")}</div>
        </section>
      </div>
    );
  }

  const selectedIsEditableOrder = selectedOrder && !selectedOrder.isHistory;
  const selectedIsActiveOrder = selectedIsEditableOrder;
  const selectedIsArchivedOrder = selectedOrder && !selectedOrder.isHistory && selectedOrder.archivedAt;
  const employeeDepartmentOptions = [
    ...activeEmployeeDepartments,
    ...employeeDepartments.filter((department) => !department.active && department.id === employeeForm.department),
  ];
  const editingEmployeeDepartment = Boolean(employeeDepartmentForm.id && employeeDepartments.some((department) => department.id === employeeDepartmentForm.id));
  const employeeFilterDepartmentOptions = employeeDepartments.filter((department) => department.active || employees.some((employee) => employee.department === department.id));
  const productCategories = ["ALL", ...new Set([
    ...categories.map((category) => category.name).filter(Boolean),
    ...products.map((product) => product.categoryName).filter(Boolean),
  ])];
  const productDepartmentOptions = ["ALL", ...productDepartments];
  const visibleCategories = categories.filter((category) => {
    const search = categoryFilter.query.trim().toLowerCase();
    if (categoryFilter.department !== "ALL" && category.department !== categoryFilter.department) return false;
    if (categoryFilter.status === "ACTIVE" && !category.active) return false;
    if (categoryFilter.status === "INACTIVE" && category.active) return false;
    if (!search) return true;
    return [category.name, category.id, category.department].some((value) => String(value || "").toLowerCase().includes(search));
  });
  const productFormCategoryOptions = categories
    .filter((category) => category.department === productForm.department)
    .sort((a, b) => (Number(a.sortOrder) || 100) - (Number(b.sortOrder) || 100) || String(a.name).localeCompare(String(b.name)));
  const visibleEmployees = employees.filter((employee) => {
    const search = employeeFilter.query.trim().toLowerCase();
    if (employeeFilter.department !== "ALL" && employee.department !== employeeFilter.department) return false;
    if (employeeFilter.status === "ACTIVE" && !employee.active) return false;
    if (employeeFilter.status === "INACTIVE" && employee.active) return false;
    if (!search) return true;
    return [employee.name, employee.department].some((value) => String(value || "").toLowerCase().includes(search));
  });
  const visibleProductsSettings = products.filter((product) => {
    const search = productFilter.query.trim().toLowerCase();
    if (productFilter.department !== "ALL" && product.department !== productFilter.department) return false;
    if (productFilter.category !== "ALL" && product.categoryName !== productFilter.category) return false;
    if (productFilter.status === "ACTIVE" && !product.active) return false;
    if (productFilter.status === "INACTIVE" && product.active) return false;
    if (productFilter.popular === "POPULAR" && !product.popular) return false;
    if (productFilter.popular === "REGULAR" && product.popular) return false;
    if (!search) return true;
    return [product.name, product.department, product.categoryName, product.id].some((value) => String(value || "").toLowerCase().includes(search));
  });
  const selectedProductIdSet = new Set(selectedProductIds);
  const selectedProducts = products.filter((product) => selectedProductIdSet.has(product.id));
  const productSummaryCards = [
    { key: "ALL", label: t("manager.allDepartments"), products, tone: "all" },
    ...productDepartments.map((department) => ({
      key: department,
      label: labelDepartment(department),
      products: products.filter((product) => product.department === department),
      tone: department.toLowerCase().replace("_", "-"),
    })),
  ];
  const productGroups = productDepartments
    .map((department) => ({
      department,
      products: visibleProductsSettings.filter((product) => product.department === department),
    }))
    .filter((group) => productFilter.department === "ALL" ? group.products.length > 0 : group.department === productFilter.department);
  const productHasSchedule = (product) => {
    const rules = parseProductAvailabilityRules(product.availabilityRules);
    return Boolean(rules.days.length || rules.startTime || rules.endTime);
  };
  const categoryHasSchedule = (category) => {
    const rules = parseProductAvailabilityRules(category.availabilityRules);
    return Boolean(rules.days.length || rules.startTime || rules.endTime);
  };
  const visibleCustomers = customers.filter((customer) => {
    const search = customerFilter.trim().toLowerCase();
    if (!search) return true;
    return [
      customer.name,
      customer.phone,
      ...(customer.children || []).map((child) => child.name),
    ].some((value) => String(value || "").toLowerCase().includes(search));
  });
  const visibleUsers = users.filter((user) => {
    const search = userFilter.query.trim().toLowerCase();
    if (userFilter.role !== "ALL" && user.role !== userFilter.role) return false;
    if (userFilter.status === "ACTIVE" && !user.active) return false;
    if (userFilter.status === "INACTIVE" && user.active) return false;
    if (!search) return true;
    return [user.name, user.username, user.role, user.employeeName, user.employeeDepartment].some((value) => String(value || "").toLowerCase().includes(search));
  });
  const visibleDevices = devices.filter((device) => {
    const search = deviceFilter.query.trim().toLowerCase();
    if (deviceFilter.type !== "ALL" && device.type !== deviceFilter.type) return false;
    if (deviceFilter.status === "ACTIVE" && !device.active) return false;
    if (deviceFilter.status === "INACTIVE" && device.active) return false;
    if (!search) return true;
    return [device.id, device.name, device.type, device.invoicePrinterName, device.kitchenPrinterName, device.posSerial, device.branchCode].some((value) => String(value || "").toLowerCase().includes(search));
  });
  const visiblePaymentProviders = paymentProviders.filter((provider) => {
    const search = paymentProviderFilter.query.trim().toLowerCase();
    if (paymentProviderFilter.type !== "ALL" && provider.type !== paymentProviderFilter.type) return false;
    if (paymentProviderFilter.status === "ACTIVE" && !provider.active) return false;
    if (paymentProviderFilter.status === "INACTIVE" && provider.active) return false;
    if (!search) return true;
    return [provider.id, provider.name, provider.type, provider.method, provider.reportBucket].some((value) => String(value || "").toLowerCase().includes(search));
  });
  const activeEmployees = employees.filter((employee) => employee.active);
  const settingsGroups = {
    branch: [
      { key: "COMPANY_NAME", label: t("settings.companyName") },
      { key: "BRANCH_NAME", label: t("settings.branchName") },
      { key: "BRANCH_ADDRESS", label: t("settings.branchAddress") },
      { key: "BRANCH_PHONE", label: t("settings.branchPhone") },
      { key: "BRANCH_TIN", label: t("settings.branchTin") },
      { key: "BRANCH_ACTIVITY_CODE", label: t("settings.activityCode") },
      { key: "POS_NAME", label: t("settings.posName") },
    ],
    invoice: [
      { key: "INVOICE_LOGO_URL", label: t("settings.invoiceLogo") },
      { key: "INVOICE_PAPER_SIZE", label: t("settings.paperSize"), type: "select", options: [{ value: "80mm", label: "80mm" }, { value: "58mm", label: "58mm" }, { value: "A4", label: "A4" }] },
      { key: "INVOICE_FOOTER_MESSAGE", label: t("settings.footerMessage") },
      { key: "INVOICE_SHOW_TAX", label: t("settings.showTax"), type: "checkbox" },
      { key: "INVOICE_TAX_RATE", label: t("settings.taxRate"), type: "number", min: 0 },
      { key: "INVOICE_CONTACT_NUMBER", label: t("settings.contactNumber") },
      { key: "INVOICE_WEBSITE", label: t("settings.website") },
      { key: "PUBLIC_APP_BASE_URL", label: t("settings.publicAppBaseUrl") },
      { key: "ETA_ENVIRONMENT", label: t("settings.etaEnvironment"), type: "select", options: [{ value: "SANDBOX", label: "Sandbox" }, { value: "PRODUCTION", label: "Production" }] },
      { key: "ETA_QR_MODE", label: t("settings.etaQrMode"), type: "select", options: [{ value: "INTERNAL", label: t("settings.qrInternal") }, { value: "ETA", label: t("settings.qrEta") }, { value: "BOTH", label: t("settings.qrBoth") }] },
    ],
    printing: [
      { key: "INVOICE_PRINTER_NAME", label: t("settings.invoicePrinter") },
      { key: "KITCHEN_PRINTER_NAME", label: t("settings.kitchenPrinter") },
      { key: "PRINT_AGENT_URL", label: t("settings.printAgentUrl") },
      { key: "DEFAULT_FRONT_DEVICE_ID", label: t("settings.defaultFrontDevice") },
      { key: "DEFAULT_KITCHEN_DEVICE_ID", label: t("settings.defaultKitchenDevice") },
      { key: "DEFAULT_KITCHEN_CASHIER_DEVICE_ID", label: t("settings.defaultKitchenCashierDevice") },
      { key: "PRINT_COPIES_INVOICE", label: t("settings.invoiceCopies"), type: "number", min: 1 },
      { key: "PRINT_COPIES_KITCHEN", label: t("settings.kitchenCopies"), type: "number", min: 1 },
      { key: "PRINT_AUTO_INVOICE", label: t("settings.autoInvoicePrint"), type: "checkbox" },
      { key: "PRINT_AUTO_KITCHEN", label: t("settings.autoKitchenPrint"), type: "checkbox" },
      { key: "KITCHEN_TICKET_CATEGORIES", label: t("settings.kitchenTicketCategories"), type: "kitchenTicketRules" },
    ],
    business: [
      { key: "BUSINESS_OPEN_HOUR", label: t("settings.openHour"), type: "number", min: 0 },
      { key: "BUSINESS_CLOSE_HOUR", label: t("settings.closeHour"), type: "number", min: 0 },
      { key: "BUSINESS_MANUAL_CLOSE_ONLY", label: t("settings.manualCloseOnly"), type: "checkbox" },
      { key: "BUSINESS_DAY_PASSWORD", label: t("settings.businessPassword") },
      { key: "ARCHIVE_REQUIRES_CUSTOMER_LEFT", label: t("settings.archiveRequiresExit"), type: "checkbox" },
    ],
    workflow: [
      { key: "WORKFLOW_ALLOW_PAID_ORDER_EDIT_ROLES", label: t("settings.paidOrderEditRoles") },
      { key: "WORKFLOW_ALLOW_PAYMENT_BEFORE_DELIVERY", label: t("settings.allowPaymentBeforeDelivery"), type: "checkbox" },
      { key: "WORKFLOW_REQUIRE_GEIDEA_BEFORE_ARCHIVE", label: t("settings.requireGeideaBeforeArchive"), type: "checkbox" },
      { key: "WORKFLOW_REQUIRE_PAYMENT_BEFORE_ARCHIVE", label: t("settings.requirePaymentBeforeArchive"), type: "checkbox" },
      { key: "WORKFLOW_ALLOW_EXIT_BEFORE_PAYMENT", label: t("settings.allowExitBeforePayment"), type: "checkbox" },
      { key: "CUSTOM_PAYMENT_PROVIDER_1", label: t("settings.customPaymentProvider1") },
      { key: "CUSTOM_PAYMENT_PROVIDER_2", label: t("settings.customPaymentProvider2") },
    ],
    reports: [
      { key: "REPORT_DEFAULT_TAB", label: t("settings.defaultReportTab"), type: "select", options: [{ value: "daily", label: t("manager.tabReview") }, { value: "payments", label: t("manager.paymentBreakdown") }, { value: "products", label: t("manager.topProducts") }] },
      { key: "REPORT_SHOW_CASH_VISA_GEIDEA", label: t("settings.showCashVisaGeidea"), type: "checkbox" },
      { key: "REPORT_ENABLE_EXCEL_EXPORT", label: t("settings.enableExcel"), type: "checkbox" },
      { key: "REPORT_ENABLE_PDF_EXPORT", label: t("settings.enablePdf"), type: "checkbox" },
      { key: "REPORT_ORDERS_CARD_ICON_URL", label: t("settings.reportOrdersCardIcon") },
      { key: "REPORT_ORDERS_CARD_COLOR_START", label: t("settings.reportOrdersCardStart"), type: "color", defaultValue: "#e94b96" },
      { key: "REPORT_ORDERS_CARD_COLOR_END", label: t("settings.reportOrdersCardEnd"), type: "color", defaultValue: "#d93074" },
      { key: "REPORT_ORDERS_CARD_TEXT_COLOR", label: t("settings.reportOrdersCardText"), type: "color", defaultValue: "#ffffff" },
      { key: "REPORT_AVERAGE_CARD_ICON_URL", label: t("settings.reportAverageCardIcon") },
      { key: "REPORT_AVERAGE_CARD_COLOR_START", label: t("settings.reportAverageCardStart"), type: "color", defaultValue: "#6d4cd7" },
      { key: "REPORT_AVERAGE_CARD_COLOR_END", label: t("settings.reportAverageCardEnd"), type: "color", defaultValue: "#301848" },
      { key: "REPORT_AVERAGE_CARD_TEXT_COLOR", label: t("settings.reportAverageCardText"), type: "color", defaultValue: "#ffffff" },
      { key: "REPORT_GEIDEA_CARD_ICON_URL", label: t("settings.reportGeideaCardIcon") },
      { key: "REPORT_GEIDEA_CARD_COLOR_START", label: t("settings.reportGeideaCardStart"), type: "color", defaultValue: "#36acd4" },
      { key: "REPORT_GEIDEA_CARD_COLOR_END", label: t("settings.reportGeideaCardEnd"), type: "color", defaultValue: "#005eb8" },
      { key: "REPORT_GEIDEA_CARD_TEXT_COLOR", label: t("settings.reportGeideaCardText"), type: "color", defaultValue: "#ffffff" },
      { key: "REPORT_PAID_CARD_ICON_URL", label: t("settings.reportPaidCardIcon") },
      { key: "REPORT_PAID_CARD_COLOR_START", label: t("settings.reportPaidCardStart"), type: "color", defaultValue: "#ffb12b" },
      { key: "REPORT_PAID_CARD_COLOR_END", label: t("settings.reportPaidCardEnd"), type: "color", defaultValue: "#ff671f" },
      { key: "REPORT_PAID_CARD_TEXT_COLOR", label: t("settings.reportPaidCardText"), type: "color", defaultValue: "#ffffff" },
    ],
    auditBackup: [
      { key: "AUDIT_RETENTION_DAYS", label: t("settings.auditRetention"), type: "number", min: 1 },
      { key: "AUDIT_EXPORT_ENABLED", label: t("settings.auditExport"), type: "checkbox" },
      { key: "BACKUP_AUTO_DAILY", label: t("settings.autoBackup"), type: "checkbox" },
      { key: "BACKUP_RETENTION_DAYS", label: t("settings.backupRetention"), type: "number", min: 1 },
    ],
  };

  const settingsTabMeta = {
    employees: { label: t("manager.employeeManagement"), hint: t("manager.employeeManagementHint") },
    customers: { label: t("manager.customerManagement"), hint: t("manager.customerManagementHint") },
    users: { label: t("manager.userManagement"), hint: t("manager.userManagementHint") },
    products: { label: t("manager.productManagement"), hint: t("manager.productManagementHint") },
    paymentProviders: { label: t("manager.paymentProviderManagement"), hint: t("manager.paymentProviderManagementHint") },
    devices: { label: t("manager.deviceManagement"), hint: t("manager.deviceManagementHint") },
    business: { label: t("settings.businessSettings"), hint: t("settings.businessSettingsHint") },
    workflow: { label: t("settings.workflowSettings"), hint: t("settings.workflowSettingsHint") },
    branch: { label: t("settings.branchSettings"), hint: t("settings.branchSettingsHint") },
    invoice: { label: t("settings.invoiceSettings"), hint: t("settings.invoiceDesignerHint") },
    printing: { label: t("settings.printSettings"), hint: t("settings.printSettingsHint") },
    reports: { label: t("settings.reportSettings"), hint: t("settings.reportSettingsHint") },
    recordsStyle: { label: t("settings.recordTableSettings"), hint: t("settings.recordTableSettingsHint") },
    messages: { label: t("manager.uiMessages"), hint: t("manager.uiMessagesHint") },
    auditBackup: { label: t("settings.auditBackupSettings"), hint: t("settings.auditBackupSettingsHint") },
    backupRestore: { label: t("manager.backupRestore"), hint: t("manager.backupRestoreHint") },
  };
  const settingsNavigationGroups = [
    { key: "people", title: t("settings.groupPeople"), hint: t("settings.groupPeopleHint"), tabs: ["employees", "customers", "users"], code: "01" },
    { key: "catalog", title: t("settings.groupCatalog"), hint: t("settings.groupCatalogHint"), tabs: ["products", "paymentProviders"], code: "02" },
    { key: "operations", title: t("settings.groupOperations"), hint: t("settings.groupOperationsHint"), tabs: ["devices", "business", "workflow"], code: "03" },
    { key: "receipts", title: t("settings.groupReceipts"), hint: t("settings.groupReceiptsHint"), tabs: ["branch", "invoice", "printing"], code: "04" },
    { key: "insights", title: t("settings.groupInsights"), hint: t("settings.groupInsightsHint"), tabs: ["reports", "recordsStyle", "messages"], code: "05" },
    { key: "maintenance", title: t("settings.groupMaintenance"), hint: t("settings.groupMaintenanceHint"), tabs: ["auditBackup", "backupRestore"], code: "06" },
  ];
  const settingsTabMatchesSearch = (tab) => {
    const search = settingsSearch.trim().toLowerCase();
    if (!search) return true;
    const meta = settingsTabMeta[tab] || {};
    const fieldMatches = (settingsGroups[tab] || []).some((field) => [
      field.key,
      field.label,
    ].some((value) => String(value || "").toLowerCase().includes(search)));
    return [meta.label, meta.hint, tab].some((value) => String(value || "").toLowerCase().includes(search)) || fieldMatches;
  };
  const visibleSettingsGroups = settingsNavigationGroups
    .map((group) => ({ ...group, tabs: group.tabs.filter(settingsTabMatchesSearch) }))
    .filter((group) => group.tabs.length > 0 || [group.title, group.hint].some((value) => String(value || "").toLowerCase().includes(settingsSearch.trim().toLowerCase())));
  const currentSettingsGroup = settingsNavigationGroups.find((group) => group.tabs.includes(settingsTab));
  const currentSettingsTabMeta = settingsTabMeta[settingsTab] || { label: settingsTab, hint: "" };
  const settingsSearchActive = Boolean(settingsSearch.trim());
  const settingsGroupTargetTab = (group) => {
    if (group.tabs.includes(settingsTab)) return settingsTab;
    return group.tabs[0] || settingsNavigationGroups.find((item) => item.key === group.key)?.tabs?.[0] || "employees";
  };
  const reportCardStyle = (prefix, fallbackStart, fallbackEnd) => ({
    iconUrl: settingsMap[`REPORT_${prefix}_CARD_ICON_URL`] || "",
    startColor: settingsMap[`REPORT_${prefix}_CARD_COLOR_START`] || fallbackStart,
    endColor: settingsMap[`REPORT_${prefix}_CARD_COLOR_END`] || fallbackEnd,
    textColor: settingsMap[`REPORT_${prefix}_CARD_TEXT_COLOR`] || "#ffffff",
  });
  const productPreviewStyle = {
    "--product-card-start": productForm.cardColorStart || "#3d1859",
    "--product-card-end": productForm.cardColorEnd || productForm.cardColorStart || "#8a62b2",
    "--product-card-text": productForm.cardTextColor || "#ffffff",
    "--product-card-accent": productForm.cardAccentColor || "#e31937",
  };

  return (
    <>
      <section className="grid five">
        <Metric label={t("manager.totalPaidSales")} value={currency(data.totalSales)} />
        <Metric label={t("manager.orders")} value={formatNumber(data.ordersCount)} />
        <Metric label={t("common.unpaid")} value={formatNumber(data.unpaidOrders)} />
        <Metric label={t("manager.leftUnpaid")} value={formatNumber(data.leftUnpaid)} />
        <Metric label={t("manager.history")} value={formatNumber(historyRows.length)} />
      </section>

      <section className="panel health-panel">
        <div className="row">
          <div>
            <h3>{t("manager.healthPanel")}</h3>
            <div className="muted">{t("manager.healthPanelHint")}</div>
          </div>
          <div className="actions">
            {healthFilter !== "ALL" && <button className="danger" onClick={clearOrderFilters}>{t("common.clearFilters")}</button>}
            <button className="secondary" onClick={load}>{t("common.refresh")}</button>
          </div>
        </div>
        <div className="health-grid">
          {healthRows.map((item) => (
            <button
              type="button"
              className={`health-card ${item.tone} ${item.variant} ${healthFilter === item.key ? "active" : ""}`}
              key={item.key}
              onClick={() => {
                setManagerTab("orders");
                setHealthFilter(item.key);
                if (item.key === "paidNotGeidea") setArchiveFilter("UNREGISTERED");
                if (item.key === "leftUnpaid") setFilter("UNPAID");
              }}
            >
              <span>{item.label}</span>
              <b>{formatNumber(item.value)}</b>
            </button>
          ))}
        </div>
      </section>

      <section className="panel manager-main-tabs">
        <div className="tabs">
          {[
            ["orders", t("manager.tabOrders")],
            ["review", t("manager.tabReview")],
            ["reports", t("manager.tabReports")],
            ["settings", t("manager.tabSettings")],
            ["records", t("manager.tabRecords")],
            ["activity", t("manager.tabActivity")],
          ].map(([tab, label]) => (
            <button key={tab} className={managerTab === tab ? "active" : ""} onClick={() => setManagerTab(tab)}>{label}</button>
          ))}
        </div>
      </section>

      {managerTab === "review" && <section className="panel">
        <div className="row">
          <div>
            <h2>{t("manager.dayReview")}</h2>
            <div className="muted">{t("manager.dayReviewHint")}</div>
          </div>
          <div className="actions">
            <button className="btn-print" onClick={exportDailyCsv}>{t("manager.exportExcel")}</button>
            <button className="btn-details" onClick={printDailyReport}>{t("manager.exportPdf")}</button>
          </div>
        </div>
        <div className="grid four review-grid">
          <Metric label={t("manager.cashTotal")} value={currency(dailyReviewRows().cash)} />
          <Metric label={t("manager.visaTotal")} value={currency(dailyReviewRows().visa)} />
          <Metric label={t("manager.notRegisteredGeidea")} value={formatNumber(dailyReviewRows().unregistered.length)} />
          <Metric label={t("manager.leftUnpaid")} value={formatNumber(dailyReviewRows().leftUnpaid.length)} />
        </div>
      </section>}

      {managerTab === "orders" && <section className="panel">
        <div className="row">
          <div>
            <h2>{viewMode === "HISTORY" ? t("common.orderHistory") : t("manager.todayOrders")}</h2>
            <div className="muted">
              {t("common.businessDay")}: {data.reportBusinessDate || t("common.closed")} · {labelBusinessMessage(data.businessState?.message)}
              {data.businessState?.closedOrderCount ? ` · ${t("manager.closedCount", { count: data.businessState.closedOrderCount })}` : ""}
            </div>
          </div>
          <div className="actions">
            {renderDateRangePicker()}
            <button className={viewMode === "TODAY" ? "secondary" : ""} onClick={() => {
              const day = data.reportBusinessDate || new Date().toISOString().slice(0, 10);
              setViewMode("TODAY");
              setDateFilterMode("DAY");
              setCalendarMonth(day.slice(0, 7));
              setDateFilter((current) => ({ ...current, day, month: day.slice(0, 7), year: day.slice(0, 4), from: day, to: day }));
            }}>{t("common.today")}</button>
            <button className={viewMode === "HISTORY" ? "secondary" : ""} onClick={() => setViewMode("HISTORY")}>{t("common.orderHistory")}</button>
          </div>
        </div>
        <div className="tabs">
          {["ALL", "CASH", "VISA", "UNPAID"].map((item) => (
            <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{filterLabel(item)}</button>
          ))}
        </div>
        {viewMode === "TODAY" && <div className="tabs">
          {["ALL", "ACTIVE", "ARCHIVED", "UNREGISTERED"].map((item) => (
            <button key={item} className={`${archiveFilter === item ? "active" : ""} ${item === "UNREGISTERED" ? "tab-danger" : ""} ${item === "ARCHIVED" ? "tab-blue" : ""}`} onClick={() => setArchiveFilter(item)}>{archiveLabel(item)}</button>
          ))}
        </div>}
        <div className="form-grid manager-filter-grid">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("manager.searchPlaceholder")} />
          <button className="secondary" onClick={clearOrderFilters}>{t("common.clearFilters")}</button>
        </div>
        {cleanupIssueGroups.length > 0 && (
          <div className="cleanup-panel">
            <div className="row">
              <div>
                <h3>{t("manager.cleanupTool")}</h3>
                <div className="muted">{t("manager.cleanupToolHint")}</div>
              </div>
              <button className="secondary" onClick={clearOrderFilters}>{t("common.clearFilters")}</button>
            </div>
            <div className="cleanup-grid">
              {cleanupIssueGroups.map((group) => (
                <section className={`cleanup-group ${group.tone}`} key={group.key}>
                  <div className="cleanup-group-head">
                    <b>{group.label}</b>
                    <span>{formatNumber(group.rows.length)}</span>
                  </div>
                  <div className="cleanup-list">
                    {group.rows.slice(0, 8).map((order) => (
                      <button type="button" className="cleanup-row" key={`${group.key}-${order.id}`} onClick={() => setSelectedOrder(order)}>
                        <b>{order.id}</b>
                        <span>{order.braceletNo}</span>
                        <small>{order.childNames || "-"}</small>
                        <em>{currency(order.total)}</em>
                      </button>
                    ))}
                  </div>
                  {group.rows.length > 8 && <div className="muted">{t("manager.cleanupMore", { count: group.rows.length - 8 })}</div>}
                </section>
              ))}
            </div>
          </div>
        )}
        {viewMode === "TODAY" && duplicateActiveBracelets.length > 0 && (
          <div className="duplicate-bracelet-panel">
            <div>
              <h3>{t("manager.duplicateBracelets")}</h3>
              <p>{t("manager.duplicateBraceletsHint")}</p>
            </div>
            <div className="duplicate-bracelet-list">
              {duplicateActiveBracelets.map((group) => (
                <div className="duplicate-bracelet-row" key={group.bracelet}>
                  <div>
                    <b>{group.bracelet}</b>
                    <span>{t("manager.duplicateBraceletCount", { count: group.orders.length })}</span>
                  </div>
                  <div className="duplicate-order-list">
                    {group.orders.map((order) => (
                      <button type="button" className="duplicate-order-chip" key={order.id} onClick={() => setSelectedOrder(order)}>
                        <b>{order.id}</b>
                        <span>{order.childNames || t("manager.noOrder")}</span>
                        <small>{currency(order.total)}</small>
                      </button>
                    ))}
                  </div>
                  <div className="duplicate-merge-actions">
                    {group.orders.map((order) => (
                      <button
                        type="button"
                        className="btn-confirm"
                        key={`merge-${order.id}`}
                        onClick={() => mergeDuplicateOrders(order, group.orders.filter((sourceOrder) => sourceOrder.id !== order.id))}
                      >
                        {t("manager.mergeIntoOrder", { order: order.id })}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="row"><span>{t("common.visibleOrders")}</span><b>{formatNumber(visibleOrders.length)}</b></div>
        <div className="grid three honey-grid">
          {renderedOrders.map((order) => (
            <div className={`card order-cell ${orderAlertClass(order)}`} key={order.id}>
              <div className="row order-head">
                <b>{order.id}</b>
                <span className={`badge ${order.paymentStatus === "PAID" ? "paid" : "unpaid"}`}>{labelStatus(order.paymentStatus)}</span>
              </div>
              <div className="order-info">
                {viewMode === "HISTORY" && <div className="meta-line"><span>{t("common.businessDay")}</span><b>{order.businessDate}</b></div>}
                <div className="meta-line"><span>{t("common.date")}</span><b>{formatDateTime(order.createdAt)}</b></div>
                <div className="meta-line"><span>{t("common.bracelet")}</span><b>{order.braceletNo}</b></div>
                {order.customerPhone && <div className="meta-line"><span>{t("common.phone")}</span><b>{order.customerPhone}</b></div>}
                <div className="meta-line"><span>{t("common.children")}</span><b>{order.childNames}</b></div>
                <div className="meta-line"><span>{t("common.status")}</span><b className={`meta-value ${orderStageClass(order)}`}>{labelOrderStage(order)}</b></div>
                {order.paymentStatus !== "PAID" && <div className="meta-line"><span>{t("common.method")}</span><b className={`meta-value ${order.paymentMethod === "VISA" ? "meta-visa" : "meta-cash"}`}>{labelMethod(order.paymentMethod)}</b></div>}
                {order.paymentEmployee && <div className="meta-line"><span>{t("common.paymentEmployee")}</span><b className={`meta-value meta-payment-employee ${employeeGenderClass(order.paymentEmployee)}`}>{order.paymentEmployee}</b></div>}
              </div>
              <OrderItemsSummary order={order} t={t} currency={currency} />
              <div className="order-alerts">
                <OrderAlerts
                  order={order}
                  uiMessages={uiMessages}
                  formatDateTime={formatDateTime}
                  labelMethod={labelMethod}
                  actionLabels={{ delivered: t("common.delivered"), geidea: t("manager.registerSystem"), exit: "خروج", archive: "أرشفة", closed: t("common.closed") }}
                  showArchive={Boolean(order.archivedAt && (!order.isHistory || !order.closedAt))}
                  showClosed={Boolean(viewMode === "HISTORY" && order.isHistory && order.closedAt)}
                />
              </div>
              <div className="actions">
                <button className="btn-details" onClick={() => setSelectedOrder(order)}>{t("manager.details")}</button>
                {!order.isHistory && !order.geideaRegisteredAt && <button className="btn-system" onClick={() => runOrderAction(order.id, "geidea")}>{t("manager.registerSystem")}</button>}
                {!order.isHistory && order.geideaRegisteredAt && order.customerLeft && !order.archivedAt && <button className="btn-print" onClick={() => runOrderAction(order.id, "archive")}>{t("manager.archive")}</button>}
                {order.archivedAt && !order.isHistory && <button className="btn-unarchive" onClick={() => runOrderAction(order.id, "unarchive")}>{t("manager.unarchive")}</button>}
                <button className="btn-print" onClick={() => printInvoice(order.id)}>{t("common.print")}</button>
              </div>
            </div>
          ))}
        </div>
        {renderedOrders.length < visibleOrders.length && (
          <div className="load-more-row">
            <button className="secondary" onClick={() => setOrderRenderLimit((current) => current + 30)}>
              {t("common.showMore")} · {formatNumber(visibleOrders.length - renderedOrders.length)}
            </button>
          </div>
        )}
      </section>}

      {managerTab === "reports" && <div className="reports-dashboard-shell">
        <section className="reports-control-bar">
          <div>
            <h2>{t("manager.reportDashboard")}</h2>
            <div className="muted">{t("manager.reportDashboardHint")}</div>
          </div>
          <div className="reports-period-tabs">
            <button className={dateFilterMode === "DAY" ? "active" : ""} onClick={() => applyDatePreset("DAY")}>{t("manager.rangeToday")}</button>
            <button className={dateFilterMode === "RANGE" ? "active" : ""} onClick={applyMonthToDate}>{t("manager.monthToDate")}</button>
            <button className={dateFilterMode === "MONTH" ? "active" : ""} onClick={() => applyDatePreset("MONTH")}>{t("manager.rangeMonth")}</button>
            <button className={dateFilterMode === "YEAR" ? "active" : ""} onClick={() => applyDatePreset("YEAR")}>{t("manager.rangeYear")}</button>
          </div>
          <div className="actions reports-toolbar-actions">
            {renderDateRangePicker()}
            <button className="btn-print" onClick={exportReportsCsv}>{t("manager.exportExcel")}</button>
            <button className="btn-details" onClick={printReportsPdf}>{t("manager.exportPdf")}</button>
          </div>
        </section>

        <section className="reports-hero-grid">
          <div className="reports-hero-card">
            <div className="reports-hero-summary">
              <span>{t("manager.reportOverview")}</span>
              <small>{selectedPeriodLabel()}</small>
              <b>{currency(periodReports.summary.totalSales)}</b>
              <em>{t("manager.totalSales")}</em>
              <button className="report-summary-button" onClick={printReportsPdf}>{t("manager.exportPdf")}</button>
            </div>
            <AreaChart
              title={t("manager.dailySales")}
              rows={periodReports.dailySales}
              valueKey="total"
              labelKey="date"
              valueFormatter={currency}
              emptyLabel={t("common.noData")}
            />
          </div>
          <DonutChart
            title={t("manager.paymentBreakdown")}
            rows={periodReports.paymentBreakdown}
            labelKey="method"
            valueKey="total"
            countKey="count"
            labelFormatter={labelMethod}
            valueFormatter={currency}
            emptyLabel={t("common.noData")}
          />
        </section>

        <section className="report-gradient-grid">
          <GradientSummaryCard tone="pink" title={t("manager.orders")} value={formatNumber(periodReports.summary.orderCount)} caption={t("manager.reportOrdersCaption")} styleConfig={reportCardStyle("ORDERS", "#e94b96", "#d93074")} />
          <GradientSummaryCard tone="purple" title={t("manager.averageOrder")} value={currency(periodReports.summary.averageOrder)} caption={t("manager.reportAverageCaption")} styleConfig={reportCardStyle("AVERAGE", "#6d4cd7", "#301848")} />
          <GradientSummaryCard tone="blue" title={t("manager.notRegisteredGeidea")} value={`${formatNumber(periodReports.summary.geideaRate)}%`} caption={t("manager.geideaRate")} styleConfig={reportCardStyle("GEIDEA", "#36acd4", "#005eb8")} />
          <GradientSummaryCard tone="orange" title={t("manager.totalPaidSales")} value={currency(periodReports.summary.paidSales)} caption={t("manager.reportPaidCaption")} styleConfig={reportCardStyle("PAID", "#ffb12b", "#ff671f")} />
        </section>

        <section className="reports-lower-grid">
          <RecentActivityCard
            title={t("manager.recentActivity")}
            rows={periodAuditLogs.slice(0, 5)}
            labelAudit={labelAudit}
            formatDateTime={formatDateTime}
            emptyLabel={t("manager.noActivity")}
          />
          <TopOrdersTable
            title={t("manager.topOrders")}
            rows={periodReports.topOrders}
            t={t}
            currency={currency}
            labelStatus={labelStatus}
            emptyLabel={t("common.noData")}
          />
        </section>

        <section className="report-dashboard-grid report-dashboard-grid-wide">
          <DashboardBars
            title={t("manager.sourceBreakdown")}
            rows={periodReports.sourceBreakdown.map((row) => ({ ...row, name: labelOrderSource(row.source) }))}
            labelKey="name"
            valueKey="total"
            valueFormatter={currency}
            emptyLabel={t("common.noData")}
          />
          <DashboardBars title={t("manager.topProducts")} rows={periodReports.topProducts} labelKey="name" valueKey="total" valueFormatter={currency} emptyLabel={t("common.noData")} />
          <DashboardBars title={t("manager.productQuantity")} rows={periodReports.topProductQty} labelKey="name" valueKey="qty" valueFormatter={formatNumber} emptyLabel={t("common.noData")} />
          <DashboardBars title={t("manager.employees")} rows={periodReports.dataEmployeePerformance} labelKey="name" valueKey="total" valueFormatter={currency} emptyLabel={t("common.noData")} />
          <DashboardBars title={t("manager.topBracelets")} rows={periodReports.topBracelets} labelKey="bracelet" valueKey="total" valueFormatter={currency} emptyLabel={t("common.noData")} />
        </section>
      </div>}

      {managerTab === "settings" && <section className="panel settings-shell settings-workbench">
        <div className="settings-workbench-head">
          <div>
            <span>{t("manager.tabSettings")}</span>
            <h2>{t("settings.settingsCenter")}</h2>
            <p>{t("settings.settingsCenterHint")}</p>
          </div>
          <input
            className="settings-search"
            value={settingsSearch}
            onChange={(event) => setSettingsSearch(event.target.value)}
            placeholder={t("settings.searchPlaceholder")}
          />
        </div>
        <div className="settings-group-strip">
          {visibleSettingsGroups.map((group) => {
            const isActive = currentSettingsGroup?.key === group.key;
            const originalGroup = settingsNavigationGroups.find((item) => item.key === group.key) || group;
            return (
              <button
                type="button"
                className={`settings-group-card tone-${group.key} ${isActive ? "active" : ""}`}
                key={group.key}
                onClick={() => setSettingsTab(settingsGroupTargetTab(group))}
              >
                <small>{group.code}</small>
                <b>{group.title}</b>
                <span>{group.hint}</span>
                <em>{formatNumber(settingsSearchActive ? group.tabs.length : originalGroup.tabs.length)}</em>
              </button>
            );
          })}
          {!visibleSettingsGroups.length && <div className="settings-empty-search">{t("settings.noSettingsResults")}</div>}
        </div>
        <div className="settings-content">
          <div className="settings-content-head">
            <div>
              <span>{currentSettingsGroup?.title || t("manager.settings")}</span>
              <h2>{currentSettingsTabMeta.label}</h2>
              {currentSettingsTabMeta.hint && <p>{currentSettingsTabMeta.hint}</p>}
            </div>
            {currentSettingsGroup && (
              <div className="settings-related-tabs">
                {currentSettingsGroup.tabs.map((tab) => (
                  <button key={tab} className={settingsTab === tab ? "active" : ""} onClick={() => setSettingsTab(tab)}>
                    {settingsTabMeta[tab]?.label || tab}
                  </button>
                ))}
              </div>
            )}
          </div>
      {settingsTab === "employees" && <section className="employee-manager">
        <div className="row">
          <div>
            <h3>{t("manager.employeeManagement")}</h3>
            <div className="muted">{t("manager.employeeManagementHint")}</div>
          </div>
          {employeeForm.id && <button className="danger" onClick={resetEmployeeForm}>{t("common.cancel")}</button>}
        </div>
        <div className="form-grid employee-form-grid">
          <input
            value={employeeForm.name}
            onChange={(event) => setEmployeeForm((current) => ({ ...current, name: event.target.value }))}
            placeholder={t("manager.employeeName")}
          />
          <select
            aria-label={t("common.department")}
            value={employeeForm.department}
            onChange={(event) => setEmployeeForm((current) => ({ ...current, department: event.target.value }))}
          >
            {employeeDepartmentOptions.map((department) => (
              <option key={department.id} value={department.id}>{labelEmployeeDepartment(department.id)}</option>
            ))}
          </select>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={employeeForm.active}
              onChange={(event) => setEmployeeForm((current) => ({ ...current, active: event.target.checked }))}
            />
            <span>{employeeForm.active ? t("common.active") : t("common.inactive")}</span>
          </label>
          <button className="btn-confirm" onClick={saveEmployee}>{employeeForm.id ? t("manager.updateEmployee") : t("manager.addEmployee")}</button>
        </div>
        <div className="department-manager-panel">
          <div className="row">
            <div>
              <h3>{t("manager.departmentManagement")}</h3>
              <div className="muted">{t("manager.departmentManagementHint")}</div>
            </div>
            {employeeDepartmentForm.id && <button className="danger" onClick={resetEmployeeDepartmentForm}>{t("common.cancel")}</button>}
          </div>
          <div className="form-grid department-form-grid">
            <input
              value={employeeDepartmentForm.id}
              onChange={(event) => setEmployeeDepartmentForm((current) => ({ ...current, id: normalizeDepartmentId(event.target.value) }))}
              placeholder={t("manager.departmentCode")}
              disabled={employeeDepartmentForm.locked}
            />
            <input
              value={employeeDepartmentForm.name}
              onChange={(event) => setEmployeeDepartmentForm((current) => ({ ...current, name: event.target.value }))}
              placeholder={t("manager.departmentNameAr")}
            />
            <input
              value={employeeDepartmentForm.nameEn}
              onChange={(event) => setEmployeeDepartmentForm((current) => ({ ...current, nameEn: event.target.value }))}
              placeholder={t("manager.departmentNameEn")}
            />
            <select
              aria-label={t("manager.departmentKind")}
              value={employeeDepartmentForm.kind}
              onChange={(event) => setEmployeeDepartmentForm((current) => ({ ...current, kind: event.target.value }))}
              disabled={employeeDepartmentForm.locked}
            >
              <option value="DATA">{t("manager.departmentKindData")}</option>
              <option value="KITCHEN">{t("manager.departmentKindKitchen")}</option>
            </select>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={employeeDepartmentForm.active}
                onChange={(event) => setEmployeeDepartmentForm((current) => ({ ...current, active: event.target.checked }))}
                disabled={employeeDepartmentForm.locked}
              />
              <span>{employeeDepartmentForm.active ? t("common.active") : t("common.inactive")}</span>
            </label>
            <button className="btn-confirm" onClick={saveEmployeeDepartment}>{editingEmployeeDepartment ? t("manager.updateDepartment") : t("manager.addDepartment")}</button>
          </div>
          <div className="employee-table department-table">
            <div className="employee-row department-row employee-head">
              <b>{t("manager.departmentCode")}</b>
              <b>{t("common.name")}</b>
              <b>{t("manager.departmentKind")}</b>
              <b>{t("common.status")}</b>
              <b>{t("common.actions")}</b>
            </div>
            {employeeDepartments.map((department) => (
              <div className="employee-row department-row" key={department.id}>
                <span><b>{department.id}</b>{department.locked && <small className="muted block">{t("manager.departmentLocked")}</small>}</span>
                <span>{labelEmployeeDepartment(department.id)}<small className="muted block">{department.nameEn}</small></span>
                <span>{department.kind === "KITCHEN" ? t("manager.departmentKindKitchen") : t("manager.departmentKindData")}</span>
                <span className={`badge ${department.active ? "paid" : "unpaid"}`}>
                  {department.active ? t("common.active") : t("common.inactive")}
                </span>
                <span className="actions">
                  <button className="btn-edit" onClick={() => editEmployeeDepartment(department)}>{t("common.edit")}</button>
                  <button className={department.active ? "danger" : "btn-unarchive"} disabled={department.locked} onClick={() => toggleEmployeeDepartment(department)}>
                    {department.active ? t("common.deactivate") : t("common.activate")}
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="employee-style-panel">
          <div className="row">
            <div>
              <h3>{t("manager.employeeNameStyle")}</h3>
              <div className="muted">{t("manager.employeeNameStyleHint")}</div>
            </div>
            <button className="btn-confirm" onClick={saveEmployeeNameStyles}>{t("common.save")}</button>
          </div>
          <div className="employee-style-grid">
            {[
              ["male", t("manager.maleEmployeeStyle"), "محمد أمين"],
              ["female", t("manager.femaleEmployeeStyle"), "سلمى سلطان"],
              ["general", t("manager.generalAccountStyle"), "Admin"],
            ].map(([group, label, preview]) => (
              <div className="employee-style-card" key={group}>
                <b>{label}</b>
                <div className={`employee-style-preview ${group === "general" ? "general-account-name" : `employee-name-${group}`}`}>{preview}</div>
                <div className="ui-message-fields">
                  <label>
                    <span>{t("manager.textColor")}</span>
                    <input type="color" value={employeeNameStyles[group].color} onChange={(event) => updateEmployeeNameStyle(group, "color", event.target.value)} />
                  </label>
                  {group === "general" && (
                    <>
                      <label>
                        <span>{t("manager.backgroundColor")}</span>
                        <input type="color" value={employeeNameStyles[group].backgroundColor} onChange={(event) => updateEmployeeNameStyle(group, "backgroundColor", event.target.value)} />
                      </label>
                      <label>
                        <span>{t("manager.borderColor")}</span>
                        <input type="color" value={employeeNameStyles[group].borderColor} onChange={(event) => updateEmployeeNameStyle(group, "borderColor", event.target.value)} />
                      </label>
                    </>
                  )}
                  <label>
                    <span>{t("manager.fontSize")}</span>
                    <input type="number" min="10" max="28" value={employeeNameStyles[group].fontSize} onChange={(event) => updateEmployeeNameStyle(group, "fontSize", event.target.value)} />
                  </label>
                  <label>
                    <span>{t("manager.fontWeight")}</span>
                    <input type="number" min="400" max="950" step="50" value={employeeNameStyles[group].fontWeight} onChange={(event) => updateEmployeeNameStyle(group, "fontWeight", event.target.value)} />
                  </label>
                  <label>
                    <span>{t("manager.fontStyle")}</span>
                    <select
                      aria-label={`${label} - ${t("manager.fontStyle")}`}
                      value={employeeNameStyles[group].fontStyle}
                      onChange={(event) => updateEmployeeNameStyle(group, "fontStyle", event.target.value)}
                    >
                      <option value="normal">{t("manager.fontStyleNormal")}</option>
                      <option value="italic">{t("manager.fontStyleItalic")}</option>
                    </select>
                  </label>
                  <label>
                    <span>{t("manager.fontFamily")}</span>
                    <select
                      aria-label={`${label} - ${t("manager.fontFamily")}`}
                      value={employeeNameStyles[group].fontFamily}
                      onChange={(event) => updateEmployeeNameStyle(group, "fontFamily", event.target.value)}
                    >
                      <option value="">{t("manager.fontFamilyDefault")}</option>
                      <option value="Tajawal">Tajawal</option>
                      <option value="Arial">Arial</option>
                      <option value="Tahoma">Tahoma</option>
                      <option value="Cairo">Cairo</option>
                    </select>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="form-grid settings-filter-grid">
          <input value={employeeFilter.query} onChange={(event) => setEmployeeFilter((current) => ({ ...current, query: event.target.value }))} placeholder={t("manager.employeeSearch")} />
          <select
            aria-label={t("common.department")}
            value={employeeFilter.department}
            onChange={(event) => setEmployeeFilter((current) => ({ ...current, department: event.target.value }))}
          >
            <option value="ALL">{t("common.all")}</option>
            {employeeFilterDepartmentOptions.map((department) => (
              <option key={department.id} value={department.id}>{labelEmployeeDepartment(department.id)}</option>
            ))}
          </select>
          <select
            aria-label={t("common.status")}
            value={employeeFilter.status}
            onChange={(event) => setEmployeeFilter((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="ALL">{t("common.all")}</option>
            <option value="ACTIVE">{t("common.active")}</option>
            <option value="INACTIVE">{t("common.inactive")}</option>
          </select>
          <button className="secondary" onClick={() => setEmployeeFilter({ query: "", department: "ALL", status: "ALL" })}>{t("common.clearFilters")}</button>
        </div>
        <div className="employee-table">
          <div className="employee-row employee-head">
            <b>{t("common.name")}</b>
            <b>{t("common.department")}</b>
            <b>{t("common.status")}</b>
            <b>{t("common.actions")}</b>
          </div>
          {visibleEmployees.map((employee) => (
            <div className="employee-row" key={employee.id}>
              <span className={employeeGenderClass(employee.name)}>{employee.name}</span>
              <span>{labelEmployeeDepartment(employee.department)}</span>
              <span className={`badge ${employee.active ? "paid" : "unpaid"}`}>
                {employee.active ? t("common.active") : t("common.inactive")}
              </span>
              <span className="actions">
                <button className="btn-edit" onClick={() => editEmployee(employee)}>{t("common.edit")}</button>
                <button className={employee.active ? "danger" : "btn-unarchive"} onClick={() => toggleEmployee(employee)}>
                  {employee.active ? t("common.deactivate") : t("common.activate")}
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>}

      {settingsTab === "customers" && <section className="employee-manager">
        <div className="row">
          <div>
            <h3>{t("manager.customerManagement")}</h3>
            <div className="muted">{t("manager.customerManagementHint")}</div>
          </div>
          <button className="btn-print" onClick={exportCustomersCsv}>{t("manager.exportExcel")}</button>
        </div>
        <div className="form-grid settings-filter-grid">
          <input
            value={customerFilter}
            onChange={(event) => setCustomerFilter(event.target.value)}
            placeholder={t("manager.customerSearch")}
          />
          <button className="btn-confirm" onClick={() => loadCustomers(customerFilter)}>{t("common.refresh")}</button>
          <button className="secondary" onClick={() => {
            setCustomerFilter("");
            loadCustomers("");
          }}>{t("common.clearFilters")}</button>
        </div>
        {selectedCustomer && (
          <div className="customer-profile-card">
            <div className="row">
              <div>
                <h3>{selectedCustomer.name || "-"}</h3>
                <div className="muted">{selectedCustomer.phone || "-"}</div>
              </div>
              <button className="danger" onClick={() => setSelectedCustomer(null)}>{t("common.close")}</button>
            </div>
            <div className="grid three customer-profile-metrics">
              <Metric label={t("manager.visits")} value={formatNumber(selectedCustomer.visits || 0)} />
              <Metric label={t("common.children")} value={formatNumber(selectedCustomer.children?.length || 0)} />
              <Metric label={t("manager.recordLastActivity")} value={selectedCustomer.lastOrderAt ? formatDateTime(selectedCustomer.lastOrderAt) : "-"} />
            </div>
            {selectedCustomer.comments && <div className="customer-profile-note">{selectedCustomer.comments}</div>}
            <div className="grid two">
              <div className="customer-profile-section">
                <b>{t("common.children")}</b>
                {(selectedCustomer.children || []).map((child) => (
                  <div className="customer-profile-row" key={child.id || child.name}>
                    <span>{child.name}</span>
                    <span>{child.birthDate ? child.birthDate.slice(0, 10) : "-"}</span>
                    <span>{child.age !== "" && child.age !== undefined ? `${child.age} ${t("common.age")}` : "-"}</span>
                  </div>
                ))}
                {!selectedCustomer.children?.length && <div className="muted">{t("common.noData")}</div>}
              </div>
              <div className="customer-profile-section">
                <b>{t("manager.recentOrders")}</b>
                {(selectedCustomer.recentOrders || []).map((order) => (
                  <div className="customer-profile-row" key={order.id}>
                    <span>{order.invoiceSerial || order.braceletNo}</span>
                    <span>{order.createdAt ? formatDateTime(order.createdAt) : "-"}</span>
                    <span>{currency(order.total || 0)} - {labelMethod(order.paymentMethod)}</span>
                  </div>
                ))}
                {!selectedCustomer.recentOrders?.length && <div className="muted">{t("common.noData")}</div>}
              </div>
            </div>
          </div>
        )}
        <div className="employee-table customer-table">
          <div className="employee-row customer-row employee-head">
            <b>{t("front.customerName")}</b>
            <b>{t("common.phone")}</b>
            <b>{t("common.children")}</b>
            <b>{t("manager.visits")}</b>
            <b>{t("manager.recordLastActivity")}</b>
            <b>{t("common.actions")}</b>
          </div>
          {visibleCustomers.map((customer) => (
            <div className="employee-row customer-row" key={customer.id}>
              <span>{customer.name || "-"}</span>
              <span>{customer.phone || "-"}</span>
              <span className="customer-child-list">
                {(customer.children || []).slice(0, 6).map((child) => (
                  <span className="badge" key={child.id || `${customer.id}-${child.name}`}>
                    {child.name}{child.age !== "" && child.age !== undefined ? ` - ${child.age}` : ""}
                  </span>
                ))}
              </span>
              <span>{formatNumber(customer.visits || 0)}</span>
              <span>{customer.lastOrderAt ? formatDateTime(customer.lastOrderAt) : "-"}</span>
              <span className="actions">
                <button className="btn-details" onClick={() => setSelectedCustomer(customer)}>{t("manager.details")}</button>
              </span>
            </div>
          ))}
          {!visibleCustomers.length && <div className="muted settings-empty-row">{t("common.noData")}</div>}
        </div>
      </section>}

      {settingsTab === "products" && <section className="employee-manager">
        <div className="row">
          <div>
            <h3>{t("manager.productManagement")}</h3>
            <div className="muted">{t("manager.productManagementHint")}</div>
          </div>
          {productForm.id && <button className="danger" onClick={resetProductForm}>{t("common.cancel")}</button>}
        </div>
        <div className="product-preview-panel">
          <div>
            <h4>{t("manager.productPreview")}</h4>
            <div className="muted">{t("manager.productPreviewHint")}</div>
          </div>
          <div className="card product product-custom-accent product-preview-card" style={productPreviewStyle}>
            {productForm.imageUrl ? (
              <img className="front-product-image" src={productForm.imageUrl} alt={productForm.name || t("manager.productName")} loading="lazy" decoding="async" />
            ) : (
              <div className="front-product-letter product-custom-visual">{productPreviewText(productForm)}</div>
            )}
            <div className="product-name">{productForm.name || t("manager.productName")}</div>
            <div className="product-body">
              <span className="product-price">{currency(Number(productForm.price) || 0)}</span>
            </div>
          </div>
        </div>
        <div className="category-manager-panel">
          <div className="row compact-row">
            <div>
              <h4>{t("manager.categoryManagement")}</h4>
              <div className="muted">{t("manager.categoryManagementHint")}</div>
            </div>
            {categoryForm.id && <button className="danger" onClick={resetCategoryForm}>{t("common.cancel")}</button>}
          </div>
          <div className="form-grid category-form-grid">
            <input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("manager.categoryName")} />
            <select
              aria-label={t("manager.productDepartment")}
              value={categoryForm.department}
              onChange={(event) => setCategoryForm((current) => ({
                ...current,
                department: event.target.value,
                showInDataOrder: event.target.value === "KITCHEN" ? current.showInDataOrder : false,
                showInQuickOrder: event.target.value !== "ENTRANCE" ? current.showInQuickOrder : false,
              }))}
            >
              {productDepartments.map((department) => <option key={department} value={department}>{labelDepartment(department)}</option>)}
            </select>
            <input type="number" min="1" value={categoryForm.sortOrder} onChange={(event) => setCategoryForm((current) => ({ ...current, sortOrder: event.target.value }))} placeholder={t("manager.sortOrder")} />
            <label>
              <span>{t("manager.categoryColor")}</span>
              <input type="color" value={categoryForm.color || "#3d1859"} onChange={(event) => setCategoryForm((current) => ({ ...current, color: event.target.value }))} />
            </label>
            <label className="toggle-row">
              <input type="checkbox" checked={categoryForm.active} onChange={(event) => setCategoryForm((current) => ({ ...current, active: event.target.checked }))} />
              <span>{categoryForm.active ? t("common.active") : t("common.inactive")}</span>
            </label>
            <label className="toggle-row">
              <input type="checkbox" disabled={categoryForm.department !== "KITCHEN"} checked={categoryForm.department === "KITCHEN" && categoryForm.showInDataOrder} onChange={(event) => setCategoryForm((current) => ({ ...current, showInDataOrder: event.target.checked }))} />
              <span>{t("manager.showInDataOrder")}</span>
            </label>
            <label className="toggle-row">
              <input type="checkbox" disabled={categoryForm.department === "ENTRANCE"} checked={categoryForm.department !== "ENTRANCE" && categoryForm.showInQuickOrder} onChange={(event) => setCategoryForm((current) => ({ ...current, showInQuickOrder: event.target.checked }))} />
              <span>{t("manager.showInQuickOrder")}</span>
            </label>
            <div className="product-schedule-editor">
              <b>{t("manager.categoryAvailability")}</b>
              <div className="product-day-grid">
                {productAvailabilityDays.map((day) => (
                  <label className="toggle-row" key={day}>
                    <input
                      type="checkbox"
                      checked={categoryForm.availabilityDays.includes(day)}
                      onChange={(event) => setCategoryForm((current) => ({
                        ...current,
                        availabilityDays: event.target.checked
                          ? [...new Set([...current.availabilityDays, day])]
                          : current.availabilityDays.filter((item) => item !== day),
                      }))}
                    />
                    <span>{t(`day.${day}`)}</span>
                  </label>
                ))}
              </div>
              <div className="form-grid product-time-grid">
                <label>
                  <span>{t("manager.availabilityStart")}</span>
                  <input type="time" value={categoryForm.availabilityStartTime} onChange={(event) => setCategoryForm((current) => ({ ...current, availabilityStartTime: event.target.value }))} />
                </label>
                <label>
                  <span>{t("manager.availabilityEnd")}</span>
                  <input type="time" value={categoryForm.availabilityEndTime} onChange={(event) => setCategoryForm((current) => ({ ...current, availabilityEndTime: event.target.value }))} />
                </label>
              </div>
              <small className="muted">{t("manager.categoryAvailabilityHint")}</small>
            </div>
            <button className="btn-confirm" onClick={saveCategory}>{categoryForm.id ? t("manager.updateCategory") : t("manager.addCategory")}</button>
          </div>
          <div className="form-grid settings-filter-grid category-filter-grid">
            <input value={categoryFilter.query} onChange={(event) => setCategoryFilter((current) => ({ ...current, query: event.target.value }))} placeholder={t("manager.categorySearch")} />
            <select
              aria-label={t("manager.productDepartment")}
              value={categoryFilter.department}
              onChange={(event) => setCategoryFilter((current) => ({ ...current, department: event.target.value }))}
            >
              {productDepartmentOptions.map((department) => <option key={department} value={department}>{department === "ALL" ? t("manager.allDepartments") : labelDepartment(department)}</option>)}
            </select>
            <select
              aria-label={t("common.status")}
              value={categoryFilter.status}
              onChange={(event) => setCategoryFilter((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="ALL">{t("common.all")}</option>
              <option value="ACTIVE">{t("common.active")}</option>
              <option value="INACTIVE">{t("common.inactive")}</option>
            </select>
            <button className="secondary" onClick={() => setCategoryFilter({ query: "", department: "ALL", status: "ALL" })}>{t("common.clearFilters")}</button>
          </div>
          <div className="employee-table category-table">
            <div className="employee-row category-row employee-head">
              <b>{t("manager.categoryName")}</b>
              <b>{t("manager.productDepartment")}</b>
              <b>{t("manager.productsCount")}</b>
              <b>{t("manager.sortOrder")}</b>
              <b>{t("manager.productScope")}</b>
              <b>{t("common.status")}</b>
              <b>{t("common.actions")}</b>
            </div>
            {visibleCategories.map((category) => {
              const categoryProductCount = products.filter((product) => product.categoryName === category.name || product.categoryId === category.id).length;
              return (
                <div className="employee-row category-row" key={category.id}>
                  <span className="category-title-cell">
                    <i className="category-color-dot" style={{ background: category.color || "#3d1859" }} />
                    <b>{category.name}</b>
                    <small>{category.id}</small>
                  </span>
                  <span>{labelDepartment(category.department)}</span>
                  <span>{formatNumber(categoryProductCount)}</span>
                  <span>{formatNumber(category.sortOrder || 100)}</span>
                  <span className="product-scope-tags">
                    {category.showInDataOrder && <span className="scope-tag data">{t("manager.onlyData")}</span>}
                    {category.showInQuickOrder && <span className="scope-tag quick">{t("manager.onlyQuick")}</span>}
                    <span className={`scope-tag ${categoryHasSchedule(category) ? "scheduled" : "muted"}`}>
                      {categoryHasSchedule(category) ? t("manager.scheduledProduct") : t("manager.unscheduledProduct")}
                    </span>
                  </span>
                  <span className={`badge ${category.active ? "paid" : "unpaid"}`}>{category.active ? t("common.active") : t("common.inactive")}</span>
                  <span className="actions">
                    <button className="btn-edit" onClick={() => editCategory(category)}>{t("common.edit")}</button>
                    <button className={category.active ? "danger" : "btn-unarchive"} onClick={() => toggleCategory(category)}>
                      {category.active ? t("common.deactivate") : t("common.activate")}
                    </button>
                  </span>
                </div>
              );
            })}
            {!visibleCategories.length && <div className="muted settings-empty-row">{t("common.noData")}</div>}
          </div>
        </div>
        <div className="form-grid product-form-grid">
          <input value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("manager.productName")} />
          <input type="number" min="0" value={productForm.price} onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))} placeholder={t("manager.productPrice")} />
          <input type="number" min="1" value={productForm.sortOrder} onChange={(event) => setProductForm((current) => ({ ...current, sortOrder: event.target.value }))} placeholder={t("manager.sortOrder")} />
          <select
            aria-label={t("manager.productDepartment")}
            value={productForm.department}
            onChange={(event) => setProductForm((current) => ({
              ...current,
              department: event.target.value,
              printOnKitchen: event.target.value !== "ENTRANCE" ? current.printOnKitchen : false,
              showInDataOrder: event.target.value === "KITCHEN" ? current.showInDataOrder : false,
              showInQuickOrder: event.target.value !== "ENTRANCE" ? current.showInQuickOrder : false,
            }))}
          >
            {productDepartments.map((department) => <option key={department} value={department}>{labelDepartment(department)}</option>)}
          </select>
          <input
            list="product-category-options"
            value={productForm.categoryName}
            onChange={(event) => {
              const nextName = event.target.value;
              const matchedCategory = productFormCategoryOptions.find((category) => category.name === nextName || category.id === nextName);
              setProductForm((current) => ({ ...current, categoryName: nextName, categoryId: matchedCategory?.id || nextName }));
            }}
            placeholder={t("manager.categoryName")}
          />
          <datalist id="product-category-options">
            {productFormCategoryOptions.map((category) => <option key={category.id} value={category.name} />)}
          </datalist>
          <input value={productForm.imageUrl} onChange={(event) => setProductForm((current) => ({ ...current, imageUrl: event.target.value }))} placeholder={t("manager.productImage")} />
          <input value={productForm.iconText} onChange={(event) => setProductForm((current) => ({ ...current, iconText: event.target.value }))} placeholder={t("manager.productIconText")} />
          <div className="product-tax-editor">
            <b>{t("manager.productTaxEta")}</b>
            <div className="form-grid product-tax-grid">
              <input type="number" min="0" step="0.01" value={productForm.originalPrice} onChange={(event) => setProductForm((current) => ({ ...current, originalPrice: event.target.value }))} placeholder={t("manager.originalPrice")} />
              <input type="number" min="0" step="0.01" value={productForm.netSales} onChange={(event) => setProductForm((current) => ({ ...current, netSales: event.target.value }))} placeholder={t("manager.netSales")} />
              <input type="number" min="0" step="0.01" value={productForm.taxAmount} onChange={(event) => setProductForm((current) => ({ ...current, taxAmount: event.target.value }))} placeholder={t("manager.taxAmount")} />
              <input type="number" min="0" step="0.01" value={productForm.taxRate} onChange={(event) => setProductForm((current) => ({ ...current, taxRate: event.target.value }))} placeholder={t("manager.taxRate")} />
              <input value={productForm.etaItemCode} onChange={(event) => setProductForm((current) => ({ ...current, etaItemCode: event.target.value }))} placeholder={t("manager.etaItemCode")} />
              <input value={productForm.etaCodeType} onChange={(event) => setProductForm((current) => ({ ...current, etaCodeType: event.target.value }))} placeholder={t("manager.etaCodeType")} />
              <input value={productForm.etaUnitType} onChange={(event) => setProductForm((current) => ({ ...current, etaUnitType: event.target.value }))} placeholder={t("manager.etaUnitType")} />
              <input value={productForm.etaTaxType} onChange={(event) => setProductForm((current) => ({ ...current, etaTaxType: event.target.value }))} placeholder={t("manager.etaTaxType")} />
              <input value={productForm.etaTaxSubType} onChange={(event) => setProductForm((current) => ({ ...current, etaTaxSubType: event.target.value }))} placeholder={t("manager.etaTaxSubType")} />
            </div>
            <small className="muted">{t("manager.productTaxEtaHint")}</small>
          </div>
          <label>
            <span>{t("manager.cardStartColor")}</span>
            <input type="color" value={productForm.cardColorStart} onChange={(event) => setProductForm((current) => ({ ...current, cardColorStart: event.target.value }))} />
          </label>
          <label>
            <span>{t("manager.cardEndColor")}</span>
            <input type="color" value={productForm.cardColorEnd} onChange={(event) => setProductForm((current) => ({ ...current, cardColorEnd: event.target.value }))} />
          </label>
          <label>
            <span>{t("manager.cardTextColor")}</span>
            <input type="color" value={productForm.cardTextColor} onChange={(event) => setProductForm((current) => ({ ...current, cardTextColor: event.target.value }))} />
          </label>
          <label>
            <span>{t("manager.cardAccentColor")}</span>
            <input type="color" value={productForm.cardAccentColor} onChange={(event) => setProductForm((current) => ({ ...current, cardAccentColor: event.target.value }))} />
          </label>
          <div className="product-schedule-editor">
            <b>{t("manager.productAvailability")}</b>
            <div className="product-day-grid">
              {productAvailabilityDays.map((day) => (
                <label className="toggle-row" key={day}>
                  <input
                    type="checkbox"
                    checked={productForm.availabilityDays.includes(day)}
                    onChange={(event) => setProductForm((current) => ({
                      ...current,
                      availabilityDays: event.target.checked
                        ? [...new Set([...current.availabilityDays, day])]
                        : current.availabilityDays.filter((item) => item !== day),
                    }))}
                  />
                  <span>{t(`day.${day}`)}</span>
                </label>
              ))}
            </div>
            <div className="form-grid product-time-grid">
              <label>
                <span>{t("manager.availabilityStart")}</span>
                <input type="time" value={productForm.availabilityStartTime} onChange={(event) => setProductForm((current) => ({ ...current, availabilityStartTime: event.target.value }))} />
              </label>
              <label>
                <span>{t("manager.availabilityEnd")}</span>
                <input type="time" value={productForm.availabilityEndTime} onChange={(event) => setProductForm((current) => ({ ...current, availabilityEndTime: event.target.value }))} />
              </label>
            </div>
            <small className="muted">{t("manager.productAvailabilityHint")}</small>
          </div>
          <label className="toggle-row">
            <input type="checkbox" checked={productForm.popular} onChange={(event) => setProductForm((current) => ({ ...current, popular: event.target.checked }))} />
            <span>{t("manager.popularProduct")}</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={productForm.active} onChange={(event) => setProductForm((current) => ({ ...current, active: event.target.checked }))} />
            <span>{productForm.active ? t("common.active") : t("common.inactive")}</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" disabled={productForm.department === "ENTRANCE"} checked={productForm.printOnKitchen && productForm.department !== "ENTRANCE"} onChange={(event) => setProductForm((current) => ({ ...current, printOnKitchen: event.target.checked }))} />
            <span>{t("manager.printOnKitchen")}</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" disabled={productForm.department !== "KITCHEN"} checked={productForm.department === "KITCHEN" && productForm.showInDataOrder} onChange={(event) => setProductForm((current) => ({ ...current, showInDataOrder: event.target.checked }))} />
            <span>{t("manager.showInDataOrder")}</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" disabled={productForm.department === "ENTRANCE"} checked={productForm.department !== "ENTRANCE" && productForm.showInQuickOrder} onChange={(event) => setProductForm((current) => ({ ...current, showInQuickOrder: event.target.checked }))} />
            <span>{t("manager.showInQuickOrder")}</span>
          </label>
          <button className="btn-confirm" onClick={saveProduct}>{productForm.id ? t("manager.updateProduct") : t("manager.addProduct")}</button>
        </div>
        <div className="product-overview-panel">
          <div className="row compact-row">
            <div>
              <h4>{t("manager.productOverview")}</h4>
              <div className="muted">{t("manager.productManagementHint")}</div>
            </div>
          </div>
          <div className="product-overview-grid">
            {productSummaryCards.map((card) => {
              const activeCount = card.products.filter((product) => product.active).length;
              const popularCount = card.products.filter((product) => product.popular).length;
              const selected = productFilter.department === card.key;
              return (
                <button
                  type="button"
                  className={`product-overview-card tone-${card.tone} ${selected ? "active" : ""}`}
                  aria-pressed={selected}
                  key={card.key}
                  onClick={() => setProductFilter((current) => ({ ...current, department: card.key }))}
                >
                  <span>{card.label}</span>
                  <b>{formatNumber(card.products.length)}</b>
                  <small>{t("manager.activeProducts")}: {formatNumber(activeCount)} · {t("manager.popularProduct")}: {formatNumber(popularCount)}</small>
                </button>
              );
            })}
          </div>
        </div>
        <div className="form-grid settings-filter-grid product-settings-filter">
          <input value={productFilter.query} onChange={(event) => setProductFilter((current) => ({ ...current, query: event.target.value }))} placeholder={t("manager.productSearch")} />
          <select
            aria-label={t("manager.productDepartment")}
            value={productFilter.department}
            onChange={(event) => setProductFilter((current) => ({ ...current, department: event.target.value }))}
          >
            {productDepartmentOptions.map((department) => <option key={department} value={department}>{department === "ALL" ? t("manager.allDepartments") : labelDepartment(department)}</option>)}
          </select>
          <select
            aria-label={t("manager.categoryName")}
            value={productFilter.category}
            onChange={(event) => setProductFilter((current) => ({ ...current, category: event.target.value }))}
          >
            {productCategories.map((category) => <option key={category} value={category}>{category === "ALL" ? t("manager.allCategories") : category}</option>)}
          </select>
          <select
            aria-label={t("common.status")}
            value={productFilter.status}
            onChange={(event) => setProductFilter((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="ALL">{t("common.all")}</option>
            <option value="ACTIVE">{t("common.active")}</option>
            <option value="INACTIVE">{t("common.inactive")}</option>
          </select>
          <select
            aria-label={t("manager.popularProduct")}
            value={productFilter.popular}
            onChange={(event) => setProductFilter((current) => ({ ...current, popular: event.target.value }))}
          >
            <option value="ALL">{t("common.all")}</option>
            <option value="POPULAR">{t("manager.popularProduct")}</option>
            <option value="REGULAR">{t("manager.regularProduct")}</option>
          </select>
          <button className="secondary" onClick={() => setProductFilter({ query: "", department: "ALL", category: "ALL", status: "ALL", popular: "ALL" })}>{t("common.clearFilters")}</button>
        </div>
        <div className="product-bulk-bar">
          <div>
            <b>{t("manager.selectedProducts", { count: formatNumber(selectedProductIds.length) })}</b>
            <small>{t("manager.productManagementHint")}</small>
          </div>
          <div className="actions">
            <button className="secondary" onClick={selectVisibleProducts}>{t("manager.selectVisibleProducts")}</button>
            <button className="secondary" onClick={clearProductSelection}>{t("manager.clearProductSelection")}</button>
            <button className="btn-edit" title={t("manager.rankVisibleBySales")} onClick={rankProductsBySales}>{t("manager.rankBySales")}</button>
            <button className="btn-confirm" onClick={() => bulkUpdateProducts({ active: true })}>{t("manager.bulkActivate")}</button>
            <button className="danger" onClick={() => bulkUpdateProducts({ active: false })}>{t("manager.bulkDeactivate")}</button>
            <button className="btn-edit" onClick={() => bulkUpdateProducts({ popular: true })}>{t("manager.bulkPopular")}</button>
            <button className="secondary" onClick={() => bulkUpdateProducts({ popular: false })}>{t("manager.bulkRegular")}</button>
            <button className="btn-confirm" onClick={() => bulkUpdateProducts({ showInDataOrder: true })}>{t("manager.bulkDataOn")}</button>
            <button className="secondary" onClick={() => bulkUpdateProducts({ showInDataOrder: false })}>{t("manager.bulkDataOff")}</button>
            <button className="btn-print" onClick={() => bulkUpdateProducts({ showInQuickOrder: true })}>{t("manager.bulkQuickOn")}</button>
            <button className="secondary" onClick={() => bulkUpdateProducts({ showInQuickOrder: false })}>{t("manager.bulkQuickOff")}</button>
            <button className="btn-unarchive" onClick={() => bulkUpdateProducts({ printOnKitchen: true })}>{t("manager.bulkPrintOn")}</button>
            <button className="secondary" onClick={() => bulkUpdateProducts({ printOnKitchen: false })}>{t("manager.bulkPrintOff")}</button>
          </div>
        </div>
        <div className="product-group-list">
          {productGroups.length === 0 && <div className="product-empty-state">{t("manager.productGroupEmpty")}</div>}
          {productGroups.map((group) => (
            <div className={`product-group tone-${group.department.toLowerCase().replace("_", "-")}`} key={group.department}>
              <div className="product-group-head">
                <div>
                  <h4>{labelDepartment(group.department)}</h4>
                  <span>{formatNumber(group.products.length)} · {t("manager.activeProducts")}: {formatNumber(group.products.filter((product) => product.active).length)}</span>
                </div>
                <button className="secondary" onClick={() => setProductFilter((current) => ({ ...current, department: group.department }))}>
                  {t("common.filter")}
                </button>
              </div>
              <div className="employee-table product-table">
                <div className="employee-row product-row employee-head">
                  <b></b>
                  <b>{t("common.name")}</b>
                  <b>{t("manager.categoryName")}</b>
                  <b>{t("manager.productPrice")}</b>
                  <b>{t("manager.popularProduct")}</b>
                  <b>{t("manager.sortOrder")}</b>
                  <b>{t("manager.productScope")}</b>
                  <b>{t("common.status")}</b>
                  <b>{t("common.actions")}</b>
                </div>
                {group.products.map((product) => (
                  <div className="employee-row product-row" key={product.id}>
                    <span className="product-select-cell">
                      <input
                        type="checkbox"
                        aria-label={product.name}
                        checked={selectedProductIdSet.has(product.id)}
                        onChange={() => toggleProductSelection(product.id)}
                      />
                    </span>
                    <span className="product-title-cell">
                      <b>{product.name}</b>
                      <small>{product.id}</small>
                    </span>
                    <span>{product.categoryName}</span>
                    <span>{currency(product.price)}</span>
                    <span className={`badge ${product.popular ? "paid" : ""}`}>{product.popular ? t("manager.popularProduct") : t("manager.regularProduct")}</span>
                    <span>{product.sortOrder || 100}</span>
                    <span className="product-scope-tags">
                      {product.showInDataOrder && <span className="scope-tag data">{t("manager.onlyData")}</span>}
                      {product.showInQuickOrder && <span className="scope-tag quick">{t("manager.onlyQuick")}</span>}
                      <span className={`scope-tag ${product.printOnKitchen ? "print" : "muted"}`}>
                        {product.printOnKitchen ? t("manager.onlyKitchenPrint") : t("manager.notPrinted")}
                      </span>
                      <span className={`scope-tag ${productHasSchedule(product) ? "scheduled" : "muted"}`}>
                        {productHasSchedule(product) ? t("manager.scheduledProduct") : t("manager.unscheduledProduct")}
                      </span>
                    </span>
                    <span className={`badge ${product.active ? "paid" : "unpaid"}`}>{product.active ? t("common.active") : t("common.inactive")}</span>
                    <span className="actions">
                      <button className="btn-edit" onClick={() => editProduct(product)}>{t("common.edit")}</button>
                      <button className={product.active ? "danger" : "btn-unarchive"} onClick={() => toggleProduct(product)}>
                        {product.active ? t("common.deactivate") : t("common.activate")}
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>}

      {settingsTab === "users" && <section className="employee-manager">
        <div className="row">
          <div>
            <h3>{t("manager.userManagement")}</h3>
            <div className="muted">{t("manager.userManagementHint")}</div>
          </div>
          {userForm.id && <button className="danger" onClick={resetUserForm}>{t("common.cancel")}</button>}
        </div>
        <div className="form-grid user-form-grid">
          <select
            aria-label={t("manager.accountType")}
            value={userForm.accountType}
            onChange={(event) => setUserForm((current) => ({
              ...current,
              accountType: event.target.value,
              employeeId: event.target.value === "EMPLOYEE" ? current.employeeId : "",
            }))}
          >
            <option value="GENERAL">{t("manager.generalAccount")}</option>
            <option value="EMPLOYEE">{t("manager.employeeAccount")}</option>
          </select>
          {userForm.accountType === "EMPLOYEE" && (
            <select
              aria-label={t("manager.selectEmployee")}
              value={userForm.employeeId}
              onChange={(event) => {
                const employee = activeEmployees.find((item) => item.id === event.target.value);
                setUserForm((current) => ({
                  ...current,
                  employeeId: event.target.value,
                  name: employee?.name || current.name,
                  role: roleForEmployeeDepartment(employee?.department),
                }));
              }}
            >
              <option value="">{t("manager.selectEmployee")}</option>
              {activeEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} - {labelEmployeeDepartment(employee.department)}
                </option>
              ))}
            </select>
          )}
          <input value={userForm.name} onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("common.name")} />
          <input value={userForm.username} onChange={(event) => setUserForm((current) => ({ ...current, username: event.target.value }))} placeholder={t("login.username")} />
          <input
            type="password"
            name="managed-user-new-password"
            value={userForm.password}
            onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
            placeholder={userForm.id ? t("manager.passwordOptional") : t("login.password")}
            autoComplete="new-password"
            autoCorrect="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore="true"
            data-form-type="other"
          />
          <select
            aria-label={t("common.role")}
            value={userForm.role}
            onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value }))}
          >
            {roles.map((role) => <option key={role} value={role}>{t(`role.${role}`)}</option>)}
          </select>
          <label className="toggle-row">
            <input type="checkbox" checked={userForm.active} onChange={(event) => setUserForm((current) => ({ ...current, active: event.target.checked }))} />
            <span>{userForm.active ? t("common.active") : t("common.inactive")}</span>
          </label>
          <button className="btn-confirm" onClick={saveUser}>{userForm.id ? t("manager.updateUser") : t("manager.addUser")}</button>
          <div className={`user-account-note ${userForm.accountType === "GENERAL" ? "general" : "employee"}`}>
            {userForm.accountType === "GENERAL" ? t("manager.generalAccountHint") : t("manager.employeeAccountHint")}
          </div>
        </div>
        <div className="form-grid settings-filter-grid">
          <input value={userFilter.query} onChange={(event) => setUserFilter((current) => ({ ...current, query: event.target.value }))} placeholder={t("manager.userSearch")} />
          <select
            aria-label={t("common.role")}
            value={userFilter.role}
            onChange={(event) => setUserFilter((current) => ({ ...current, role: event.target.value }))}
          >
            <option value="ALL">{t("common.all")}</option>
            {roles.map((role) => <option key={role} value={role}>{t(`role.${role}`)}</option>)}
          </select>
          <select
            aria-label={t("common.status")}
            value={userFilter.status}
            onChange={(event) => setUserFilter((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="ALL">{t("common.all")}</option>
            <option value="ACTIVE">{t("common.active")}</option>
            <option value="INACTIVE">{t("common.inactive")}</option>
          </select>
          <button className="secondary" onClick={() => setUserFilter({ query: "", role: "ALL", status: "ALL" })}>{t("common.clearFilters")}</button>
        </div>
        <div className="employee-table">
          <div className="employee-row user-row employee-head">
            <b>{t("common.name")}</b>
            <b>{t("login.username")}</b>
            <b>{t("manager.accountType")}</b>
            <b>{t("common.status")}</b>
            <b>{t("common.actions")}</b>
          </div>
          {visibleUsers.map((user) => (
            <div className="employee-row user-row" key={user.id}>
              <span>{user.name}</span>
              <span>{user.username} · {t(`role.${user.role}`)}</span>
              <span>
                {user.accountType === "EMPLOYEE" ? t("manager.employeeAccount") : t("manager.generalAccount")}
                {user.employeeName ? <small className="muted block">{user.employeeName}</small> : null}
              </span>
              <span className={`badge ${user.active ? "paid" : "unpaid"}`}>{user.active ? t("common.active") : t("common.inactive")}</span>
              <span className="actions">
                <button className="btn-edit" onClick={() => editUser(user)}>{t("common.edit")}</button>
                <button className={user.active ? "danger" : "btn-unarchive"} onClick={() => toggleUser(user)}>
                  {user.active ? t("common.deactivate") : t("common.activate")}
                </button>
              </span>
            </div>
          ))}
        </div>
        <div className="role-matrix-panel">
          <div className="row">
            <div>
              <h3>{t("manager.roleMatrix")}</h3>
              <div className="muted">{t("manager.roleMatrixHint")}</div>
            </div>
            <div className="actions">
              <button className="secondary" onClick={() => setAllRolePermissions(true)}>{t("manager.selectAllRoles")}</button>
              <button className="danger" onClick={() => setAllRolePermissions(false)}>{t("manager.unselectAllRoles")}</button>
              <button className="btn-confirm" onClick={saveRolePermissions}>{t("common.save")}</button>
            </div>
          </div>
          <div className="role-matrix-table">
            <div className="role-matrix-row role-matrix-head">
              <b>{t("manager.permission")}</b>
              {roles.map((role) => <b key={role}>{t(`role.${role}`)}</b>)}
            </div>
            {permissionKeys.map((permission) => (
              <div className="role-matrix-row" key={permission}>
                <span>{t(`permission.${permission}`)}</span>
                {roles.map((role) => (
                  <label className="role-check" key={role}>
                    <input
                      type="checkbox"
                      checked={(rolePermissions[permission] || []).includes(role)}
                      onChange={() => toggleRolePermission(permission, role)}
                    />
                  </label>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>}

      {settingsTab === "devices" && <section className="employee-manager">
        <div className="row">
          <div>
            <h3>{t("manager.deviceManagement")}</h3>
            <div className="muted">{t("manager.deviceManagementHint")}</div>
          </div>
          {deviceForm.id && <button className="danger" onClick={resetDeviceForm}>{t("common.cancel")}</button>}
        </div>
        <div className="form-grid device-form-grid">
          <input value={deviceForm.id} readOnly placeholder={t("manager.deviceId")} />
          <input type="number" min="1" max="10" value={deviceForm.deviceNo} onChange={(event) => setDeviceForm((current) => ({ ...current, deviceNo: event.target.value }))} placeholder={t("manager.deviceNo")} />
          <input value={deviceForm.name} onChange={(event) => setDeviceForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("manager.deviceName")} />
          <select
            aria-label={t("manager.deviceType")}
            value={deviceForm.type}
            onChange={(event) => setDeviceForm((current) => ({ ...current, type: event.target.value }))}
          >
            {deviceTypes.map((type) => <option key={type} value={type}>{labelDeviceType(type)}</option>)}
          </select>
          <input value={deviceForm.invoicePrinterName} onChange={(event) => setDeviceForm((current) => ({ ...current, invoicePrinterName: event.target.value }))} placeholder={t("manager.invoicePrinterName")} />
          <input value={deviceForm.kitchenPrinterName} onChange={(event) => setDeviceForm((current) => ({ ...current, kitchenPrinterName: event.target.value }))} placeholder={t("manager.kitchenPrinterName")} />
          <input value={deviceForm.posSerial} onChange={(event) => setDeviceForm((current) => ({ ...current, posSerial: event.target.value }))} placeholder={t("manager.posSerial")} />
          <input value={deviceForm.branchCode} onChange={(event) => setDeviceForm((current) => ({ ...current, branchCode: event.target.value }))} placeholder={t("manager.branchCode")} />
          <label className="toggle-row">
            <input type="checkbox" checked={deviceForm.active} onChange={(event) => setDeviceForm((current) => ({ ...current, active: event.target.checked }))} />
            <span>{deviceForm.active ? t("common.active") : t("common.inactive")}</span>
          </label>
          <button className="btn-confirm" onClick={saveDevice}>{deviceForm.id ? t("manager.updateDevice") : t("manager.addDevice")}</button>
        </div>
        <div className="form-grid settings-filter-grid">
          <input value={deviceFilter.query} onChange={(event) => setDeviceFilter((current) => ({ ...current, query: event.target.value }))} placeholder={t("manager.deviceSearch")} />
          <select
            aria-label={t("manager.deviceType")}
            value={deviceFilter.type}
            onChange={(event) => setDeviceFilter((current) => ({ ...current, type: event.target.value }))}
          >
            <option value="ALL">{t("common.all")}</option>
            {deviceTypes.map((type) => <option key={type} value={type}>{labelDeviceType(type)}</option>)}
          </select>
          <select
            aria-label={t("common.status")}
            value={deviceFilter.status}
            onChange={(event) => setDeviceFilter((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="ALL">{t("common.all")}</option>
            <option value="ACTIVE">{t("common.active")}</option>
            <option value="INACTIVE">{t("common.inactive")}</option>
          </select>
          <button className="secondary" onClick={() => setDeviceFilter({ query: "", type: "ALL", status: "ALL" })}>{t("common.clearFilters")}</button>
        </div>
        <div className="employee-table">
          <div className="employee-row device-row employee-head">
            <b>{t("manager.deviceNo")}</b>
            <b>{t("common.name")}</b>
            <b>{t("manager.deviceType")}</b>
            <b>{t("manager.printers")}</b>
            <b>{t("common.status")}</b>
            <b>{t("common.actions")}</b>
          </div>
          {visibleDevices.map((device) => (
            <div className="employee-row device-row" key={device.id}>
              <span><b>{device.deviceNo}</b><small className="muted block">{device.id}</small></span>
              <span>{device.name}</span>
              <span>{labelDeviceType(device.type)}</span>
              <span>
                <small className="block">{t("settings.invoicePrinter")}: {device.invoicePrinterName || "-"}</small>
                <small className="block">{t("settings.kitchenPrinter")}: {device.kitchenPrinterName || "-"}</small>
              </span>
              <span className={`badge ${device.active ? "paid" : "unpaid"}`}>{device.active ? t("common.active") : t("common.inactive")}</span>
              <span className="actions">
                <button className="btn-edit" onClick={() => editDevice(device)}>{t("common.edit")}</button>
                <button className={device.active ? "danger" : "btn-unarchive"} onClick={() => toggleDevice(device)}>
                  {device.active ? t("common.deactivate") : t("common.activate")}
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>}

      {settingsTab === "paymentProviders" && <section className="employee-manager">
        <div className="row">
          <div>
            <h3>{t("manager.paymentProviderManagement")}</h3>
            <div className="muted">{t("manager.paymentProviderManagementHint")}</div>
          </div>
          {paymentProviderForm.id && <button className="danger" onClick={resetPaymentProviderForm}>{t("common.cancel")}</button>}
        </div>
        <div className="form-grid payment-provider-form-grid">
          <input value={paymentProviderForm.id} readOnly placeholder={t("manager.paymentProviderId")} />
          <input value={paymentProviderForm.name} onChange={(event) => setPaymentProviderForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("manager.paymentProviderName")} />
          <select
            aria-label={t("manager.paymentProviderMethod")}
            value={paymentProviderForm.method}
            onChange={(event) => {
              const method = event.target.value;
              setPaymentProviderForm((current) => ({
                ...current,
                method,
                type: method === "CASH" ? "CASH" : method === "VISA" ? "VISA" : "CUSTOM",
                reportBucket: current.reportBucket || (method === "CASH" ? "CASH" : method === "VISA" ? "VISA" : "CUSTOM"),
              }));
            }}
          >
            {paymentProviderMethods.map((method) => <option key={method} value={method}>{labelMethod(method)}</option>)}
          </select>
          <select
            aria-label={t("manager.paymentProviderType")}
            value={paymentProviderForm.type}
            onChange={(event) => setPaymentProviderForm((current) => ({ ...current, type: event.target.value }))}
          >
            {paymentProviderTypes.map((type) => <option key={type} value={type}>{labelPaymentProviderType(type)}</option>)}
          </select>
          <input value={paymentProviderForm.reportBucket} onChange={(event) => setPaymentProviderForm((current) => ({ ...current, reportBucket: event.target.value }))} placeholder={t("manager.reportBucket")} />
          <input type="number" min="1" value={paymentProviderForm.sortOrder} onChange={(event) => setPaymentProviderForm((current) => ({ ...current, sortOrder: event.target.value }))} placeholder={t("manager.sortOrder")} />
          <label className="toggle-row">
            <input type="checkbox" checked={paymentProviderForm.active} onChange={(event) => setPaymentProviderForm((current) => ({ ...current, active: event.target.checked }))} />
            <span>{paymentProviderForm.active ? t("common.active") : t("common.inactive")}</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={paymentProviderForm.editable} onChange={(event) => setPaymentProviderForm((current) => ({ ...current, editable: event.target.checked }))} />
            <span>{t("manager.editableProvider")}</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={paymentProviderForm.showInFrontOrder} onChange={(event) => setPaymentProviderForm((current) => ({ ...current, showInFrontOrder: event.target.checked }))} />
            <span>{t("manager.showInFrontOrder")}</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={paymentProviderForm.showInDataOrder} onChange={(event) => setPaymentProviderForm((current) => ({ ...current, showInDataOrder: event.target.checked }))} />
            <span>{t("manager.showInDataOrder")}</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={paymentProviderForm.showInQuickOrder} onChange={(event) => setPaymentProviderForm((current) => ({ ...current, showInQuickOrder: event.target.checked }))} />
            <span>{t("manager.showInQuickOrder")}</span>
          </label>
          <button className="btn-confirm" onClick={savePaymentProvider}>{paymentProviderForm.id ? t("manager.updatePaymentProvider") : t("manager.addPaymentProvider")}</button>
        </div>
        <div className="form-grid settings-filter-grid">
          <input value={paymentProviderFilter.query} onChange={(event) => setPaymentProviderFilter((current) => ({ ...current, query: event.target.value }))} placeholder={t("manager.paymentProviderSearch")} />
          <select
            aria-label={t("manager.paymentProviderType")}
            value={paymentProviderFilter.type}
            onChange={(event) => setPaymentProviderFilter((current) => ({ ...current, type: event.target.value }))}
          >
            <option value="ALL">{t("common.all")}</option>
            {paymentProviderTypes.map((type) => <option key={type} value={type}>{labelPaymentProviderType(type)}</option>)}
          </select>
          <select
            aria-label={t("common.status")}
            value={paymentProviderFilter.status}
            onChange={(event) => setPaymentProviderFilter((current) => ({ ...current, status: event.target.value }))}
          >
            <option value="ALL">{t("common.all")}</option>
            <option value="ACTIVE">{t("common.active")}</option>
            <option value="INACTIVE">{t("common.inactive")}</option>
          </select>
          <button className="secondary" onClick={() => setPaymentProviderFilter({ query: "", type: "ALL", status: "ALL" })}>{t("common.clearFilters")}</button>
        </div>
        <div className="employee-table">
          <div className="employee-row payment-provider-row employee-head">
            <b>{t("common.name")}</b>
            <b>{t("common.method")}</b>
            <b>{t("manager.paymentProviderType")}</b>
            <b>{t("manager.reportBucket")}</b>
            <b>{t("manager.productScope")}</b>
            <b>{t("common.status")}</b>
            <b>{t("common.actions")}</b>
          </div>
          {visiblePaymentProviders.map((provider) => (
            <div className="employee-row payment-provider-row" key={provider.id}>
              <span><b>{provider.name}</b><small className="muted block">{provider.id}</small></span>
              <span>{labelMethod(provider.method)}</span>
              <span>{labelPaymentProviderType(provider.type)}</span>
              <span>{provider.reportBucket || "-"}</span>
              <span className="product-scope-tags">
                {provider.showInFrontOrder && <span className="scope-tag front">{t("manager.onlyFront")}</span>}
                {provider.showInDataOrder && <span className="scope-tag data">{t("manager.onlyData")}</span>}
                {provider.showInQuickOrder && <span className="scope-tag quick">{t("manager.onlyQuick")}</span>}
              </span>
              <span className={`badge ${provider.active ? "paid" : "unpaid"}`}>{provider.active ? t("common.active") : t("common.inactive")}</span>
              <span className="actions">
                <button className="btn-edit" onClick={() => editPaymentProvider(provider)}>{t("common.edit")}</button>
                <button className={provider.active ? "danger" : "btn-unarchive"} onClick={() => togglePaymentProvider(provider)}>
                  {provider.active ? t("common.deactivate") : t("common.activate")}
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>}

      {settingsSection("branch", t("settings.branchSettings"), t("settings.branchSettingsHint"), settingsGroups.branch)}
      {renderInvoiceSettings()}
      {settingsSection("printing", t("settings.printSettings"), t("settings.printSettingsHint"), settingsGroups.printing)}
      {settingsSection("business", t("settings.businessSettings"), t("settings.businessSettingsHint"), settingsGroups.business)}
      {settingsSection("workflow", t("settings.workflowSettings"), t("settings.workflowSettingsHint"), settingsGroups.workflow)}
      {settingsSection("reports", t("settings.reportSettings"), t("settings.reportSettingsHint"), settingsGroups.reports)}
      {settingsTab === "recordsStyle" && <section className="employee-manager">
        <div className="row">
          <div>
            <h3>{t("settings.recordTableSettings")}</h3>
            <div className="muted">{t("settings.recordTableSettingsHint")}</div>
          </div>
          <button className="btn-confirm" onClick={saveRecordTableStyles}>{t("common.save")}</button>
        </div>
        <div className="employee-style-panel record-style-panel">
          <div className="tabs preset-tabs">
            {[
              ["classic", t("settings.presetClassic")],
              ["clean", t("settings.presetClean")],
              ["highContrast", t("settings.presetHighContrast")],
              ["printFriendly", t("settings.presetPrintFriendly")],
            ].map(([preset, label]) => (
              <button type="button" key={preset} onClick={() => applyRecordPreset(preset)}>{label}</button>
            ))}
          </div>
          <div className="record-table-scroll record-style-preview">
            <table className="record-line-table">
              <thead>
                <tr>
                  <th>{t("common.order")}</th>
                  <th>{t("manager.recordPaid")}</th>
                  <th>{t("manager.recordGeidea")}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><b>ORD#41</b></td>
                  <td>
                    <span className="record-step-cell">
                      <b>12:45:05 PM</b>
                      <small><span className="general-account-name">Admin</span><em className="record-method-visa"> - {labelMethod("VISA")}</em></small>
                    </span>
                  </td>
                  <td>
                    <span className="record-step-cell">
                      <b>12:45:06 PM</b>
                      <small><span className="employee-name-female">نبيلة فتحي</span></small>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="ui-message-fields record-style-fields">
            {[
              ["headerBackgroundColor", t("settings.recordHeaderBackground"), "color"],
              ["headerTextColor", t("settings.recordHeaderText"), "color"],
              ["tableTextColor", t("settings.recordTableText"), "color"],
              ["borderColor", t("settings.recordBorderColor"), "color"],
              ["alternateRowColor", t("settings.recordAlternateRow"), "color"],
              ["hoverRowColor", t("settings.recordHoverRow"), "color"],
              ["timeColor", t("settings.recordTimeColor"), "color"],
              ["totalColor", t("settings.recordTotalColor"), "color"],
              ["timeFontSize", t("settings.recordTimeFontSize"), "number", 10, 22],
              ["actorFontSize", t("settings.recordActorFontSize"), "number", 9, 20],
              ["actorFontWeight", t("settings.recordActorFontWeight"), "number", 400, 950, 50],
              ["cellPaddingY", t("settings.recordCellPaddingY"), "number", 4, 20],
              ["cellPaddingX", t("settings.recordCellPaddingX"), "number", 4, 24],
              ["minWidth", t("settings.recordTableMinWidth"), "number", 900, 2600, 50],
            ].map(([field, label, type, min, max, step]) => (
              <label key={field}>
                <span>{label}</span>
                <input
                  type={type}
                  min={min}
                  max={max}
                  step={step}
                  value={recordTableStyles[field]}
                  onChange={(event) => updateRecordTableStyle(field, event.target.value)}
                />
              </label>
            ))}
          </div>
        </div>
      </section>}
      {settingsSection("auditBackup", t("settings.auditBackupSettings"), t("settings.auditBackupSettingsHint"), settingsGroups.auditBackup)}

      {settingsTab === "backupRestore" && <section className="employee-manager">
        <div className="row">
          <div>
            <h3>{t("manager.backupRestore")}</h3>
            <div className="muted">{t("manager.backupRestoreHint")}</div>
          </div>
          <div className="actions">
            <button className="btn-details" onClick={createManualBackup}>{t("manager.createSnapshot")}</button>
            <button className="btn-confirm" onClick={createManualBackup}>{t("manager.createBackup")}</button>
            <button className="secondary" onClick={refreshBackups}>{t("common.refresh")}</button>
          </div>
        </div>
        <div className="employee-table backup-table">
          <div className="employee-row backup-row employee-head">
            <b>{t("manager.backupFile")}</b>
            <b>{t("manager.backupSize")}</b>
            <b>{t("manager.backupDate")}</b>
            <b>{t("common.actions")}</b>
          </div>
          {backups.length === 0 ? (
            <div className="muted backup-empty">{t("manager.noBackups")}</div>
          ) : backups.map((backup) => (
            <div className="employee-row backup-row" key={backup.name}>
              <span>{backup.name}</span>
              <span>{formatNumber(Math.round((Number(backup.size) || 0) / 1024))} KB</span>
              <span>{formatDateTime(backup.modifiedAt)}</span>
              <span className="actions">
                <button className="btn-print" onClick={() => downloadBackup(backup.name)}>{t("manager.downloadBackup")}</button>
                <button className="danger" onClick={() => restoreDatabaseBackup(backup.name)}>{t("manager.restoreBackup")}</button>
              </span>
            </div>
          ))}
        </div>
      </section>}

      {settingsTab === "messages" && <section className="employee-manager">
        <div className="row">
          <div>
            <h3>{t("manager.uiMessages")}</h3>
            <div className="muted">{t("manager.uiMessagesHint")}</div>
          </div>
          <button className="btn-confirm" onClick={saveUiMessages}>{t("common.save")}</button>
        </div>
        <div className="ui-message-category-list">
          {uiMessageGroups.map((group) => (
            <section className="ui-message-category" key={group.titleKey}>
              <div className="ui-message-category-head">
                <h4>{t(group.titleKey)}</h4>
                <span>{formatNumber(group.keys.length)}</span>
              </div>
              <div className="ui-message-grid">
                {group.keys.map(renderUiMessageEditor)}
              </div>
            </section>
          ))}
        </div>
      </section>}
        </div>
      </section>}

      {managerTab === "records" && <section className="panel">
        <div className="row">
          <div>
            <h3>{t("manager.orderRecords")}</h3>
            <div className="muted">{t("manager.orderRecordsHint")} · {selectedPeriodLabel()}</div>
          </div>
          <div className="actions">
            {renderDateRangePicker()}
            <button className="btn-print" onClick={exportRecordsCsv}>{t("manager.exportExcel")}</button>
            <button className="btn-details" onClick={printRecordsPdf}>{t("manager.exportPdf")}</button>
          </div>
        </div>
        <div className="form-grid manager-filter-grid">
          <input
            value={recordQuery}
            onChange={(event) => setRecordQuery(event.target.value)}
            placeholder={t("manager.searchRecordPlaceholder")}
          />
          <button className="secondary" onClick={() => setRecordQuery("")}>{t("common.clearFilters")}</button>
        </div>
        {periodOrderRecords.length === 0 ? (
          <div className="muted">{t("manager.noRecords")}</div>
        ) : (
          <div className="record-table-scroll">
            <table className="record-line-table">
              <thead>
                <tr>
                  <th>{t("common.order")}</th>
                  <th>{t("common.bracelet")}</th>
                  <th>{t("common.children")}</th>
                  <th>{t("common.orderTotal")}</th>
                  <th>{t("manager.recordCreated")}{recordDateHeading()}</th>
                  <th>{t("manager.recordPreparation")}{recordDateHeading()}</th>
                  <th>{t("manager.recordDelivered")}{recordDateHeading()}</th>
                  <th>{t("manager.recordPaid")}{recordDateHeading()}</th>
                  <th>{t("manager.recordGeidea")}{recordDateHeading()}</th>
                  <th>{t("manager.recordLeft")}{recordDateHeading()}</th>
                  <th>{t("manager.recordArchived")}{recordDateHeading()}</th>
                  <th>{t("manager.recordLastActivity")}</th>
                </tr>
              </thead>
              <tbody>
            {periodOrderRecords.map((record) => (
              <tr key={record.id}>
                <td><b>{record.orderId}</b></td>
                <td>{record.braceletNo}</td>
                <td>{record.childNames || "-"}</td>
                <td><b className="record-total">{currency(record.orderTotal)}</b></td>
                <td>{recordStepCell(record, "orderCreated", "orderCreatedAt")}</td>
                <td>{recordStepCell(record, "preparationStarted", "preparationStartedAt")}</td>
                <td>{recordStepCell(record, "delivered", "deliveredAt")}</td>
                <td>{recordStepCell(record, "paid", "paidAt", record.paymentMethod ? labelMethod(record.paymentMethod) : "", record.paymentMethod === "VISA" ? "record-method-visa" : "record-method-cash")}</td>
                <td>{recordStepCell(record, "geidea", "geideaRegisteredAt")}</td>
                <td>{recordStepCell(record, "customerLeft", "customerLeftAt")}</td>
                <td>{archiveStepCell(record)}</td>
                <td>{recordActivityCell(record)}</td>
              </tr>
            ))}
              </tbody>
            </table>
          </div>
        )}
      </section>}

      {managerTab === "activity" && <section className="panel">
        <div className="row">
          <div>
            <h3>{t("manager.recentActivity")}</h3>
            <div className="muted">{selectedPeriodLabel()}</div>
          </div>
          <div className="actions">{renderDateRangePicker()}</div>
        </div>
        {periodAuditLogs.length === 0 ? (
          <div className="muted">{t("manager.noActivity")}</div>
        ) : periodAuditLogs.map((log) => (
          <div className="activity-row" key={log.id}>
            <span className="activity-dot" />
            <div>
              <b>{labelAudit(log.summary || log.action)}</b>
              <div className="muted">{log.user} · {log.orderId || t("manager.noOrder")} · {formatDateTime(log.createdAt)}</div>
            </div>
          </div>
        ))}
      </section>}

      {selectedOrder && (
        <div className="modal-backdrop" onClick={() => setSelectedOrder(null)}>
          <div className="detail-modal" role="dialog" aria-modal="true" aria-label={t("manager.orderDetails")} onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{selectedOrder.id}</h2>
                <div className="muted">{selectedOrder.braceletNo} · {labelStatus(selectedOrder.paymentStatus)} / {labelMethod(selectedOrder.paymentMethod)}</div>
              </div>
              <button className="secondary" onClick={() => setSelectedOrder(null)}>{t("common.close")}</button>
            </div>
            <div className="grid two">
              <div className="meta-line"><span>{t("common.bracelet")}</span><b>{selectedOrder.braceletNo}</b></div>
              {(selectedOrder.isHistory || selectedOrder.isCurrentArchive) && <div className="meta-line"><span>{t("common.businessDay")}</span><b>{selectedOrder.businessDate}</b></div>}
              {selectedOrder.customerPhone && <div className="meta-line"><span>{t("common.phone")}</span><b>{selectedOrder.customerPhone}</b></div>}
              <div className="meta-line"><span>{t("common.children")}</span><b>{selectedOrder.childNames}</b></div>
              <div className="meta-line"><span>{t("common.cashier")}</span><b className="meta-value meta-user">{selectedOrder.cashier}</b></div>
              <div className="meta-line"><span>{t("common.employee")}</span><b className={`meta-value meta-data-employee ${employeeGenderClass(selectedOrder.dataEmployee)}`}>{selectedOrder.dataEmployee}</b></div>
              {selectedOrder.paymentEmployee && <div className="meta-line"><span>{t("common.paymentEmployee")}</span><b className={`meta-value meta-payment-employee ${employeeGenderClass(selectedOrder.paymentEmployee)}`}>{selectedOrder.paymentEmployee}</b></div>}
              {!selectedOrder.geideaRegisteredAt && <div className="meta-line"><span>{t("common.systemRegistered")}</span><b className="meta-value meta-pending">{t("common.no")}</b></div>}
              <div className="meta-line"><span>{t("common.status")}</span><b className={`meta-value ${orderStageClass(selectedOrder)}`}>{labelOrderStage(selectedOrder)}</b></div>
              <div className="meta-line"><span>{t("common.payment")}</span><b className={`meta-value ${selectedOrder.paymentMethod === "VISA" ? "meta-visa" : "meta-cash"}`}>{labelStatus(selectedOrder.paymentStatus)} / {labelMethod(selectedOrder.paymentMethod)}</b></div>
              <div className="meta-line"><span>{t("common.archived")}</span><b className={`meta-value ${selectedOrder.archivedAt ? "meta-system" : "meta-pending"}`}>{selectedOrder.archivedAt ? t("common.yes") : t("common.no")}</b></div>
            </div>
            <div className="order-alerts detail-alerts">
              <OrderAlerts
                order={selectedOrder}
                uiMessages={uiMessages}
                exitEmployeeName={(order) => order.exitEmployee}
                labelMethod={labelMethod}
                actionLabels={{ delivered: t("common.delivered"), geidea: t("manager.registerSystem"), exit: "خروج", archive: "أرشفة", closed: t("common.closed") }}
                showArchive
                showClosed
              />
            </div>
            <div className="detail-items">
              {selectedOrder.items.map((item) => (
                <div className="row" key={item.id}>
                  <span>{item.name} x {item.qty}</span>
                  <span className="actions compact-actions">
                    <b>{currency(item.total)}</b>
                    {selectedIsEditableOrder && <button className="danger mini-button" onClick={() => removeOrderItem(selectedOrder.id, item.id)}>{t("common.delete")}</button>}
                  </span>
                </div>
              ))}
              <div className="row order-total-row"><span>{t("common.orderTotal")}</span><b>{currency(selectedOrder.total)}</b></div>
            </div>
            {selectedIsEditableOrder && (
              <div className="manager-order-tools">
                <div className="form-grid manager-order-edit-grid">
                  <select
                    aria-label={t("manager.addItem")}
                    value={orderItemForm.productId}
                    onChange={(event) => setOrderItemForm((current) => ({ ...current, productId: event.target.value }))}
                  >
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name} - {currency(product.price)}</option>)}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={orderItemForm.qty}
                    onChange={(event) => setOrderItemForm((current) => ({ ...current, qty: Math.max(1, Number(event.target.value) || 1) }))}
                    aria-label={t("common.qty")}
                  />
                  <button className="btn-confirm" onClick={() => addOrderItem(selectedOrder.id)}>{t("manager.addItem")}</button>
                </div>
                <div className="form-grid manager-order-edit-grid">
                  <select
                    aria-label={t("manager.selectReceiver")}
                    className={employeeGenderClass(restaurantEmployees().find((employee) => employee.id === managerPaymentEmployeeId)?.name)}
                    value={managerPaymentEmployeeId}
                    onChange={(event) => setManagerPaymentEmployeeId(event.target.value)}
                  >
                    <option value="">{t("manager.selectReceiver")}</option>
                    {restaurantEmployees().map((employee) => <option className={employeeGenderClass(employee.name)} key={employee.id} value={employee.id}>{employee.name}</option>)}
                  </select>
                  <button
                    className={paymentButtonClass(selectedOrder, "CASH", "btn-pay-cash")}
                    disabled={selectedOrder.paymentStatus !== "PAID" && selectedOrder.kitchenStatus !== "DELIVERED"}
                    title={selectedOrder.paymentStatus !== "PAID" && selectedOrder.kitchenStatus !== "DELIVERED" ? t("kitchen.deliverBeforePayment") : ""}
                    onClick={() => payOrder(selectedOrder.id, "CASH")}
                  >
                    {selectedOrder.paymentStatus === "PAID" && selectedOrder.paymentMethod === "CASH" ? t("manager.cashPaid") : t("manager.setCashPaid")}
                  </button>
                  <button
                    className={paymentButtonClass(selectedOrder, "VISA", "btn-pay-visa")}
                    disabled={selectedOrder.paymentStatus !== "PAID" && selectedOrder.kitchenStatus !== "DELIVERED"}
                    title={selectedOrder.paymentStatus !== "PAID" && selectedOrder.kitchenStatus !== "DELIVERED" ? t("kitchen.deliverBeforePayment") : ""}
                    onClick={() => payOrder(selectedOrder.id, "VISA")}
                  >
                    {selectedOrder.paymentStatus === "PAID" && selectedOrder.paymentMethod === "VISA" ? t("manager.visaPaid") : t("manager.setVisaPaid")}
                  </button>
                </div>
                <div className="form-grid manager-order-edit-grid">
                  <select
                    aria-label={t("manager.selectGeideaEmployee")}
                    className={employeeGenderClass(restaurantEmployees().find((employee) => employee.id === managerGeideaEmployeeId)?.name)}
                    value={managerGeideaEmployeeId}
                    onChange={(event) => setManagerGeideaEmployeeId(event.target.value)}
                  >
                    <option value="">{t("manager.selectGeideaEmployee")}</option>
                    {restaurantEmployees().map((employee) => <option className={employeeGenderClass(employee.name)} key={employee.id} value={employee.id}>{employee.name}</option>)}
                  </select>
                  <button className="btn-system" onClick={() => runOrderAction(selectedOrder.id, "geidea", { geideaEmployeeId: managerGeideaEmployeeId })}>{t("manager.registerSystem")}</button>
                </div>
              </div>
            )}
            {selectedOrder.customerLeft && selectedOrder.paymentStatus !== "PAID" && (
              <div className="warning" style={uiMessageStyle(uiMessages.leftUnpaid)}>
                {formatUiMessage(uiMessages.leftUnpaid)}
              </div>
            )}
            {selectedOrder.customerLeft && selectedOrder.paymentStatus === "PAID" && !selectedOrder.geideaRegisteredAt && (
              <div className="warning warning-orange" style={uiMessageStyle(uiMessages.leftNeedsGeidea)}>
                {formatUiMessage(uiMessages.leftNeedsGeidea)}
              </div>
            )}
            <div className="actions">
              {selectedIsActiveOrder && <button className="btn-deliver" onClick={() => runOrderAction(selectedOrder.id, "deliver")}>{t("manager.markDelivered")}</button>}
              {selectedIsActiveOrder && <button className="btn-exit" disabled={selectedOrder.customerLeft} onClick={() => runOrderAction(selectedOrder.id, "left")}>{t("manager.markCustomerLeft")}</button>}
              {selectedIsActiveOrder && selectedOrder.geideaRegisteredAt && selectedOrder.customerLeft && !selectedOrder.archivedAt && (
                <button className="btn-print" onClick={() => runOrderAction(selectedOrder.id, "archive")}>{t("manager.archive")}</button>
              )}
              {selectedIsArchivedOrder && <button className="btn-unarchive" onClick={() => runOrderAction(selectedOrder.id, "unarchive")}>{t("manager.unarchive")}</button>}
              <button className="btn-print" onClick={() => printInvoice(selectedOrder.id)}>{t("common.printInvoice")}</button>
            </div>
          </div>
        </div>
      )}
      {printFrameUrl && (
        <iframe
          className="print-frame"
          src={printFrameUrl}
          title="Invoice print"
        />
      )}
      {reportPrintHtml && (
        <iframe
          className="print-frame"
          srcDoc={reportPrintHtml}
          title="Daily report print"
        />
      )}
    </>
  );
}

function Metric({ label, value }) {
  return (
    <div className="card metric">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

function Report({ title, rows, labelKey, valueKey, formatValue, emptyLabel }) {
  return (
    <div className="panel">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <div className="muted">{emptyLabel}</div>
      ) : rows.slice(0, 8).map((row) => (
        <div className="row" key={row[labelKey]}>
          <span>{row[labelKey]}</span>
          <b>{formatValue ? formatValue(row[valueKey]) : row[valueKey]}</b>
        </div>
      ))}
    </div>
  );
}

function AreaChart({ title, rows, labelKey, valueKey, valueFormatter, emptyLabel }) {
  const width = 620;
  const height = 230;
  const padX = 26;
  const padY = 24;
  const chartRows = rows.length ? rows : [{ [labelKey]: "", [valueKey]: 0 }];
  const values = chartRows.map((row) => Number(row[valueKey]) || 0);
  const max = Math.max(...values, 1);
  const step = chartRows.length > 1 ? (width - padX * 2) / (chartRows.length - 1) : 0;
  const points = chartRows.map((row, index) => {
    const x = padX + step * index;
    const y = height - padY - ((Number(row[valueKey]) || 0) / max) * (height - padY * 2);
    return { x, y, row };
  });
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const lastPoint = points[points.length - 1];
  const areaPath = `${linePath} L ${lastPoint.x} ${height - padY} L ${points[0].x} ${height - padY} Z`;

  return (
    <div className="area-chart-card">
      <div className="area-chart-head">
        <h3>{title}</h3>
        <div className="chart-dot-legend"><span className="dot dot-pink" />{valueFormatter ? valueFormatter(max) : max}</div>
      </div>
      {rows.length === 0 ? (
        <div className="muted">{emptyLabel}</div>
      ) : (
        <svg className="area-chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
          <defs>
            <linearGradient id="salesAreaGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#e94b96" stopOpacity="0.34" />
              <stop offset="55%" stopColor="#ff671f" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
            <filter id="chartGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="7" stdDeviation="6" floodColor="#e94b96" floodOpacity="0.22" />
            </filter>
          </defs>
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line key={ratio} x1={padX} x2={width - padX} y1={padY + ratio * (height - padY * 2)} y2={padY + ratio * (height - padY * 2)} className="area-grid-line" />
          ))}
          <path d={areaPath} fill="url(#salesAreaGradient)" />
          <path d={linePath} className="area-line area-line-pink" filter="url(#chartGlow)" />
          <path
            d={points.map((point, index) => {
              const wobble = index % 2 === 0 ? 14 : -10;
              const y = Math.max(padY, Math.min(height - padY, point.y + wobble));
              return `${index === 0 ? "M" : "L"} ${point.x} ${y}`;
            }).join(" ")}
            className="area-line area-line-purple"
          />
          {points.map((point, index) => (
            <g key={`${point.row[labelKey]}-${index}`}>
              <circle cx={point.x} cy={point.y} r="4.5" className="area-point" />
              {(index === 0 || index === points.length - 1 || index % 3 === 0) && (
                <text x={point.x} y={height - 5} textAnchor="middle" className="area-label">{String(point.row[labelKey] || "").slice(5)}</text>
              )}
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

function GradientSummaryCard({ tone, title, value, caption, styleConfig }) {
  const customStyle = {
    "--summary-start": styleConfig?.startColor,
    "--summary-end": styleConfig?.endColor,
    "--summary-text": styleConfig?.textColor,
  };

  return (
    <div className={`gradient-summary-card gradient-summary-${tone}`} style={customStyle}>
      {styleConfig?.iconUrl ? (
        <img className="gradient-summary-icon" src={styleConfig.iconUrl} alt="" aria-hidden="true" />
      ) : (
        <div className="mini-chart-icon" aria-hidden="true"><i /><i /><i /><i /></div>
      )}
      <span>{title}</span>
      <b>{value}</b>
      <small>{caption}</small>
    </div>
  );
}

function RecentActivityCard({ title, rows, labelAudit, formatDateTime, emptyLabel }) {
  return (
    <div className="panel report-activity-card">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <div className="muted">{emptyLabel}</div>
      ) : rows.map((row, index) => (
        <div className="report-activity-item" key={row.id || `${row.action}-${index}`}>
          <span>{formatDateTime(row.createdAt)}</span>
          <i />
          <div>
            <b>{labelAudit(row.summary || row.action)}</b>
            <small>{row.user || row.orderId || "-"}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

function TopOrdersTable({ title, rows, t, currency, labelStatus, emptyLabel }) {
  return (
    <div className="panel report-table-card">
      <div className="report-chart-head">
        <h3>{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="muted">{emptyLabel}</div>
      ) : (
        <div className="report-mini-table">
          <div className="report-mini-table-head">
            <span>{t("common.order")}</span>
            <span>{t("common.bracelet")}</span>
            <span>{t("common.children")}</span>
            <span>{t("common.orderTotal")}</span>
            <span>{t("common.status")}</span>
          </div>
          {rows.map((row) => (
            <div className="report-mini-table-row" key={row.id}>
              <b>{row.id}</b>
              <span>{row.braceletNo}</span>
              <span>{row.childNames}</span>
              <b>{currency(row.total)}</b>
              <em>{labelStatus(row.status)}</em>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportKpi({ label, value, tone }) {
  return (
    <div className={`report-kpi report-kpi-${tone}`}>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function chartColor(key, index = 0) {
  const normalized = String(key || "").toUpperCase();
  if (normalized.includes("CASH")) return "#301848";
  if (normalized.includes("VISA")) return "#31aa2f";
  if (normalized.includes("UNPAID")) return "#e01838";
  if (normalized.includes("ARCHIVED")) return "#005eb8";
  const palette = ["#ff671f", "#36acd4", "#e94b96", "#f8c800", "#4b2874", "#00843d", "#c8102e", "#7a3f0c"];
  return palette[index % palette.length];
}

function splitChartValueLabel(label) {
  const value = String(label || "").trim();
  const match = value.match(/^(.+?)\s+([^\d\s]+)$/u);
  if (!match) return { amount: value, unit: "" };
  return { amount: match[1], unit: match[2] };
}

function DonutChart({ title, rows, labelKey, valueKey, countKey, labelFormatter, valueFormatter, emptyLabel }) {
  const chartRows = rows.filter((row) => Number(row[valueKey]) > 0);
  const total = chartRows.reduce((sum, row) => sum + (Number(row[valueKey]) || 0), 0);
  const totalLabel = splitChartValueLabel(valueFormatter ? valueFormatter(total) : total);
  let cursor = 0;
  const gradient = total > 0
    ? chartRows.map((row, index) => {
        const value = Number(row[valueKey]) || 0;
        const start = cursor;
        const end = cursor + (value / total) * 100;
        cursor = end;
        return `${chartColor(row[labelKey], index)} ${start}% ${end}%`;
      }).join(", ")
    : "#eee4ca 0 100%";

  return (
    <div className="panel report-chart-card">
      <div className="report-chart-head">
        <h3>{title}</h3>
        <b>{valueFormatter ? valueFormatter(total) : total}</b>
      </div>
      {rows.length === 0 ? (
        <div className="muted">{emptyLabel}</div>
      ) : (
        <div className="donut-chart-layout">
          <div className="donut-chart" style={{ background: `conic-gradient(${gradient})` }}>
            <div>
              <b>{totalLabel.amount}</b>
              {totalLabel.unit && <strong>{totalLabel.unit}</strong>}
              <span>{title}</span>
            </div>
          </div>
          <div className="chart-legend payment-chart-legend">
            {rows.map((row, index) => {
              const value = Number(row[valueKey]) || 0;
              const percent = total ? Math.round((value / total) * 100) : 0;
              return (
                <div className="payment-legend-card" key={row[labelKey]}>
                  <div className="payment-legend-top">
                    <span>{labelFormatter ? labelFormatter(row[labelKey]) : row[labelKey]}</span>
                    <i style={{ background: chartColor(row[labelKey], index) }} />
                  </div>
                  <b>{valueFormatter ? valueFormatter(value) : value}</b>
                  {countKey && <small>{row[countKey]} · {percent}%</small>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardBars({ title, rows, labelKey, valueKey, valueFormatter, emptyLabel }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);

  return (
    <div className="panel report-chart-card">
      <div className="report-chart-head">
        <h3>{title}</h3>
      </div>
      {rows.length === 0 ? (
        <div className="muted">{emptyLabel}</div>
      ) : (
        <div className="dashboard-bars">
          {rows.slice(0, 8).map((row, index) => {
            const value = Number(row[valueKey]) || 0;
            return (
              <div className="dashboard-bar-row" key={row[labelKey]}>
                <div className="dashboard-bar-label">
                  <span>{row[labelKey]}</span>
                  <b>{valueFormatter ? valueFormatter(value) : value}</b>
                </div>
                <div className="dashboard-bar-track">
                  <div
                    className="dashboard-bar-fill"
                    style={{
                      width: `${Math.max(5, (value / max) * 100)}%`,
                      background: chartColor(row[labelKey], index),
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniBars({ rows, labelKey, valueKey, labelFormatter, valueFormatter }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);

  return (
    <div className="stack">
      {rows.map((row) => {
        const value = Number(row[valueKey]) || 0;
        return (
          <div className="bar-row" key={row[labelKey]}>
            <span>{labelFormatter ? labelFormatter(row[labelKey]) : row[labelKey]}</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(4, (value / max) * 100)}%` }} /></div>
            <b>{valueFormatter ? valueFormatter(value) : value}</b>
          </div>
        );
      })}
    </div>
  );
}
