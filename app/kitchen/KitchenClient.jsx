"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../ToastProvider";
import { useI18n } from "../i18n";
import OrderAlerts from "../OrderAlerts";
import OrderItemsSummary from "../OrderItemsSummary";
import { applyEmployeeNameStyles, employeeGenderClass } from "../employeeDisplay";
import { formatUiMessage, normalizeUiMessages, uiMessageStyle } from "../uiMessages";
import { filterKitchenTicketItems } from "../../lib/kitchen-ticket-rules";

export default function KitchenClient({ user }) {
  const toast = useToast();
  const { t, formatNumber, currency, labelMethod, labelOrderStage, labelStatus, formatDateTime } = useI18n();
  const [orders, setOrders] = useState([]);
  const [showArchive, setShowArchive] = useState(false);
  const [ordersQuery, setOrdersQuery] = useState("");
  const [orderRenderLimit, setOrderRenderLimit] = useState(30);
  const [restaurantEmployees, setRestaurantEmployees] = useState([]);
  const [deliveryEmployeeByOrder, setDeliveryEmployeeByOrder] = useState({});
  const [geideaEmployeeByOrder, setGeideaEmployeeByOrder] = useState({});
  const [paymentEmployeeByOrder, setPaymentEmployeeByOrder] = useState({});
  const [defaultDeliveryEmployeeId, setDefaultDeliveryEmployeeId] = useState("");
  const [defaultRestaurantEmployeeId, setDefaultRestaurantEmployeeId] = useState("");
  const [defaultPaymentEmployeeId, setDefaultPaymentEmployeeId] = useState("");
  const [employeeEditor, setEmployeeEditor] = useState(null);
  const [printFrameUrl, setPrintFrameUrl] = useState("");
  const [kitchenTicketRules, setKitchenTicketRules] = useState("");
  const [uiMessages, setUiMessages] = useState(normalizeUiMessages());
  const [uiPrefsReady, setUiPrefsReady] = useState(false);
  const ordersLoadRef = useRef(false);
  const isLinkedKitchenEmployeeAccount = user?.role === "KITCHEN" && user?.employeeId && user?.employee?.department === "KITCHEN";
  const linkedRestaurantEmployeeId = isLinkedKitchenEmployeeAccount ? user.employeeId : "";
  const linkedRestaurantEmployeeName = isLinkedKitchenEmployeeAccount ? user.employee.name : "";

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

  function paymentButtonClass(order, method, baseClass) {
    return `${baseClass} ${order.paymentStatus === "PAID" && order.paymentMethod === method ? "payment-selected" : ""}`;
  }

  function paidPaymentLabel(order) {
    return order.paymentMethod === "VISA" ? t("common.visa") : t("common.cash");
  }

  function hasKitchenTicketItems(order) {
    return filterKitchenTicketItems(order.items || [], kitchenTicketRules).matchedItems.length > 0;
  }

  function orderStageClass(order) {
    if (order.geideaRegisteredAt) return "meta-system";
    if (order.paymentStatus === "PAID") return order.paymentMethod === "VISA" ? "meta-visa" : "meta-cash";
    if (order.kitchenStatus === "DELIVERED") return "meta-delivered";
    return order.kitchenPrintJob ? "meta-preparing" : "meta-pending";
  }

  const kitchenOrders = useMemo(() => {
    if (showArchive) return orders;
    return orders.filter((order) => !order.geideaRegisteredAt);
  }, [orders, showArchive]);

  const visibleOrders = useMemo(() => {
    const search = ordersQuery.trim().toLowerCase();
    if (!search) return kitchenOrders;

    return kitchenOrders.filter((order) => [
      order.id,
      order.braceletNo,
      order.customerPhone,
      order.childNames,
    ].some((value) => String(value || "").toLowerCase().includes(search)));
  }, [kitchenOrders, ordersQuery]);

  const renderedOrders = useMemo(
    () => visibleOrders.slice(0, orderRenderLimit),
    [visibleOrders, orderRenderLimit],
  );

  const unpaidCount = kitchenOrders.filter((order) => order.paymentStatus !== "PAID").length;
  const unregisteredCount = kitchenOrders.filter((order) => !order.geideaRegisteredAt).length;

  useEffect(() => {
    const savedArchive = localStorage.getItem("kitchenShowArchive");
    if (savedArchive === "true" || savedArchive === "false") setShowArchive(savedArchive === "true");
    setUiPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!uiPrefsReady) return;
    localStorage.setItem("kitchenShowArchive", String(showArchive));
  }, [showArchive, uiPrefsReady]);

  useEffect(() => {
    setOrderRenderLimit(30);
  }, [showArchive, ordersQuery]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [showArchive]);

  useEffect(() => {
    loadRestaurantEmployees();
    loadUiMessages();
  }, []);

  async function loadUiMessages() {
    const res = await fetch("/api/settings").catch(() => null);
    if (!res?.ok) return;
    const data = await res.json();
    const setting = data.settings?.find((item) => item.key === "UI_MESSAGE_CONFIG");
    const employeeStyleSetting = data.settings?.find((item) => item.key === "EMPLOYEE_NAME_STYLE_CONFIG");
    const kitchenTicketSetting = data.settings?.find((item) => item.key === "KITCHEN_TICKET_CATEGORIES");
    setUiMessages(normalizeUiMessages(setting?.value));
    setKitchenTicketRules(kitchenTicketSetting?.value || "");
    applyEmployeeNameStyles(employeeStyleSetting?.value);
  }

  async function load() {
    if (ordersLoadRef.current) return;
    ordersLoadRef.current = true;
    try {
      const res = await fetch(`/api/orders?archived=${showArchive}`);
      const ordersData = await res.json();
      setOrders(ordersData);
      setPaymentEmployeeByOrder((current) => {
        const next = { ...current };
        ordersData.forEach((order) => {
          if (!next[order.id] && order.paymentEmployeeId) next[order.id] = order.paymentEmployeeId;
        });
        return next;
      });
      setDeliveryEmployeeByOrder((current) => {
        const next = { ...current };
        ordersData.forEach((order) => {
          if (!next[order.id] && order.deliveryEmployeeId) next[order.id] = order.deliveryEmployeeId;
        });
        return next;
      });
      setGeideaEmployeeByOrder((current) => {
        const next = { ...current };
        ordersData.forEach((order) => {
          if (!next[order.id] && order.geideaEmployeeId) next[order.id] = order.geideaEmployeeId;
        });
        return next;
      });
    } finally {
      ordersLoadRef.current = false;
    }
  }

  function applyOrderUpdate(updatedOrder) {
    if (!updatedOrder) return false;

    setOrders((current) => {
      const shouldKeep = showArchive ? Boolean(updatedOrder.archivedAt) : !updatedOrder.archivedAt && !updatedOrder.geideaRegisteredAt;
      const exists = current.some((order) => order.id === updatedOrder.id);

      if (!shouldKeep) return current.filter((order) => order.id !== updatedOrder.id);
      if (exists) return current.map((order) => order.id === updatedOrder.id ? updatedOrder : order);
      return [updatedOrder, ...current];
    });

    if (updatedOrder.paymentEmployeeId) {
      setPaymentEmployeeByOrder((current) => ({ ...current, [updatedOrder.id]: updatedOrder.paymentEmployeeId }));
    }
    if (updatedOrder.deliveryEmployeeId) {
      setDeliveryEmployeeByOrder((current) => ({ ...current, [updatedOrder.id]: updatedOrder.deliveryEmployeeId }));
    }
    if (updatedOrder.geideaEmployeeId) {
      setGeideaEmployeeByOrder((current) => ({ ...current, [updatedOrder.id]: updatedOrder.geideaEmployeeId }));
    }

    return true;
  }

  async function refreshOrderFallback(data) {
    if (!applyOrderUpdate(data?.order)) await load();
  }

  async function loadRestaurantEmployees() {
    const res = await fetch("/api/employees?department=KITCHEN");
    const employees = await res.json();
    setRestaurantEmployees(employees);

    const lastEmployeeId = localStorage.getItem("lastRestaurantEmployeeId") || "";
    const lastDeliveryEmployeeId = localStorage.getItem("lastDeliveryEmployeeId") || "";
    if (linkedRestaurantEmployeeId) {
      setDefaultRestaurantEmployeeId(linkedRestaurantEmployeeId);
      setDefaultDeliveryEmployeeId(linkedRestaurantEmployeeId);
    } else if (employees.some((employee) => employee.id === lastEmployeeId)) {
      setDefaultRestaurantEmployeeId(lastEmployeeId);
      setDefaultDeliveryEmployeeId(employees.some((employee) => employee.id === lastDeliveryEmployeeId) ? lastDeliveryEmployeeId : employees[0]?.id || "");
    } else {
      setDefaultRestaurantEmployeeId("");
      setDefaultDeliveryEmployeeId(employees[0]?.id || "");
    }

    const lastPaymentEmployeeId = localStorage.getItem("lastPaymentEmployeeId") || "";
    if (linkedRestaurantEmployeeId) {
      setDefaultPaymentEmployeeId(linkedRestaurantEmployeeId);
    } else if (employees.some((employee) => employee.id === lastPaymentEmployeeId)) {
      setDefaultPaymentEmployeeId(lastPaymentEmployeeId);
    } else {
      setDefaultPaymentEmployeeId(employees[0]?.id || "");
    }
  }

  function selectedPaymentEmployeeId(orderId) {
    return linkedRestaurantEmployeeId || paymentEmployeeByOrder[orderId] || defaultPaymentEmployeeId;
  }

  function selectPaymentEmployee(orderId, employeeId) {
    setPaymentEmployeeByOrder((current) => ({ ...current, [orderId]: employeeId }));
    if (!linkedRestaurantEmployeeId) localStorage.setItem("lastPaymentEmployeeId", employeeId);
  }

  function selectedDeliveryEmployeeId(orderId) {
    return linkedRestaurantEmployeeId || deliveryEmployeeByOrder[orderId] || defaultDeliveryEmployeeId;
  }

  function selectDeliveryEmployee(orderId, employeeId) {
    setDeliveryEmployeeByOrder((current) => ({ ...current, [orderId]: employeeId }));
    if (!linkedRestaurantEmployeeId) localStorage.setItem("lastDeliveryEmployeeId", employeeId);
  }

  function selectedGeideaEmployeeId(orderId) {
    return linkedRestaurantEmployeeId || geideaEmployeeByOrder[orderId] || defaultRestaurantEmployeeId;
  }

  function selectGeideaEmployee(orderId, employeeId) {
    setGeideaEmployeeByOrder((current) => ({ ...current, [orderId]: employeeId }));
    if (!linkedRestaurantEmployeeId) localStorage.setItem("lastRestaurantEmployeeId", employeeId);
  }

  async function deliver(orderId, employeeId = selectedDeliveryEmployeeId(orderId)) {
    if (!employeeId) {
      toast(t("kitchen.deliveryEmployeeRequired"), "error");
      return;
    }

    const res = await fetch(`/api/orders/${orderUrlId(orderId)}/deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deliveryEmployeeId: employeeId }),
    });
    const data = await res.json();

    if (!data.success) {
      toast(data.error || t("kitchen.deliveryFailed"), "error");
      return;
    }

    if (!linkedRestaurantEmployeeId) localStorage.setItem("lastDeliveryEmployeeId", employeeId);
    setEmployeeEditor(null);
    showUiToast("delivered");
    await refreshOrderFallback(data);
  }

  async function startPreparation(orderId) {
    const res = await fetch("/api/print-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, type: "KITCHEN" }),
    });
    const data = await res.json();

    if (!data.success) {
      toast(data.error || t("kitchen.printJobFailed"), "error");
      return;
    }

    setPrintFrameUrl(`/kitchen-ticket/${orderUrlId(orderId)}?print=${Date.now()}`);
    window.setTimeout(() => setPrintFrameUrl(""), 5000);
    toast(
      data.reused ? formatUiMessage(uiMessages.kitchenTicketQueued) : t("kitchen.printJobQueued"),
      "info",
      data.reused ? uiMessageStyle(uiMessages.kitchenTicketQueued) : null
    );
    await refreshOrderFallback(data);
  }

  async function pay(orderId, paymentMethod, printInvoice = true) {
    const paymentEmployeeId = selectedPaymentEmployeeId(orderId);

    if (!paymentEmployeeId) {
      toast(t("kitchen.paymentEmployeeRequired"), "error");
      return;
    }

    const res = await fetch(`/api/orders/${orderUrlId(orderId)}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethod, paymentEmployeeId }),
    });
    const data = await res.json();

    if (data.success) {
      if (printInvoice) {
        setPrintFrameUrl(`/invoice/${orderUrlId(orderId)}?print=${Date.now()}`);
        window.setTimeout(() => setPrintFrameUrl(""), 5000);
      }
      if (!linkedRestaurantEmployeeId) localStorage.setItem("lastPaymentEmployeeId", paymentEmployeeId);
      setEmployeeEditor(null);
      toast(
        formatUiMessage(uiMessages.paymentSaved, { method: labelMethod(paymentMethod) }),
        "info",
        uiMessageStyle(uiMessages.paymentSaved)
      );
      await refreshOrderFallback(data);
    } else {
      toast(data.error || t("kitchen.paymentFailed"), "error");
    }
  }

  async function savePaymentEmployee(order) {
    await pay(order.id, order.paymentMethod || "CASH", false);
  }

  function employeeEditorTitle() {
    if (employeeEditor?.type === "payment") return t("kitchen.selectPaymentEmployee");
    if (employeeEditor?.type === "deliver") return t("kitchen.selectDeliveryEmployee");
    return t("kitchen.selectRestaurantEmployee");
  }

  function selectedEditorEmployeeName() {
    const employeeId = selectedEditorEmployeeId();
    return linkedRestaurantEmployeeName || restaurantEmployees.find((employee) => employee.id === employeeId)?.name || "-";
  }

  function editorSaveLabel() {
    if (employeeEditor?.type === "payment" && employeeEditor.order.paymentStatus === "PAID") return t("common.edit");
    return t("common.save");
  }

  function selectedEditorEmployeeId() {
    if (!employeeEditor) return "";
    if (employeeEditor.type === "payment") return selectedPaymentEmployeeId(employeeEditor.order.id);
    if (employeeEditor.type === "deliver") return selectedDeliveryEmployeeId(employeeEditor.order.id);
    return selectedGeideaEmployeeId(employeeEditor.order.id);
  }

  function selectEditorEmployee(employeeId) {
    if (!employeeEditor) return;
    if (employeeEditor.type === "payment") {
      selectPaymentEmployee(employeeEditor.order.id, employeeId);
    } else if (employeeEditor.type === "deliver") {
      selectDeliveryEmployee(employeeEditor.order.id, employeeId);
    } else {
      selectGeideaEmployee(employeeEditor.order.id, employeeId);
    }
  }

  function saveEditorAction() {
    if (employeeEditor.type === "payment") return pay(employeeEditor.order.id, employeeEditor.method || employeeEditor.order.paymentMethod || "CASH", !employeeEditor.order.paymentStatus || employeeEditor.order.paymentStatus !== "PAID");
    if (employeeEditor.type === "deliver") return deliver(employeeEditor.order.id);
    return registerGeidea(employeeEditor.order.id);
  }

  function openEmployeeAction(order, type, method) {
    if (type === "payment" && order.kitchenStatus !== "DELIVERED") {
      toast(t("kitchen.deliverBeforePayment"), "error");
      return;
    }
    if (linkedRestaurantEmployeeId) {
      if (type === "payment") {
        pay(order.id, method || order.paymentMethod || "CASH", !order.paymentStatus || order.paymentStatus !== "PAID");
      } else if (type === "deliver") {
        deliver(order.id, linkedRestaurantEmployeeId);
      } else {
        registerGeidea(order.id);
      }
      return;
    }
    setEmployeeEditor({ order, type, method });
  }

  async function registerGeidea(orderId) {
    const geideaEmployeeId = selectedGeideaEmployeeId(orderId);

    if (!geideaEmployeeId) {
      toast(t("kitchen.restaurantEmployeeRequired"), "error");
      return;
    }

    const res = await fetch(`/api/orders/${orderUrlId(orderId)}/geidea`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geideaEmployeeId }),
    });
    const data = await res.json();

    if (!data.success) {
      toast(data.error || t("kitchen.archiveFailed"), "error");
      return;
    }

    showUiToast("geideaSaved");
    setEmployeeEditor(null);
    await refreshOrderFallback(data);
  }

  async function archiveOrder(orderId) {
    const res = await fetch(`/api/orders/${orderUrlId(orderId)}/archive`, { method: "POST" });
    const data = await res.json();

    if (!data.success) {
      toast(data.error || t("kitchen.archiveFailed"), "error");
      return;
    }

    showUiToast("orderArchived");
    await refreshOrderFallback(data);
  }

  return (
    <>
    <section className="panel">
      <div className="tabs order-tabs orders-top-tabs">
        <button className={!showArchive ? "active" : ""} onClick={() => setShowArchive(false)}>{t("common.active")}</button>
        <button className={showArchive ? "active" : ""} onClick={() => setShowArchive(true)}>{t("common.archive")}</button>
      </div>
      <div className="row">
        <h2>{showArchive ? t("common.archive") : t("kitchen.orders")}</h2>
      </div>
      <div className="orders-layout">
        <aside className="orders-sidebar">
          <div className="orders-sidebar-metrics">
            <Metric label={t("common.visibleOrders")} value={formatNumber(visibleOrders.length)} />
            <Metric label={t("common.unpaid")} value={formatNumber(unpaidCount)} />
            <Metric label={t("manager.notRegisteredGeidea")} value={formatNumber(unregisteredCount)} />
            <Metric label={showArchive ? t("common.archived") : t("common.active")} value={formatNumber(kitchenOrders.length)} />
          </div>
          <div className="form-grid cashier-order-search">
            <input value={ordersQuery} onChange={(event) => setOrdersQuery(event.target.value)} placeholder={t("cashier.searchOrdersPlaceholder")} />
            <button className="secondary" onClick={() => setOrdersQuery("")}>{t("common.clearFilters")}</button>
          </div>
        </aside>
        <div className="orders-content">
          <div className="grid three honey-grid">
            {renderedOrders.map((order) => {
              const canPrintKitchenTicket = hasKitchenTicketItems(order);
              const preparationDisabled = !canPrintKitchenTicket || Boolean(order.kitchenPrintJob) || order.kitchenStatus === "DELIVERED";
              const preparationTitle = !canPrintKitchenTicket
                ? t("kitchen.noKitchenTicketItems")
                : order.kitchenStatus === "DELIVERED"
                  ? t("common.delivered")
                  : order.kitchenPrintJob
                    ? formatUiMessage(uiMessages.printJobPending)
                    : "";

              return (
              <div className={`card order-cell ${orderAlertClass(order)}`} key={order.id}>
            <div className="row order-head">
              <b>{order.id}</b>
              <span className={`badge ${order.paymentStatus === "PAID" ? "paid" : "unpaid"}`}>{labelStatus(order.paymentStatus)}</span>
            </div>
            <div className="order-info">
              <div className="meta-line"><span>{t("common.date")}</span><b>{formatDateTime(order.createdAt)}</b></div>
              <div className="meta-line"><span>{t("common.bracelet")}</span><b>{order.braceletNo}</b></div>
              {order.customerPhone && <div className="meta-line"><span>{t("common.phone")}</span><b>{order.customerPhone}</b></div>}
              <div className="meta-line"><span>{t("common.children")}</span><b>{order.childNames}</b></div>
              <div className="meta-line"><span>{t("common.status")}</span><b className={`meta-value ${orderStageClass(order)}`}>{labelOrderStage(order)}</b></div>
              {order.paymentStatus !== "PAID" && <div className="meta-line"><span>{t("common.paymentMethod")}</span><b className={`meta-value ${order.paymentMethod === "VISA" ? "meta-visa" : "meta-cash"}`}>{labelMethod(order.paymentMethod)}</b></div>}
              {order.paymentEmployee && <div className="meta-line"><span>{t("common.paymentEmployee")}</span><b className={`meta-value meta-payment-employee ${employeeGenderClass(order.paymentEmployee)}`}>{order.paymentEmployee}</b></div>}
            </div>
            <OrderItemsSummary order={order} t={t} currency={currency} />
            <div className="order-alerts">
              <OrderAlerts
                order={order}
                uiMessages={uiMessages}
                formatDateTime={formatDateTime}
                labelMethod={labelMethod}
                actionLabels={{ delivered: t("common.delivered"), geidea: "تسجيل جيديا", exit: "خروج", archive: "أرشفة", closed: t("common.closed") }}
                showArchive={showArchive}
              />
              {order.kitchenPrintJob && order.kitchenStatus !== "DELIVERED" && (
                <div
                  className={`print-job-alert print-job-${String(order.kitchenPrintJob.status).toLowerCase()}`}
                  style={uiMessageStyle(
                    order.kitchenPrintJob.status === "PENDING"
                      ? uiMessages.printJobPending
                      : order.kitchenPrintJob.status === "PRINTED"
                        ? uiMessages.printJobPrinted
                        : uiMessages.printJobFailed
                  )}
                >
                  {formatUiMessage(
                    order.kitchenPrintJob.status === "PENDING"
                      ? uiMessages.printJobPending
                      : order.kitchenPrintJob.status === "PRINTED"
                        ? uiMessages.printJobPrinted
                        : uiMessages.printJobFailed
                  )}
                </div>
              )}
            </div>
            {!showArchive && (
              <div className="actions kitchen-action-groups">
                <button
                  className="btn-start-prep"
                  disabled={preparationDisabled}
                  title={preparationTitle}
                  onClick={() => startPreparation(order.id)}
                >
                  {t("kitchen.startPreparation")}
                </button>
                <button className="btn-deliver" disabled={order.kitchenStatus === "DELIVERED"} onClick={() => openEmployeeAction(order, "deliver")}>{t("kitchen.markDelivered")}</button>
                {order.paymentStatus === "PAID" ? (
                  <button
                    className={paymentButtonClass(order, order.paymentMethod, order.paymentMethod === "VISA" ? "btn-pay-visa" : "btn-pay-cash")}
                    onClick={() => openEmployeeAction(order, "payment", order.paymentMethod)}
                  >
                    {paidPaymentLabel(order)}
                  </button>
                ) : (
                  <>
                    <button
                      className={paymentButtonClass(order, "CASH", "btn-pay-cash")}
                      disabled={order.kitchenStatus !== "DELIVERED"}
                      title={order.kitchenStatus !== "DELIVERED" ? t("kitchen.deliverBeforePayment") : ""}
                      onClick={() => openEmployeeAction(order, "payment", "CASH")}
                    >
                      {t("common.cash")}
                    </button>
                    <button
                      className={paymentButtonClass(order, "VISA", "btn-pay-visa")}
                      disabled={order.kitchenStatus !== "DELIVERED"}
                      title={order.kitchenStatus !== "DELIVERED" ? t("kitchen.deliverBeforePayment") : ""}
                      onClick={() => openEmployeeAction(order, "payment", "VISA")}
                    >
                      {t("common.visa")}
                    </button>
                  </>
                )}
                {!order.geideaRegisteredAt && (
                  <button
                    className="btn-system"
                    disabled={order.kitchenStatus !== "DELIVERED" || order.paymentStatus !== "PAID"}
                    onClick={() => openEmployeeAction(order, "geidea")}
                  >
                    {t("kitchen.registerSystem")}
                  </button>
                )}
                {order.geideaRegisteredAt && order.customerLeft && !order.archivedAt && (
                  <button className="btn-print" onClick={() => archiveOrder(order.id)}>{t("kitchen.archiveOrder")}</button>
                )}
              </div>
            )}
              </div>
              );
            })}
          </div>
          {renderedOrders.length < visibleOrders.length && (
            <div className="load-more-row">
              <button className="secondary" onClick={() => setOrderRenderLimit((current) => current + 30)}>
                {t("common.showMore")} · {formatNumber(visibleOrders.length - renderedOrders.length)}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
    {employeeEditor && (
      <div className="modal-backdrop" onClick={() => setEmployeeEditor(null)}>
        <div className="detail-modal employee-edit-modal" role="dialog" aria-modal="true" aria-label={employeeEditorTitle()} onClick={(event) => event.stopPropagation()}>
          <div className="modal-head">
            <div>
              <h2>{employeeEditorTitle()}</h2>
              <div className="muted">{employeeEditor.order.id}</div>
            </div>
            <button className="secondary" onClick={() => setEmployeeEditor(null)}>{t("common.cancel")}</button>
          </div>
          <div className="stack">
            {employeeEditor.type === "payment" && employeeEditor.order.paymentStatus === "PAID" && (
              <div className="meta-line exit-employee-line"><span>{t("common.paymentEmployee")}</span><b className={employeeGenderClass(selectedEditorEmployeeName())}>{selectedEditorEmployeeName()}</b></div>
            )}
            <select
              aria-label={employeeEditorTitle()}
              className={`employee-select-line modal-select ${employeeGenderClass(selectedEditorEmployeeName())}`}
              value={selectedEditorEmployeeId()}
              disabled={restaurantEmployees.length === 0}
              onChange={(event) => selectEditorEmployee(event.target.value)}
            >
              {restaurantEmployees.length === 0 ? (
                <option value="">{t("kitchen.noRestaurantEmployees")}</option>
              ) : (
                <>
                  <option value="">{employeeEditorTitle()}</option>
                  {restaurantEmployees.map((employee) => (
                    <option className={employeeGenderClass(employee.name)} key={employee.id} value={employee.id}>{employee.name}</option>
                  ))}
                </>
              )}
            </select>
            <div className="actions">
              <button
                className="btn-confirm"
                disabled={!selectedEditorEmployeeId()}
                onClick={saveEditorAction}
              >
                {editorSaveLabel()}
              </button>
              <button className="danger" onClick={() => setEmployeeEditor(null)}>{t("common.cancel")}</button>
            </div>
          </div>
        </div>
      </div>
    )}
    {printFrameUrl && (
      <iframe
        className="print-frame"
        src={printFrameUrl}
        title="Kitchen ticket print"
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
