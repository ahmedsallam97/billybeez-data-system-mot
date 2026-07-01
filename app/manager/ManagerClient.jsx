"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "../ToastProvider";
import { useI18n } from "../i18n";
import { applyEmployeeNameStyles, employeeGenderClass, normalizeEmployeeNameStyles } from "../employeeDisplay";
import { formatUiMessage, normalizeUiMessages, uiMessageKeys, uiMessageStyle } from "../uiMessages";

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
  name: "",
  username: "",
  password: "",
  role: "CASHIER",
  active: true,
};

function emptyDashboardData() {
  return {
    businessState: null,
    reportBusinessDate: "",
    totalSales: 0,
    ordersCount: 0,
    paidOrders: 0,
    unpaidOrders: 0,
    leftUnpaid: 0,
    archivedOrders: 0,
    geideaRegisteredOrders: 0,
    orders: [],
    orderHistory: [],
    paymentBreakdown: [],
    statusBreakdown: [],
    topProducts: [],
    topBracelets: [],
    cashierPerformance: [],
    dataEmployeePerformance: [],
    dailySales: [],
    auditLogs: [],
  };
}

export default function ManagerClient() {
  const toast = useToast();
  const { t, formatNumber, currency, labelAudit, labelBusinessMessage, labelDepartment, labelMethod, labelOrderStage, labelStatus, formatDateTime } = useI18n();
  const [data, setData] = useState(emptyDashboardData());
  const [employees, setEmployees] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployeeForm);
  const [productForm, setProductForm] = useState(emptyProductForm);
  const [userForm, setUserForm] = useState(emptyUserForm);
  const [viewMode, setViewMode] = useState("TODAY");
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
  const [loadError, setLoadError] = useState("");

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

  async function load() {
    setLoadError("");

    const results = await Promise.allSettled([
      fetchJson("/api/dashboard", emptyDashboardData(), t("manager.tabOrders")),
      fetchJson("/api/employees?department=ALL&includeInactive=true", [], t("settings.employeeManagement")),
      fetchJson("/api/products?includeInactive=true", [], t("settings.productManagement")),
      fetchJson("/api/users", [], t("settings.userPermissions")),
      fetchJson("/api/settings", { settings: [] }, t("manager.tabSettings")),
      fetchJson("/api/backups", { backups: [] }, t("settings.backupRestore")),
    ]);
    const [dashboardResult, employeesResult, productsResult, usersResult, settingsResult, backupsResult] = results;
    const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason?.message || t("manager.loadFailed"));

    if (dashboardResult.status === "fulfilled") {
      setData({ ...emptyDashboardData(), ...(dashboardResult.value || {}) });
    }

    if (employeesResult.status === "fulfilled") {
      setEmployees(Array.isArray(employeesResult.value) ? employeesResult.value : []);
    }

    if (productsResult.status === "fulfilled") {
      setProducts(Array.isArray(productsResult.value) ? productsResult.value : []);
    }

    if (usersResult.status === "fulfilled") {
      setUsers(Array.isArray(usersResult.value) ? usersResult.value : []);
    }

    if (settingsResult.status === "fulfilled") {
      const settingsList = Array.isArray(settingsResult.value.settings) ? settingsResult.value.settings : [];
      const nextSettingsMap = Object.fromEntries(settingsList.map((setting) => [setting.key, setting.value]));
      const employeeStyleSetting = settingsList.find((item) => item.key === "EMPLOYEE_NAME_STYLE_CONFIG");
      const normalizedEmployeeStyles = normalizeEmployeeNameStyles(employeeStyleSetting?.value);

      setSettingsMap(nextSettingsMap);
      setUiMessages(normalizeUiMessages(nextSettingsMap.UI_MESSAGE_CONFIG));
      setRolePermissions(normalizeRolePermissions(nextSettingsMap.ROLE_PERMISSION_CONFIG));
      setEmployeeNameStyles(normalizedEmployeeStyles);
      applyEmployeeNameStyles(normalizedEmployeeStyles);
    }

    if (backupsResult.status === "fulfilled") {
      setBackups(Array.isArray(backupsResult.value.backups) ? backupsResult.value.backups : []);
    }

    if (errors.length) {
      const message = errors.join(" · ");
      console.error("[manager-load]", errors);
      setLoadError(message);
      toast(message, "error");
    }
  }

  async function fetchJson(endpoint, fallback, label) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(endpoint, { signal: controller.signal });
      const text = await res.text();
      let parsed = fallback;

      if (text) {
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error(`${label}: ${t("manager.invalidResponse")}`);
        }
      }

      if (!res.ok || parsed?.success === false) {
        throw new Error(parsed?.error || `${label}: ${res.status}`);
      }

      return parsed ?? fallback;
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new Error(`${label}: ${t("manager.requestTimeout")}`);
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
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

    toast(t("manager.settingsSaved"));
    await load();
  }

  function renderSettingsFields(fields) {
    return (
      <div className="admin-settings-grid">
        {fields.map((field) => (
          <label className="admin-setting-field" key={field.key}>
            <span>{field.label}</span>
            {field.type === "select" ? (
              <select name={field.key} aria-label={field.label} value={settingsMap[field.key] ?? field.defaultValue ?? ""} onChange={(event) => updateSettingValue(field.key, event.target.value)}>
                {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            ) : field.type === "checkbox" ? (
              <span className="toggle-row setting-toggle">
                <input
                  type="checkbox"
                  name={field.key}
                  aria-label={field.label}
                  checked={["1", "true", "yes", "on"].includes(String(settingsMap[field.key] ?? field.defaultValue ?? "").toLowerCase())}
                  onChange={(event) => updateSettingValue(field.key, event.target.checked ? "true" : "false")}
                />
                <span>{["1", "true", "yes", "on"].includes(String(settingsMap[field.key] ?? field.defaultValue ?? "").toLowerCase()) ? t("common.yes") : t("common.no")}</span>
              </span>
            ) : (
              <input
                type={field.type || "text"}
                min={field.min}
                name={field.key}
                aria-label={field.label}
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

  const currentArchivedOrders = useMemo(
    () => (data?.orders || []).filter((order) => order.archivedAt).map((order) => ({ ...order, isCurrentArchive: true })),
    [data],
  );

  const historyRows = useMemo(
    () => [...currentArchivedOrders, ...(data?.orderHistory || [])],
    [currentArchivedOrders, data],
  );

  const visibleOrders = useMemo(() => {
    let rows = viewMode === "HISTORY" ? historyRows : data?.orders || [];

    if (filter === "UNPAID") rows = rows.filter((order) => order.paymentStatus !== "PAID");
    if (filter === "CASH" || filter === "VISA") rows = rows.filter((order) => order.paymentStatus === "PAID" && order.paymentMethod === filter);
    if (viewMode === "TODAY" && archiveFilter === "ALL") rows = rows.filter((order) => !isUnclosedOrder(order));
    if (viewMode === "TODAY" && archiveFilter === "ACTIVE") rows = rows.filter((order) => !order.archivedAt && !isUnclosedOrder(order));
    if (viewMode === "TODAY" && archiveFilter === "ARCHIVED") rows = rows.filter((order) => order.archivedAt && !isUnclosedOrder(order));
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
  }, [data, viewMode, historyRows, filter, archiveFilter, query]);

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

    toast(t("manager.orderUpdated"));
    await refreshAfterOrderChange(orderId, closeModal);
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

    toast(t("manager.itemAdded"));
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

    toast(t("manager.itemRemoved"));
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

    toast(t("manager.employeeSaved"));
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

    toast(t("manager.employeeSaved"));
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

    toast(t("manager.productSaved"));
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

    toast(t("manager.productSaved"));
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

    toast(t("manager.userSaved"));
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

    toast(t("manager.userSaved"));
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
    toast(t("manager.uiMessagesSaved"));
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
    toast(t("manager.employeeStyleSaved"));
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

    toast(t("manager.backupCreated"), "info");
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

    toast(t("manager.restoreBackupDone"), "info");
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
    toast(t("manager.rolePermissionsSaved"));
  }

  function dailyReviewRows() {
    const orders = data?.orders || [];
    const currentDate = data?.reportBusinessDate;
    const dayOrders = currentDate ? orders.filter((order) => order.businessDate === currentDate) : orders;
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
      ["Business Date", data?.reportBusinessDate || ""],
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
    link.download = `billybeez-daily-report-${data?.reportBusinessDate || "today"}.csv`;
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
      <h1>BillyBeez Daily Report - ${escapeHtml(data?.reportBusinessDate || "")}</h1>
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
        rows: data.paymentBreakdown.map((row) => [labelMethod(row.method), `${currency(row.total)} (${formatNumber(row.count)})`]),
      },
      {
        title: t("manager.topProducts"),
        rows: data.topProducts.map((product) => [product.name, currency(product.total)]),
      },
      {
        title: t("manager.statusBreakdown"),
        rows: data.statusBreakdown.map((row) => [labelStatus(row.status), formatNumber(row.count)]),
      },
      {
        title: t("manager.cashierPerformance"),
        rows: data.cashierPerformance.map((row) => [row.name, currency(row.total)]),
      },
      {
        title: t("manager.employees"),
        rows: data.dataEmployeePerformance.map((row) => [row.name, currency(row.total)]),
      },
      {
        title: t("manager.topBracelets"),
        rows: data.topBracelets.map((row) => [row.bracelet, currency(row.total)]),
      },
      {
        title: t("manager.dailySales"),
        rows: data.dailySales.map((row) => [row.date, currency(row.total)]),
      },
    ];
  }

  function exportReportsCsv() {
    const rows = [
      [t("manager.tabReports"), data?.reportBusinessDate || ""],
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
    link.download = `billybeez-reports-${data?.reportBusinessDate || "today"}.csv`;
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
      <h1>${escapeHtml(t("manager.tabReports"))} - ${escapeHtml(data?.reportBusinessDate || "")}</h1>
      ${sections}
      <script>window.print()</script>
      </body></html>
    `);
    window.setTimeout(() => setReportPrintHtml(""), 5000);
  }

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
    return [user.name, user.username, user.role].some((value) => String(value || "").toLowerCase().includes(search));
  });
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
      { key: "KITCHEN_TICKET_CATEGORIES", label: t("settings.kitchenTicketCategories") },
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
      {loadError && (
        <section className="panel warning manager-load-error" role="alert">
          <span>{loadError}</span>
          <button type="button" className="secondary" onClick={load}>{t("common.refresh")}</button>
        </section>
      )}

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
            <button className={viewMode === "TODAY" ? "secondary" : ""} onClick={() => setViewMode("TODAY")}>{t("common.today")}</button>
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
          <input name="manager-order-search" aria-label={t("manager.searchPlaceholder")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("manager.searchPlaceholder")} />
          <button className="secondary" onClick={() => setQuery("")}>{t("common.clearFilters")}</button>
        </div>
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
            <button className="btn-print" onClick={exportReportsCsv}>{t("manager.exportExcel")}</button>
            <button className="btn-details" onClick={printReportsPdf}>{t("manager.exportPdf")}</button>
          </div>
        </div>
      </section>

      <section className={`grid three ${managerTab === "reports" ? "" : "is-hidden"}`}>
        <div className="panel">
          <h3>{t("manager.paymentBreakdown")}</h3>
          {data.paymentBreakdown.map((row) => (
            <div className="row" key={row.method}><span>{labelMethod(row.method)} ({formatNumber(row.count)})</span><b>{currency(row.total)}</b></div>
          ))}
          <MiniBars rows={data.paymentBreakdown} labelKey="method" valueKey="total" labelFormatter={labelMethod} valueFormatter={currency} />
        </div>
        <div className="panel">
          <h3>{t("manager.topProducts")}</h3>
          {data.topProducts.map((product) => (
            <div className="row" key={product.name}><span>{product.name}</span><b>{currency(product.total)}</b></div>
          ))}
        </div>
        <div className="panel">
          <h3>{t("manager.statusBreakdown")}</h3>
          {data.statusBreakdown.map((row) => (
            <div className="row" key={row.status}><span>{labelStatus(row.status)}</span><b>{formatNumber(row.count)}</b></div>
          ))}
        </div>
      </section>

      <section className={`grid three ${managerTab === "reports" ? "" : "is-hidden"}`}>
        <Report title={t("manager.cashierPerformance")} rows={data.cashierPerformance} labelKey="name" valueKey="total" formatValue={currency} emptyLabel={t("common.noData")} />
        <Report title={t("manager.employees")} rows={data.dataEmployeePerformance} labelKey="name" valueKey="total" formatValue={currency} emptyLabel={t("common.noData")} />
        <Report title={t("manager.topBracelets")} rows={data.topBracelets} labelKey="bracelet" valueKey="total" formatValue={currency} emptyLabel={t("common.noData")} />
      </section>

      <section className={`panel ${managerTab === "reports" ? "" : "is-hidden"}`}>
        <h3>{t("manager.dailySales")}</h3>
        <MiniBars rows={data.dailySales} labelKey="date" valueKey="total" valueFormatter={currency} />
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
            name="employee-name"
            aria-label={t("manager.employeeName")}
            value={employeeForm.name}
            onChange={(event) => setEmployeeForm((current) => ({ ...current, name: event.target.value }))}
            placeholder={t("manager.employeeName")}
          />
          <select
            name="employee-department"
            aria-label={t("common.department")}
            value={employeeForm.department}
            onChange={(event) => setEmployeeForm((current) => ({ ...current, department: event.target.value }))}
          >
            <option value="OPERATION">{labelDepartment("OPERATION")}</option>
            <option value="RESTAURANT">{labelDepartment("RESTAURANT")}</option>
          </select>
          <label className="toggle-row">
            <input
              type="checkbox"
              name="employee-active"
              aria-label={employeeForm.active ? t("common.active") : t("common.inactive")}
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
                    <input type="color" name={`${group}-employee-color`} aria-label={`${label} ${t("manager.textColor")}`} value={employeeNameStyles[group].color} onChange={(event) => updateEmployeeNameStyle(group, "color", event.target.value)} />
                  </label>
                  <label>
                    <span>{t("manager.fontSize")}</span>
                    <input type="number" name={`${group}-employee-font-size`} aria-label={`${label} ${t("manager.fontSize")}`} min="10" max="28" value={employeeNameStyles[group].fontSize} onChange={(event) => updateEmployeeNameStyle(group, "fontSize", event.target.value)} />
                  </label>
                  <label>
                    <span>{t("manager.fontWeight")}</span>
                    <input type="number" name={`${group}-employee-font-weight`} aria-label={`${label} ${t("manager.fontWeight")}`} min="400" max="950" step="50" value={employeeNameStyles[group].fontWeight} onChange={(event) => updateEmployeeNameStyle(group, "fontWeight", event.target.value)} />
                  </label>
                  <label>
                    <span>{t("manager.fontStyle")}</span>
                    <select name={`${group}-employee-font-style`} aria-label={`${label} ${t("manager.fontStyle")}`} value={employeeNameStyles[group].fontStyle} onChange={(event) => updateEmployeeNameStyle(group, "fontStyle", event.target.value)}>
                      <option value="normal">{t("manager.fontStyleNormal")}</option>
                      <option value="italic">{t("manager.fontStyleItalic")}</option>
                    </select>
                  </label>
                  <label>
                    <span>{t("manager.fontFamily")}</span>
                    <select name={`${group}-employee-font-family`} aria-label={`${label} ${t("manager.fontFamily")}`} value={employeeNameStyles[group].fontFamily} onChange={(event) => updateEmployeeNameStyle(group, "fontFamily", event.target.value)}>
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
          <input name="employee-search" aria-label={t("manager.employeeSearch")} value={employeeFilter.query} onChange={(event) => setEmployeeFilter((current) => ({ ...current, query: event.target.value }))} placeholder={t("manager.employeeSearch")} />
          <select name="employee-filter-department" aria-label={t("common.department")} value={employeeFilter.department} onChange={(event) => setEmployeeFilter((current) => ({ ...current, department: event.target.value }))}>
            <option value="ALL">{t("common.all")}</option>
            <option value="OPERATION">{labelDepartment("OPERATION")}</option>
            <option value="RESTAURANT">{labelDepartment("RESTAURANT")}</option>
          </select>
          <select name="employee-filter-status" aria-label={t("common.status")} value={employeeFilter.status} onChange={(event) => setEmployeeFilter((current) => ({ ...current, status: event.target.value }))}>
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
          <input name="product-name" aria-label={t("manager.productName")} value={productForm.name} onChange={(event) => setProductForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("manager.productName")} />
          <input name="product-price" aria-label={t("manager.productPrice")} type="number" min="0" value={productForm.price} onChange={(event) => setProductForm((current) => ({ ...current, price: event.target.value }))} placeholder={t("manager.productPrice")} />
          <input name="product-category" aria-label={t("manager.categoryName")} value={productForm.categoryName} onChange={(event) => setProductForm((current) => ({ ...current, categoryName: event.target.value, categoryId: event.target.value }))} placeholder={t("manager.categoryName")} />
          <input name="product-image-url" aria-label={t("manager.productImage")} value={productForm.imageUrl} onChange={(event) => setProductForm((current) => ({ ...current, imageUrl: event.target.value }))} placeholder={t("manager.productImage")} />
          <label className="toggle-row">
            <input type="checkbox" name="product-popular" aria-label={t("manager.popularProduct")} checked={productForm.popular} onChange={(event) => setProductForm((current) => ({ ...current, popular: event.target.checked }))} />
            <span>{t("manager.popularProduct")}</span>
          </label>
          <label className="toggle-row">
            <input type="checkbox" name="product-active" aria-label={productForm.active ? t("common.active") : t("common.inactive")} checked={productForm.active} onChange={(event) => setProductForm((current) => ({ ...current, active: event.target.checked }))} />
            <span>{productForm.active ? t("common.active") : t("common.inactive")}</span>
          </label>
          <button className="btn-confirm" onClick={saveProduct}>{productForm.id ? t("manager.updateProduct") : t("manager.addProduct")}</button>
        </div>
        <div className="form-grid settings-filter-grid product-settings-filter">
          <input name="product-search" aria-label={t("manager.productSearch")} value={productFilter.query} onChange={(event) => setProductFilter((current) => ({ ...current, query: event.target.value }))} placeholder={t("manager.productSearch")} />
          <select name="product-filter-category" aria-label={t("manager.categoryName")} value={productFilter.category} onChange={(event) => setProductFilter((current) => ({ ...current, category: event.target.value }))}>
            {productCategories.map((category) => <option key={category} value={category}>{category === "ALL" ? t("common.all") : category}</option>)}
          </select>
          <select name="product-filter-status" aria-label={t("common.status")} value={productFilter.status} onChange={(event) => setProductFilter((current) => ({ ...current, status: event.target.value }))}>
            <option value="ALL">{t("common.all")}</option>
            <option value="ACTIVE">{t("common.active")}</option>
            <option value="INACTIVE">{t("common.inactive")}</option>
          </select>
          <select name="product-filter-popular" aria-label={t("manager.popularProduct")} value={productFilter.popular} onChange={(event) => setProductFilter((current) => ({ ...current, popular: event.target.value }))}>
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
          <input name="managed-user-name" aria-label={t("common.name")} value={userForm.name} onChange={(event) => setUserForm((current) => ({ ...current, name: event.target.value }))} placeholder={t("common.name")} />
          <input name="managed-user-username" aria-label={t("login.username")} value={userForm.username} onChange={(event) => setUserForm((current) => ({ ...current, username: event.target.value }))} placeholder={t("login.username")} />
          <input
            type="password"
            name="managed-user-new-password"
            aria-label={userForm.id ? t("manager.passwordOptional") : t("login.password")}
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
          <select name="managed-user-role" aria-label="Role" value={userForm.role} onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value }))}>
            {["ADMIN", "MANAGER", "CASHIER", "KITCHEN"].map((role) => <option key={role} value={role}>{t(`role.${role}`)}</option>)}
          </select>
          <label className="toggle-row">
            <input type="checkbox" name="managed-user-active" aria-label={userForm.active ? t("common.active") : t("common.inactive")} checked={userForm.active} onChange={(event) => setUserForm((current) => ({ ...current, active: event.target.checked }))} />
            <span>{userForm.active ? t("common.active") : t("common.inactive")}</span>
          </label>
          <button className="btn-confirm" onClick={saveUser}>{userForm.id ? t("manager.updateUser") : t("manager.addUser")}</button>
        </div>
        <div className="form-grid settings-filter-grid">
          <input name="user-search" aria-label={t("manager.userSearch")} value={userFilter.query} onChange={(event) => setUserFilter((current) => ({ ...current, query: event.target.value }))} placeholder={t("manager.userSearch")} />
          <select name="user-filter-role" aria-label="Role" value={userFilter.role} onChange={(event) => setUserFilter((current) => ({ ...current, role: event.target.value }))}>
            <option value="ALL">{t("common.all")}</option>
            {["ADMIN", "MANAGER", "CASHIER", "KITCHEN"].map((role) => <option key={role} value={role}>{t(`role.${role}`)}</option>)}
          </select>
          <select name="user-filter-status" aria-label={t("common.status")} value={userFilter.status} onChange={(event) => setUserFilter((current) => ({ ...current, status: event.target.value }))}>
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
            <b>{t("common.status")}</b>
            <b>{t("common.actions")}</b>
          </div>
          {visibleUsers.map((user) => (
            <div className="employee-row user-row" key={user.id}>
              <span>{user.name}</span>
              <span>{user.username} · {t(`role.${user.role}`)}</span>
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
                      name={`permission-${permission}-${role}`}
                      aria-label={`${t(`permission.${permission}`)} ${t(`role.${role}`)}`}
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
        <div className="ui-message-grid">
          {uiMessageKeys.map((key) => {
            const message = uiMessages[key];
            return (
              <div className="ui-message-editor" key={key}>
                <div className="row">
                  <b>{t(`uiMessage.${key}`)}</b>
                  <span className="muted">{key}</span>
                </div>
                <textarea
                  name={`ui-message-${key}`}
                  aria-label={t(`uiMessage.${key}`)}
                  value={message.text}
                  onChange={(event) => updateUiMessage(key, "text", event.target.value)}
                  rows={3}
                  placeholder={t("manager.messageText")}
                />
                <div className="ui-message-fields">
                  <label>
                    <span>{t("manager.backgroundColor")}</span>
                    <input type="color" name={`ui-message-${key}-background`} aria-label={`${t(`uiMessage.${key}`)} ${t("manager.backgroundColor")}`} value={message.backgroundColor} onChange={(event) => updateUiMessage(key, "backgroundColor", event.target.value)} />
                  </label>
                  <label>
                    <span>{t("manager.textColor")}</span>
                    <input type="color" name={`ui-message-${key}-text-color`} aria-label={`${t(`uiMessage.${key}`)} ${t("manager.textColor")}`} value={message.textColor} onChange={(event) => updateUiMessage(key, "textColor", event.target.value)} />
                  </label>
                  <label>
                    <span>{t("manager.borderColor")}</span>
                    <input type="color" name={`ui-message-${key}-border-color`} aria-label={`${t(`uiMessage.${key}`)} ${t("manager.borderColor")}`} value={message.borderColor} onChange={(event) => updateUiMessage(key, "borderColor", event.target.value)} />
                  </label>
                  <label>
                    <span>{t("manager.fontSize")}</span>
                    <input type="number" name={`ui-message-${key}-font-size`} aria-label={`${t(`uiMessage.${key}`)} ${t("manager.fontSize")}`} min="10" max="28" value={message.fontSize} onChange={(event) => updateUiMessage(key, "fontSize", event.target.value)} />
                  </label>
                  <label>
                    <span>{t("manager.fontWeight")}</span>
                    <input type="number" name={`ui-message-${key}-font-weight`} aria-label={`${t(`uiMessage.${key}`)} ${t("manager.fontWeight")}`} min="400" max="950" step="50" value={message.fontWeight} onChange={(event) => updateUiMessage(key, "fontWeight", event.target.value)} />
                  </label>
                  <label>
                    <span>{t("manager.minHeight")}</span>
                    <input type="number" name={`ui-message-${key}-min-height`} aria-label={`${t(`uiMessage.${key}`)} ${t("manager.minHeight")}`} min="24" max="90" value={message.minHeight} onChange={(event) => updateUiMessage(key, "minHeight", event.target.value)} />
                  </label>
                  <label>
                    <span>{t("manager.radius")}</span>
                    <input type="number" name={`ui-message-${key}-radius`} aria-label={`${t(`uiMessage.${key}`)} ${t("manager.radius")}`} min="0" max="24" value={message.radius} onChange={(event) => updateUiMessage(key, "radius", event.target.value)} />
                  </label>
                </div>
                <div className="ui-message-preview" style={uiMessageStyle(message)}>
                  {formatUiMessage(message, {
                    employee: "محمد أمين",
                    time: "01:38:25 PM",
                    method: labelMethod("CASH"),
                  }).split("\n").map((line, index) => <span key={index}>{line}</span>)}
                </div>
              </div>
            );
          })}
        </div>
      </section>
        </div>
      </section>

      <section className={`panel ${managerTab === "activity" ? "" : "is-hidden"}`}>
        <h3>{t("manager.recentActivity")}</h3>
        {(data.auditLogs || []).length === 0 ? (
          <div className="muted">{t("manager.noActivity")}</div>
        ) : data.auditLogs.map((log) => (
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
                  <select name="manager-order-product" aria-label={t("manager.addItem")} value={orderItemForm.productId} onChange={(event) => setOrderItemForm((current) => ({ ...current, productId: event.target.value }))}>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name} - {currency(product.price)}</option>)}
                  </select>
                  <input
                    type="number"
                    min="1"
                    value={orderItemForm.qty}
                    name="manager-order-item-qty"
                    onChange={(event) => setOrderItemForm((current) => ({ ...current, qty: Math.max(1, Number(event.target.value) || 1) }))}
                    aria-label={t("common.qty")}
                  />
                  <button className="btn-confirm" onClick={() => addOrderItem(selectedOrder.id)}>{t("manager.addItem")}</button>
                </div>
                <div className="form-grid manager-order-edit-grid">
                  <select
                    name="manager-payment-employee"
                    aria-label={t("manager.selectReceiver")}
                    className={employeeGenderClass(restaurantEmployees().find((employee) => employee.id === managerPaymentEmployeeId)?.name)}
                    value={managerPaymentEmployeeId}
                    onChange={(event) => setManagerPaymentEmployeeId(event.target.value)}
                  >
                    <option value="">{t("manager.selectReceiver")}</option>
                    {restaurantEmployees().map((employee) => <option className={employeeGenderClass(employee.name)} key={employee.id} value={employee.id}>{employee.name}</option>)}
                  </select>
                  <button className={paymentButtonClass(selectedOrder, "CASH", "btn-pay-cash")} onClick={() => payOrder(selectedOrder.id, "CASH")}>
                    {selectedOrder.paymentStatus === "PAID" && selectedOrder.paymentMethod === "CASH" ? t("manager.cashPaid") : t("manager.setCashPaid")}
                  </button>
                  <button className={paymentButtonClass(selectedOrder, "VISA", "btn-pay-visa")} onClick={() => payOrder(selectedOrder.id, "VISA")}>
                    {selectedOrder.paymentStatus === "PAID" && selectedOrder.paymentMethod === "VISA" ? t("manager.visaPaid") : t("manager.setVisaPaid")}
                  </button>
                </div>
                <div className="form-grid manager-order-edit-grid">
                  <select
                    name="manager-geidea-employee"
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
