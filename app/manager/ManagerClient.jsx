"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "../ToastProvider";
import { useI18n } from "../i18n";
import { applyEmployeeNameStyles, employeeGenderClass, normalizeEmployeeNameStyles } from "../employeeDisplay";
import { formatUiMessage, normalizeUiMessages, uiMessageStyle } from "../uiMessages";
import { kitchenTicketRuleValue, parseKitchenTicketRules } from "../../lib/kitchen-ticket-rules";

const roles = ["ADMIN", "MANAGER", "CASHIER", "KITCHEN"];
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

const emptyEmployeeForm = {
  id: "",
  name: "",
  department: "OPERATION",
  active: true,
};

const emptyProductForm = {
  id: "",
  name: "",
  price: "",
  categoryId: "",
  categoryName: "",
  imageUrl: "",
  popular: false,
  active: true,
  sortOrder: 100,
};

const emptyUserForm = {
  id: "",
  accountType: "GENERAL",
  employeeId: "",
  name: "",
  username: "",
  password: "",
  role: "CASHIER",
  active: true,
};

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

export default function ManagerClient() {
  const toast = useToast();
  const { language, t, formatNumber, currency, labelAudit, labelBusinessMessage, labelDepartment, labelMethod, labelOrderStage, labelStatus, formatDateTime } = useI18n();
  const [data, setData] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm);
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [viewMode, setViewMode] = useState("TODAY");
  const [dateFilterMode, setDateFilterMode] = useState("DAY");
  const [dateFilter, setDateFilter] = useState({ day: "", month: "", year: "", from: "", to: "" });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [archiveFilter, setArchiveFilter] = useState("ALL");
  const [managerTab, setManagerTab] = useState("orders");
  const [settingsTab, setSettingsTab] = useState("employees");
  const [employeeFilter, setEmployeeFilter] = useState({ query: "", department: "ALL", status: "ALL" });
  const [productFilter, setProductFilter] = useState({ query: "", category: "ALL", status: "ALL", popular: "ALL" });
  const [userFilter, setUserFilter] = useState({ query: "", role: "ALL", status: "ALL" });
  const [query, setQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderItemForm, setOrderItemForm] = useState({ productId: "", qty: 1 });
  const [managerPaymentEmployeeId, setManagerPaymentEmployeeId] = useState("");
  const [managerGeideaEmployeeId, setManagerGeideaEmployeeId] = useState("");
  const [printFrameUrl, setPrintFrameUrl] = useState("");
  const [reportPrintHtml, setReportPrintHtml] = useState("");
  const [uiMessages, setUiMessages] = useState(normalizeUiMessages());
  const [employeeNameStyles, setEmployeeNameStyles] = useState(normalizeEmployeeNameStyles());
  const [settingsMap, setSettingsMap] = useState({});
  const [backups, setBackups] = useState([]);
  const [rolePermissions, setRolePermissions] = useState(normalizeRolePermissions());

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!selectedOrder) return;
    const restaurantEmployees = employees.filter((employee) => employee.department === "RESTAURANT" && employee.active);
    setManagerPaymentEmployeeId(selectedOrder.paymentEmployeeId || restaurantEmployees[0]?.id || "");
    setManagerGeideaEmployeeId(selectedOrder.geideaEmployeeId || restaurantEmployees[0]?.id || "");
    setOrderItemForm((current) => ({ productId: current.productId || products[0]?.id || "", qty: current.qty || 1 }));
  }, [selectedOrder, employees, products]);

  useEffect(() => {
    if (!data?.reportBusinessDate || dateFilter.day) return;
    const month = String(data.reportBusinessDate).slice(0, 7);
    const year = String(data.reportBusinessDate).slice(0, 4);
    setCalendarMonth(month);
    setDateFilter({ day: data.reportBusinessDate, month, year, from: data.reportBusinessDate, to: data.reportBusinessDate });
  }, [data?.reportBusinessDate, dateFilter.day]);

  async function load() {
    const [dashboardRes, employeesRes, productsRes, usersRes, settingsRes, backupsRes] = await Promise.all([
      fetch("/api/dashboard"),
      fetch("/api/employees?department=ALL&includeInactive=true"),
      fetch("/api/products?includeInactive=true"),
      fetch("/api/users"),
      fetch("/api/settings"),
      fetch("/api/backups"),
    ]);
    const [dashboardData, employeesData, productsData, usersData, settingsData, backupsData] = await Promise.all([
      dashboardRes.json(),
      employeesRes.json(),
      productsRes.json(),
      usersRes.json(),
      settingsRes.json(),
      backupsRes.json(),
    ]);

    setData(dashboardData);
    setEmployees(employeesData);
    setProducts(productsData);
    setUsers(Array.isArray(usersData) ? usersData : []);
    const nextSettingsMap = Object.fromEntries((settingsData.settings || []).map((setting) => [setting.key, setting.value]));
    setSettingsMap(nextSettingsMap);
    setUiMessages(normalizeUiMessages(nextSettingsMap.UI_MESSAGE_CONFIG));
    setRolePermissions(normalizeRolePermissions(nextSettingsMap.ROLE_PERMISSION_CONFIG));
    const employeeStyleSetting = settingsData.settings?.find((item) => item.key === "EMPLOYEE_NAME_STYLE_CONFIG");
    const normalizedEmployeeStyles = normalizeEmployeeNameStyles(employeeStyleSetting?.value);
    setEmployeeNameStyles(normalizedEmployeeStyles);
    applyEmployeeNameStyles(normalizedEmployeeStyles);
    setBackups(Array.isArray(backupsData.backups) ? backupsData.backups : []);
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
    await load();
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
              <select value={settingsMap[field.key] ?? field.defaultValue ?? ""} onChange={(event) => updateSettingValue(field.key, event.target.value)}>
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
    return (
      <section className={`employee-manager ${settingsTab === tab ? "" : "is-hidden"}`}>
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

  function paymentButtonClass(order, method, baseClass) {
    return `${baseClass} ${order.paymentStatus === "PAID" && order.paymentMethod === method ? "payment-selected" : ""}`;
  }

  function orderStageClass(order) {
    if (order.geideaRegisteredAt) return "meta-system";
    if (order.paymentStatus === "PAID") return order.paymentMethod === "VISA" ? "meta-visa" : "meta-cash";
    if (order.kitchenStatus === "DELIVERED") return "meta-delivered";
    return "meta-pending";
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

  function restaurantEmployees() {
    return employees.filter((employee) => employee.department === "RESTAURANT" && employee.active);
  }

  function confirmDanger(message = t("manager.confirmDanger")) {
    return window.confirm(message);
  }

  async function refreshAfterOrderChange(orderId, closeModal = false) {
    await load();

    if (closeModal) {
      setSelectedOrder(null);
      return;
    }

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
          <span>{selectedPeriodLabel() || t("manager.dateRange")}</span>
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
  }, [data, viewMode, historyRows, allPeriodRows, filter, archiveFilter, query, dateFilterMode, dateFilter]);

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
    const statusMap = new Map();
    const cashierMap = new Map();
    const employeeMap = new Map();
    const braceletMap = new Map();
    const dayMap = new Map();

    orders.forEach((order) => {
      const total = Number(order.total) || 0;
      const paymentKey = order.paymentStatus === "PAID" ? (order.paymentMethod || "UNKNOWN") : "UNPAID";
      const paymentRow = paymentMap.get(paymentKey) || { method: paymentKey, count: 0, total: 0 };
      paymentRow.count += 1;
      paymentRow.total += total;
      paymentMap.set(paymentKey, paymentRow);

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
      });
    });

    const byTotal = (a, b) => b.total - a.total;
    return {
      paymentBreakdown: [...paymentMap.values()].sort(byTotal),
      topProducts: [...productMap.values()].sort(byTotal).slice(0, 8),
      statusBreakdown: [...statusMap.values()].sort((a, b) => b.count - a.count),
      cashierPerformance: [...cashierMap.values()].sort(byTotal).slice(0, 8),
      dataEmployeePerformance: [...employeeMap.values()].sort(byTotal).slice(0, 8),
      topBracelets: [...braceletMap.values()].sort(byTotal).slice(0, 8),
      dailySales: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    };
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
      await refreshAfterOrderChange(orderId);
    } else {
      toast(result.error || t("manager.paymentUpdateFailed"), "error");
    }
  }

  async function runOrderAction(orderId, action, body = null, closeModal = false) {
    if (["archive", "unarchive"].includes(action) && !confirmDanger()) return;

    const res = await fetch(`/api/orders/${orderUrlId(orderId)}/${action}`, {
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
    await refreshAfterOrderChange(orderId, closeModal);
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
    await refreshAfterOrderChange(orderId);
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
    await refreshAfterOrderChange(orderId);
  }

  function resetEmployeeForm() {
    setEmployeeForm(emptyEmployeeForm);
  }

  function resetProductForm() {
    setProductForm(emptyProductForm);
  }

  function resetUserForm() {
    setUserForm(emptyUserForm);
  }

  function editEmployee(employee) {
    setEmployeeForm({
      id: employee.id,
      name: employee.name,
      department: employee.department,
      active: employee.active,
    });
  }

  function editProduct(product) {
    setProductForm({
      id: product.id,
      name: product.name,
      price: product.price,
      categoryId: product.categoryId,
      categoryName: product.categoryName,
      imageUrl: product.imageUrl || "",
      popular: product.popular,
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
    await load();
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
    await load();
  }

  async function saveProduct() {
    const method = productForm.id ? "PATCH" : "POST";
    const res = await fetch("/api/products", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(productForm),
    });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || t("manager.productSaveFailed"), "error");
      return;
    }

    showUiToast("productSaved");
    resetProductForm();
    await load();
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
    await load();
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
    await load();
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
    await load();
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
              value={message.text}
              onChange={(event) => updateUiMessage(key, "text", event.target.value)}
              rows={3}
              placeholder={t("manager.messageTextArabic")}
            />
          </label>
          <label>
            <span>{t("manager.messageTextEnglish")}</span>
            <textarea
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
      ["Not Registered Geidea", review.unregistered.length],
      ["Left Without Paying", review.leftUnpaid.length],
      [],
      ["Order", "Bracelet", "Children", "Phone", "Payment", "Method", "Total", "Geidea", "Left"],
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
        <div class="metric"><b>Not Geidea</b><br>${review.unregistered.length}</div>
        <div class="metric"><b>Left Unpaid</b><br>${review.leftUnpaid.length}</div>
      </div>
      <table><thead><tr><th>Order</th><th>Bracelet</th><th>Children</th><th>Payment</th><th>Total</th><th>Geidea</th></tr></thead><tbody>${rows}</tbody></table>
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

  if (!data) return <div className="panel">{t("common.loading")}</div>;

  const selectedIsEditableOrder = selectedOrder && !selectedOrder.isHistory;
  const selectedIsActiveOrder = selectedIsEditableOrder;
  const selectedIsArchivedOrder = selectedOrder && !selectedOrder.isHistory && selectedOrder.archivedAt;
  const productCategories = ["ALL", ...new Set(products.map((product) => product.categoryName).filter(Boolean))];
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
    if (productFilter.category !== "ALL" && product.categoryName !== productFilter.category) return false;
    if (productFilter.status === "ACTIVE" && !product.active) return false;
    if (productFilter.status === "INACTIVE" && product.active) return false;
    if (productFilter.popular === "POPULAR" && !product.popular) return false;
    if (productFilter.popular === "REGULAR" && product.popular) return false;
    if (!search) return true;
    return [product.name, product.categoryName, product.id].some((value) => String(value || "").toLowerCase().includes(search));
  });
  const visibleUsers = users.filter((user) => {
    const search = userFilter.query.trim().toLowerCase();
    if (userFilter.role !== "ALL" && user.role !== userFilter.role) return false;
    if (userFilter.status === "ACTIVE" && !user.active) return false;
    if (userFilter.status === "INACTIVE" && user.active) return false;
    if (!search) return true;
    return [user.name, user.username, user.role, user.employeeName, user.employeeDepartment].some((value) => String(value || "").toLowerCase().includes(search));
  });
  const activeEmployees = employees.filter((employee) => employee.active);
  const settingsGroups = {
    branch: [
      { key: "COMPANY_NAME", label: t("settings.companyName") },
      { key: "BRANCH_NAME", label: t("settings.branchName") },
      { key: "BRANCH_ADDRESS", label: t("settings.branchAddress") },
      { key: "BRANCH_PHONE", label: t("settings.branchPhone") },
      { key: "BRANCH_TIN", label: t("settings.branchTin") },
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
    ],
    printing: [
      { key: "INVOICE_PRINTER_NAME", label: t("settings.invoicePrinter") },
      { key: "KITCHEN_PRINTER_NAME", label: t("settings.kitchenPrinter") },
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
      { key: "WORKFLOW_ALLOW_EXIT_BEFORE_PAYMENT", label: t("settings.allowExitBeforePayment"), type: "checkbox" },
    ],
    reports: [
      { key: "REPORT_DEFAULT_TAB", label: t("settings.defaultReportTab"), type: "select", options: [{ value: "daily", label: t("manager.tabReview") }, { value: "payments", label: t("manager.paymentBreakdown") }, { value: "products", label: t("manager.topProducts") }] },
      { key: "REPORT_SHOW_CASH_VISA_GEIDEA", label: t("settings.showCashVisaGeidea"), type: "checkbox" },
      { key: "REPORT_ENABLE_EXCEL_EXPORT", label: t("settings.enableExcel"), type: "checkbox" },
      { key: "REPORT_ENABLE_PDF_EXPORT", label: t("settings.enablePdf"), type: "checkbox" },
    ],
    auditBackup: [
      { key: "AUDIT_RETENTION_DAYS", label: t("settings.auditRetention"), type: "number", min: 1 },
      { key: "AUDIT_EXPORT_ENABLED", label: t("settings.auditExport"), type: "checkbox" },
      { key: "BACKUP_AUTO_DAILY", label: t("settings.autoBackup"), type: "checkbox" },
      { key: "BACKUP_RETENTION_DAYS", label: t("settings.backupRetention"), type: "number", min: 1 },
    ],
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

      <section className="panel manager-main-tabs">
        <div className="tabs">
          {[
            ["orders", t("manager.tabOrders")],
            ["review", t("manager.tabReview")],
            ["reports", t("manager.tabReports")],
            ["settings", t("manager.tabSettings")],
            ["activity", t("manager.tabActivity")],
          ].map(([tab, label]) => (
            <button key={tab} className={managerTab === tab ? "active" : ""} onClick={() => setManagerTab(tab)}>{label}</button>
          ))}
        </div>
      </section>

      <section className={`panel ${managerTab === "review" ? "" : "is-hidden"}`}>
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
      </section>

      <section className={`panel ${managerTab === "orders" ? "" : "is-hidden"}`}>
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
          <button className="secondary" onClick={() => setQuery("")}>{t("common.clearFilters")}</button>
        </div>
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
          {visibleOrders.map((order) => (
            <div className={`card order-cell ${orderAlertClass(order)}`} key={order.id}>
              <div className="row order-head">
                <b>{order.id}</b>
                <span className={`badge ${order.paymentStatus === "PAID" ? "paid" : "unpaid"}`}>{labelStatus(order.paymentStatus)}</span>
              </div>
              <div className="order-info">
                {viewMode === "HISTORY" && <div className="meta-line"><span>{t("common.businessDay")}</span><b>{order.businessDate}</b></div>}
                <div className="meta-line"><span>{t("common.bracelet")}</span><b>{order.braceletNo}</b></div>
                {order.customerPhone && <div className="meta-line"><span>{t("common.phone")}</span><b>{order.customerPhone}</b></div>}
                <div className="meta-line"><span>{t("common.children")}</span><b>{order.childNames}</b></div>
                <div className="meta-line"><span>{t("common.status")}</span><b className={`meta-value ${orderStageClass(order)}`}>{labelOrderStage(order)}</b></div>
                {order.paymentStatus !== "PAID" && <div className="meta-line"><span>{t("common.method")}</span><b className={`meta-value ${order.paymentMethod === "VISA" ? "meta-visa" : "meta-cash"}`}>{labelMethod(order.paymentMethod)}</b></div>}
                {order.paymentEmployee && <div className="meta-line"><span>{t("common.paymentEmployee")}</span><b className={`meta-value meta-payment-employee ${employeeGenderClass(order.paymentEmployee)}`}>{order.paymentEmployee}</b></div>}
              </div>
              <div className="summary">
                <div className="order-items">
                  {(order.items || []).length === 0 ? (
                    <div className="muted">{t("common.noItems")}</div>
                  ) : order.items.map((item) => (
                    <div className="row" key={item.id}>
                      <span>{item.name} x {item.qty}</span>
                      <b>{currency(item.total)}</b>
                    </div>
                  ))}
                </div>
                <div className="row order-total-row"><span>{t("common.orderTotal")}</span><b>{currency(order.total)}</b></div>
              </div>
              <div className="order-alerts">
                {order.customerLeft && order.paymentStatus !== "PAID" && (
                  <div className="warning" style={uiMessageStyle(uiMessages.leftUnpaid)}>
                    {formatUiMessage(uiMessages.leftUnpaid)}
                  </div>
                )}
                {order.customerLeft && order.paymentStatus === "PAID" && !order.geideaRegisteredAt && (
                  <div className="warning warning-orange" style={uiMessageStyle(uiMessages.leftNeedsGeidea)}>
                    {formatUiMessage(uiMessages.leftNeedsGeidea)}
                  </div>
                )}
                {order.geideaRegisteredAt && (
                  <div className="geidea-alert-line" style={uiMessageStyle(uiMessages.geideaRegistered)}>
                    {formatUiMessage(uiMessages.geideaRegistered, {
                      employee: order.geideaEmployee || "-",
                      time: formatDateTime(order.geideaRegisteredAt),
                    }).split("\n").map((line, index) => (
                      <span className={index === 1 ? employeeGenderClass(order.geideaEmployee) : ""} key={index}>{line}</span>
                    ))}
                  </div>
                )}
                {order.exitEmployee && !order.archivedAt && (
                  <div className="meta-line exit-employee-line" style={uiMessageStyle(uiMessages.exitEmployee)}>
                    {formatUiMessage(uiMessages.exitEmployee, { employee: order.exitEmployee }).split("\n").map((line, index) => (
                      <span className={index === 1 ? employeeGenderClass(order.exitEmployee) : ""} key={index}>{line}</span>
                    ))}
                  </div>
                )}
                {order.archivedAt && !order.isHistory && (
                  <div className="archive-alert-line" style={uiMessageStyle(uiMessages.archivedAt)}>
                    {formatUiMessage(uiMessages.archivedAt, { time: formatDateTime(order.archivedAt) })}
                  </div>
                )}
                {viewMode === "HISTORY" && order.isHistory && order.closedAt && (
                  <div className="archive-alert-line" style={uiMessageStyle(uiMessages.closedAt)}>
                    {formatUiMessage(uiMessages.closedAt, { time: formatDateTime(order.closedAt) })}
                  </div>
                )}
                {viewMode === "HISTORY" && order.isHistory && !order.closedAt && order.archivedAt && (
                  <div className="archive-alert-line" style={uiMessageStyle(uiMessages.archivedAt)}>
                    {formatUiMessage(uiMessages.archivedAt, { time: formatDateTime(order.archivedAt) })}
                  </div>
                )}
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
      </section>

      <section className={`panel ${managerTab === "reports" ? "" : "is-hidden"}`}>
        <div className="row">
          <div>
            <h2>{t("manager.tabReports")}</h2>
            <div className="muted">{t("manager.reportsExportHint")}</div>
          </div>
          <div className="actions">
            {renderDateRangePicker()}
            <button className="btn-print" onClick={exportReportsCsv}>{t("manager.exportExcel")}</button>
            <button className="btn-details" onClick={printReportsPdf}>{t("manager.exportPdf")}</button>
          </div>
        </div>
      </section>

      <section className={`grid three ${managerTab === "reports" ? "" : "is-hidden"}`}>
        <div className="panel">
          <h3>{t("manager.paymentBreakdown")}</h3>
          {periodReports.paymentBreakdown.map((row) => (
            <div className="row" key={row.method}><span>{labelMethod(row.method)} ({formatNumber(row.count)})</span><b>{currency(row.total)}</b></div>
          ))}
          <MiniBars rows={periodReports.paymentBreakdown} labelKey="method" valueKey="total" labelFormatter={labelMethod} valueFormatter={currency} />
        </div>
        <div className="panel">
          <h3>{t("manager.topProducts")}</h3>
          {periodReports.topProducts.map((product) => (
            <div className="row" key={product.name}><span>{product.name}</span><b>{currency(product.total)}</b></div>
          ))}
        </div>
        <div className="panel">
          <h3>{t("manager.statusBreakdown")}</h3>
          {periodReports.statusBreakdown.map((row) => (
            <div className="row" key={row.status}><span>{labelStatus(row.status)}</span><b>{formatNumber(row.count)}</b></div>
          ))}
        </div>
      </section>

      <section className={`grid three ${managerTab === "reports" ? "" : "is-hidden"}`}>
        <Report title={t("manager.cashierPerformance")} rows={periodReports.cashierPerformance} labelKey="name" valueKey="total" formatValue={currency} emptyLabel={t("common.noData")} />
        <Report title={t("manager.employees")} rows={periodReports.dataEmployeePerformance} labelKey="name" valueKey="total" formatValue={currency} emptyLabel={t("common.noData")} />
        <Report title={t("manager.topBracelets")} rows={periodReports.topBracelets} labelKey="bracelet" valueKey="total" formatValue={currency} emptyLabel={t("common.noData")} />
      </section>

      <section className={`panel ${managerTab === "reports" ? "" : "is-hidden"}`}>
        <h3>{t("manager.dailySales")}</h3>
        <MiniBars rows={periodReports.dailySales} labelKey="date" valueKey="total" valueFormatter={currency} />
      </section>

      <section className={`panel settings-shell ${managerTab === "settings" ? "" : "is-hidden"}`}>
        <aside className="settings-sidebar">
          {[
            ["employees", t("manager.employeeManagement")],
            ["products", t("manager.productManagement")],
            ["users", t("manager.userManagement")],
            ["branch", t("settings.branchSettings")],
            ["invoice", t("settings.invoiceSettings")],
            ["printing", t("settings.printSettings")],
            ["business", t("settings.businessSettings")],
            ["workflow", t("settings.workflowSettings")],
            ["reports", t("settings.reportSettings")],
            ["auditBackup", t("settings.auditBackupSettings")],
            ["backupRestore", t("manager.backupRestore")],
            ["messages", t("manager.uiMessages")],
          ].map(([tab, label]) => (
            <button key={tab} className={settingsTab === tab ? "active" : ""} onClick={() => setSettingsTab(tab)}>{label}</button>
          ))}
        </aside>
        <div className="settings-content">
      <section className={`employee-manager ${settingsTab === "employees" ? "" : "is-hidden"}`}>
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
            value={employeeForm.department}
            onChange={(event) => setEmployeeForm((current) => ({ ...current, department: event.target.value }))}
          >
            <option value="OPERATION">{labelDepartment("OPERATION")}</option>
            <option value="RESTAURANT">{labelDepartment("RESTAURANT")}</option>
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
            ].map(([group, label, preview]) => (
              <div className="employee-style-card" key={group}>
                <b>{label}</b>
                <div className={`employee-style-preview employee-name-${group}`}>{preview}</div>
                <div className="ui-message-fields">
                  <label>
                    <span>{t("manager.textColor")}</span>
                    <input type="color" value={employeeNameStyles[group].color} onChange={(event) => updateEmployeeNameStyle(group, "color", event.target.value)} />
                  </label>
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
                    <select value={employeeNameStyles[group].fontStyle} onChange={(event) => updateEmployeeNameStyle(group, "fontStyle", event.target.value)}>
                      <option value="normal">{t("manager.fontStyleNormal")}</option>
                      <option value="italic">{t("manager.fontStyleItalic")}</option>
                    </select>
                  </label>
                  <label>
                    <span>{t("manager.fontFamily")}</span>
                    <select value={employeeNameStyles[group].fontFamily} onChange={(event) => updateEmployeeNameStyle(group, "fontFamily", event.target.value)}>
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
          <select value={employeeFilter.department} onChange={(event) => setEmployeeFilter((current) => ({ ...current, department: event.target.value }))}>
            <option value="ALL">{t("common.all")}</option>
            <option value="OPERATION">{labelDepartment("OPERATION")}</option>
            <option value="RESTAURANT">{labelDepartment("RESTAURANT")}</option>
          </select>
          <select value={employeeFilter.status} onChange={(event) => setEmployeeFilter((current) => ({ ...current, status: event.target.value }))}>
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
              <span>{labelDepartment(employee.department)}</span>
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
      </section>

      <section className={`employee-manager ${settingsTab === "products" ? "" : "is-hidden"}`}>
        <div className="row">
          <div>
            <h3>{t("manager.productManagement")}</h3>
            <div className="muted">{t("manager.productManagementHint")}</div>
          </div>
          {productForm.id && <button className="danger" onClick={resetProductForm}>{t("common.cancel")}</button>}
        </div>
        <div className="form-grid product-form-grid">
          <input value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("manager.productName")} />
          <input type="number" min="0" value={productForm.price} onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))} placeholder={t("manager.productPrice")} />
          <input value={productForm.categoryName} onChange={(event) => setProductForm((current) => ({ ...current, categoryName: event.target.value, categoryId: event.target.value }))} placeholder={t("manager.categoryName")} />
          <input value={productForm.imageUrl} onChange={(event) => setProductForm((current) => ({ ...current, imageUrl: event.target.value }))} placeholder={t("manager.productImage")} />
          <label className="toggle-row">
            <input type="checkbox" checked={productForm.popular} onChange={(event) => setProductForm((current) => ({ ...current, popular: event.target.checked }))} />
            <span>{t("manager.popularProduct")}</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" checked={productForm.active} onChange={(event) => setProductForm((current) => ({ ...current, active: event.target.checked }))} />
            <span>{productForm.active ? t("common.active") : t("common.inactive")}</span>
          </label>
          <button className="btn-confirm" onClick={saveProduct}>{productForm.id ? t("manager.updateProduct") : t("manager.addProduct")}</button>
        </div>
        <div className="form-grid settings-filter-grid product-settings-filter">
          <input value={productFilter.query} onChange={(event) => setProductFilter((current) => ({ ...current, query: event.target.value }))} placeholder={t("manager.productSearch")} />
          <select value={productFilter.category} onChange={(event) => setProductFilter((current) => ({ ...current, category: event.target.value }))}>
            {productCategories.map((category) => <option key={category} value={category}>{category === "ALL" ? t("common.all") : category}</option>)}
          </select>
          <select value={productFilter.status} onChange={(event) => setProductFilter((current) => ({ ...current, status: event.target.value }))}>
            <option value="ALL">{t("common.all")}</option>
            <option value="ACTIVE">{t("common.active")}</option>
            <option value="INACTIVE">{t("common.inactive")}</option>
          </select>
          <select value={productFilter.popular} onChange={(event) => setProductFilter((current) => ({ ...current, popular: event.target.value }))}>
            <option value="ALL">{t("common.all")}</option>
            <option value="POPULAR">{t("manager.popularProduct")}</option>
            <option value="REGULAR">{t("manager.regularProduct")}</option>
          </select>
          <button className="secondary" onClick={() => setProductFilter({ query: "", category: "ALL", status: "ALL", popular: "ALL" })}>{t("common.clearFilters")}</button>
        </div>
        <div className="employee-table">
          <div className="employee-row product-row employee-head">
            <b>{t("common.name")}</b>
            <b>{t("common.department")}</b>
            <b>{t("manager.productPrice")}</b>
            <b>{t("common.status")}</b>
            <b>{t("common.actions")}</b>
          </div>
          {visibleProductsSettings.map((product) => (
            <div className="employee-row product-row" key={product.id}>
              <span>{product.name}</span>
              <span>{product.categoryName}</span>
              <span>{currency(product.price)}</span>
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
      </section>

      <section className={`employee-manager ${settingsTab === "users" ? "" : "is-hidden"}`}>
        <div className="row">
          <div>
            <h3>{t("manager.userManagement")}</h3>
            <div className="muted">{t("manager.userManagementHint")}</div>
          </div>
          {userForm.id && <button className="danger" onClick={resetUserForm}>{t("common.cancel")}</button>}
        </div>
        <div className="form-grid user-form-grid">
          <select
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
              value={userForm.employeeId}
              onChange={(event) => {
                const employee = activeEmployees.find((item) => item.id === event.target.value);
                setUserForm((current) => ({
                  ...current,
                  employeeId: event.target.value,
                  name: employee?.name || current.name,
                  role: employee?.department === "RESTAURANT" ? "KITCHEN" : "CASHIER",
                }));
              }}
            >
              <option value="">{t("manager.selectEmployee")}</option>
              {activeEmployees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name} - {labelDepartment(employee.department)}
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
          <select value={userForm.role} onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value }))}>
            {["ADMIN", "MANAGER", "CASHIER", "KITCHEN"].map((role) => <option key={role} value={role}>{t(`role.${role}`)}</option>)}
          </select>
          <label className="toggle-row">
            <input type="checkbox" checked={userForm.active} onChange={(event) => setUserForm((current) => ({ ...current, active: event.target.checked }))} />
            <span>{userForm.active ? t("common.active") : t("common.inactive")}</span>
          </label>
          <button className="btn-confirm" onClick={saveUser}>{userForm.id ? t("manager.updateUser") : t("manager.addUser")}</button>
        </div>
        <div className="form-grid settings-filter-grid">
          <input value={userFilter.query} onChange={(event) => setUserFilter((current) => ({ ...current, query: event.target.value }))} placeholder={t("manager.userSearch")} />
          <select value={userFilter.role} onChange={(event) => setUserFilter((current) => ({ ...current, role: event.target.value }))}>
            <option value="ALL">{t("common.all")}</option>
            {["ADMIN", "MANAGER", "CASHIER", "KITCHEN"].map((role) => <option key={role} value={role}>{t(`role.${role}`)}</option>)}
          </select>
          <select value={userFilter.status} onChange={(event) => setUserFilter((current) => ({ ...current, status: event.target.value }))}>
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
            <button className="btn-confirm" onClick={saveRolePermissions}>{t("common.save")}</button>
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
      </section>

      {settingsSection("branch", t("settings.branchSettings"), t("settings.branchSettingsHint"), settingsGroups.branch)}
      {settingsSection("invoice", t("settings.invoiceSettings"), t("settings.invoiceSettingsHint"), settingsGroups.invoice)}
      {settingsSection("printing", t("settings.printSettings"), t("settings.printSettingsHint"), settingsGroups.printing)}
      {settingsSection("business", t("settings.businessSettings"), t("settings.businessSettingsHint"), settingsGroups.business)}
      {settingsSection("workflow", t("settings.workflowSettings"), t("settings.workflowSettingsHint"), settingsGroups.workflow)}
      {settingsSection("reports", t("settings.reportSettings"), t("settings.reportSettingsHint"), settingsGroups.reports)}
      {settingsSection("auditBackup", t("settings.auditBackupSettings"), t("settings.auditBackupSettingsHint"), settingsGroups.auditBackup)}

      <section className={`employee-manager ${settingsTab === "backupRestore" ? "" : "is-hidden"}`}>
        <div className="row">
          <div>
            <h3>{t("manager.backupRestore")}</h3>
            <div className="muted">{t("manager.backupRestoreHint")}</div>
          </div>
          <div className="actions">
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
      </section>

      <section className={`employee-manager ${settingsTab === "messages" ? "" : "is-hidden"}`}>
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
      </section>
        </div>
      </section>

      <section className={`panel ${managerTab === "activity" ? "" : "is-hidden"}`}>
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
      </section>

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
              {selectedOrder.exitEmployee && (
                <div className="meta-line exit-employee-line" style={uiMessageStyle(uiMessages.exitEmployee)}>
                  {formatUiMessage(uiMessages.exitEmployee, { employee: selectedOrder.exitEmployee }).split("\n").map((line, index) => (
                    <span className={index === 1 ? employeeGenderClass(selectedOrder.exitEmployee) : ""} key={index}>{line}</span>
                  ))}
                </div>
              )}
              {selectedOrder.paymentEmployee && <div className="meta-line"><span>{t("common.paymentEmployee")}</span><b className={`meta-value meta-payment-employee ${employeeGenderClass(selectedOrder.paymentEmployee)}`}>{selectedOrder.paymentEmployee}</b></div>}
              {selectedOrder.geideaRegisteredAt && (
                <div className="geidea-alert-line" style={uiMessageStyle(uiMessages.geideaRegistered)}>
                  {formatUiMessage(uiMessages.geideaRegistered, {
                    employee: selectedOrder.geideaEmployee || "-",
                    time: formatDateTime(selectedOrder.geideaRegisteredAt),
                  }).split("\n").map((line, index) => (
                    <span className={index === 1 ? employeeGenderClass(selectedOrder.geideaEmployee) : ""} key={index}>{line}</span>
                  ))}
                </div>
              )}
              {!selectedOrder.geideaRegisteredAt && <div className="meta-line"><span>{t("common.systemRegistered")}</span><b className="meta-value meta-pending">{t("common.no")}</b></div>}
              <div className="meta-line"><span>{t("common.status")}</span><b className={`meta-value ${orderStageClass(selectedOrder)}`}>{labelOrderStage(selectedOrder)}</b></div>
              <div className="meta-line"><span>{t("common.payment")}</span><b className={`meta-value ${selectedOrder.paymentMethod === "VISA" ? "meta-visa" : "meta-cash"}`}>{labelStatus(selectedOrder.paymentStatus)} / {labelMethod(selectedOrder.paymentMethod)}</b></div>
              <div className="meta-line"><span>{t("common.archived")}</span><b className={`meta-value ${selectedOrder.archivedAt ? "meta-system" : "meta-pending"}`}>{selectedOrder.archivedAt ? t("common.yes") : t("common.no")}</b></div>
              {selectedOrder.closedAt && (
                <div className="archive-alert-line" style={uiMessageStyle(uiMessages.closedAt)}>
                  {formatUiMessage(uiMessages.closedAt, { time: formatDateTime(selectedOrder.closedAt) })}
                </div>
              )}
              {selectedOrder.archivedAt && (
                <div className="archive-alert-line" style={uiMessageStyle(uiMessages.archivedAt)}>
                  {formatUiMessage(uiMessages.archivedAt, { time: formatDateTime(selectedOrder.archivedAt) })}
                </div>
              )}
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
                  <select value={orderItemForm.productId} onChange={(event) => setOrderItemForm((current) => ({ ...current, productId: event.target.value }))}>
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
