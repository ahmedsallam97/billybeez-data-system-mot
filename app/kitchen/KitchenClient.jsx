"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "../ToastProvider";
import { useI18n } from "../i18n";
import { applyEmployeeNameStyles, employeeGenderClass } from "../employeeDisplay";
import { formatUiMessage, normalizeUiMessages, uiMessageStyle } from "../uiMessages";

export default function KitchenClient({ user }) {
  const toast = useToast();
  const { t, formatNumber, currency, labelMethod, labelOrderStage, labelStatus, formatDateTime } = useI18n();
  const [orders, setOrders] = useState([]);
  const [showArchive, setShowArchive] = useState(false);
  const [ordersQuery, setOrdersQuery] = useState("");
  const [restaurantEmployees, setRestaurantEmployees] = useState([]);
  const [geideaEmployeeByOrder, setGeideaEmployeeByOrder] = useState({});
  const [paymentEmployeeByOrder, setPaymentEmployeeByOrder] = useState({});
  const [defaultRestaurantEmployeeId, setDefaultRestaurantEmployeeId] = useState("");
  const [defaultPaymentEmployeeId, setDefaultPaymentEmployeeId] = useState("");
  const [employeeEditor, setEmployeeEditor] = useState(null);
  const [printFrameUrl, setPrintFrameUrl] = useState("");
  const [uiMessages, setUiMessages] = useState(normalizeUiMessages());
  const linkedRestaurantEmployeeId = user?.employee?.department === "RESTAURANT" ? user.employeeId : "";
  const linkedRestaurantEmployeeName = user?.employee?.department === "RESTAURANT" ? user.employee.name : "";

  function orderAlertClass(order) {
    if (order.archivedAt) return "archived-order";
    if (!order.customerLeft || order.archivedAt) return "";
    if (order.paymentStatus !== "PAID") return "left-unpaid";
    return order.geideaRegisteredAt ? "" : "needs-system";
  }

  function orderUrlId(orderId) {
    return encodeURIComponent(orderId);
  }

  function paymentButtonClass(order, method, baseClass) {
    return `${baseClass} ${order.paymentStatus === "PAID" && order.paymentMethod === method ? "payment-selected" : ""}`;
  }

  function paidPaymentLabel(order) {
    return order.paymentMethod === "VISA" ? t("kitchen.paidVisa") : t("kitchen.paidCash");
  }

  function orderStageClass(order) {
    if (order.geideaRegisteredAt) return "meta-system";
    if (order.paymentStatus === "PAID") return order.paymentMethod === "VISA" ? "meta-visa" : "meta-cash";
    if (order.kitchenStatus === "DELIVERED") return "meta-delivered";
    return "meta-pending";
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

  const unpaidCount = kitchenOrders.filter((order) => order.paymentStatus !== "PAID").length;
  const unregisteredCount = kitchenOrders.filter((order) => !order.geideaRegisteredAt).length;

  useEffect(() => {
    load();
    const timer = setInterval(load, 8000);
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
    setUiMessages(normalizeUiMessages(setting?.value));
    applyEmployeeNameStyles(employeeStyleSetting?.value);
  }

  async function load() {
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
    setGeideaEmployeeByOrder((current) => {
      const next = { ...current };
      ordersData.forEach((order) => {
        if (!next[order.id] && order.geideaEmployeeId) next[order.id] = order.geideaEmployeeId;
      });
      return next;
    });
  }

  async function loadRestaurantEmployees() {
    const res = await fetch("/api/employees?department=RESTAURANT");
    const employees = await res.json();
    setRestaurantEmployees(employees);

    const lastEmployeeId = localStorage.getItem("lastRestaurantEmployeeId") || "";
    if (linkedRestaurantEmployeeId) {
      setDefaultRestaurantEmployeeId(linkedRestaurantEmployeeId);
    } else if (employees.some((employee) => employee.id === lastEmployeeId)) {
      setDefaultRestaurantEmployeeId(lastEmployeeId);
    } else {
      setDefaultRestaurantEmployeeId("");
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

  function selectedGeideaEmployeeId(orderId) {
    return linkedRestaurantEmployeeId || geideaEmployeeByOrder[orderId] || defaultRestaurantEmployeeId;
  }

  function selectGeideaEmployee(orderId, employeeId) {
    setGeideaEmployeeByOrder((current) => ({ ...current, [orderId]: employeeId }));
    if (!linkedRestaurantEmployeeId) localStorage.setItem("lastRestaurantEmployeeId", employeeId);
  }

  async function deliver(orderId) {
    const res = await fetch(`/api/orders/${orderUrlId(orderId)}/deliver`, {
      method: "POST",
    });
    const data = await res.json();

    if (!data.success) {
      toast(data.error || t("kitchen.deliveryFailed"), "error");
      return;
    }

    toast(t("kitchen.deliveredToast"));
    await load();
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
    await load();
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
      await load();
    } else {
      toast(data.error || t("kitchen.paymentFailed"), "error");
    }
  }

  async function savePaymentEmployee(order) {
    await pay(order.id, order.paymentMethod || "CASH", false);
  }

  function employeeEditorTitle() {
    if (employeeEditor?.type === "payment") return t("kitchen.selectPaymentEmployee");
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
    return selectedGeideaEmployeeId(employeeEditor.order.id);
  }

  function selectEditorEmployee(employeeId) {
    if (!employeeEditor) return;
    if (employeeEditor.type === "payment") {
      selectPaymentEmployee(employeeEditor.order.id, employeeId);
    } else {
      selectGeideaEmployee(employeeEditor.order.id, employeeId);
    }
  }

  function saveEditorAction() {
    if (employeeEditor.type === "payment") return pay(employeeEditor.order.id, employeeEditor.method || employeeEditor.order.paymentMethod || "CASH", !employeeEditor.order.paymentStatus || employeeEditor.order.paymentStatus !== "PAID");
    return registerGeidea(employeeEditor.order.id);
  }

  function openEmployeeAction(order, type, method) {
    if (linkedRestaurantEmployeeId) {
      if (type === "payment") {
        pay(order.id, method || order.paymentMethod || "CASH", !order.paymentStatus || order.paymentStatus !== "PAID");
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

    toast(t("kitchen.registeredToast"));
    setEmployeeEditor(null);
    await load();
  }

  async function archiveOrder(orderId) {
    const res = await fetch(`/api/orders/${orderUrlId(orderId)}/archive`, { method: "POST" });
    const data = await res.json();

    if (!data.success) {
      toast(data.error || t("kitchen.archiveFailed"), "error");
      return;
    }

    toast(t("kitchen.archivedToast"));
    await load();
  }

  return (
    <>
    <section className="panel">
      <div className="row">
        <h2>{showArchive ? t("common.archive") : t("kitchen.orders")}</h2>
        <div className="actions">
          <button className={!showArchive ? "secondary" : ""} onClick={() => setShowArchive(false)}>{t("common.active")}</button>
          <button className={showArchive ? "secondary" : ""} onClick={() => setShowArchive(true)}>{t("common.archive")}</button>
        </div>
      </div>
      <div className="grid four top-summary">
        <Metric label={t("common.visibleOrders")} value={formatNumber(visibleOrders.length)} />
        <Metric label={t("common.unpaid")} value={formatNumber(unpaidCount)} />
        <Metric label={t("manager.notRegisteredGeidea")} value={formatNumber(unregisteredCount)} />
        <Metric label={showArchive ? t("common.archived") : t("common.active")} value={formatNumber(kitchenOrders.length)} />
      </div>
      <div className="form-grid manager-filter-grid">
        <input value={ordersQuery} onChange={(event) => setOrdersQuery(event.target.value)} placeholder={t("cashier.searchOrdersPlaceholder")} />
        <button className="secondary" onClick={() => setOrdersQuery("")}>{t("common.clearFilters")}</button>
      </div>
      <div className="grid three honey-grid">
        {visibleOrders.map((order) => (
          <div className={`card order-cell ${orderAlertClass(order)}`} key={order.id}>
            <div className="row order-head">
              <b>{order.id}</b>
              <span className={`badge ${order.paymentStatus === "PAID" ? "paid" : "unpaid"}`}>{labelStatus(order.paymentStatus)}</span>
            </div>
            <div className="order-info">
              <div className="meta-line"><span>{t("common.bracelet")}</span><b>{order.braceletNo}</b></div>
              {order.customerPhone && <div className="meta-line"><span>{t("common.phone")}</span><b>{order.customerPhone}</b></div>}
              <div className="meta-line"><span>{t("common.children")}</span><b>{order.childNames}</b></div>
              <div className="meta-line"><span>{t("common.status")}</span><b className={`meta-value ${orderStageClass(order)}`}>{labelOrderStage(order)}</b></div>
              {order.paymentStatus !== "PAID" && <div className="meta-line"><span>{t("common.paymentMethod")}</span><b className={`meta-value ${order.paymentMethod === "VISA" ? "meta-visa" : "meta-cash"}`}>{labelMethod(order.paymentMethod)}</b></div>}
              {order.paymentEmployee && <div className="meta-line"><span>{t("common.paymentEmployee")}</span><b className={`meta-value meta-payment-employee ${employeeGenderClass(order.paymentEmployee)}`}>{order.paymentEmployee}</b></div>}
            </div>
            <div className="summary">
              <div className="order-items">
                {order.items.length === 0 ? (
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
              {showArchive && (
                <div className="archive-alert-line" style={uiMessageStyle(uiMessages.archivedAt)}>
                  {formatUiMessage(uiMessages.archivedAt, { time: formatDateTime(order.archivedAt) })}
                </div>
              )}
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
              <div className="actions">
                <button
                  className="btn-start-prep"
                  disabled={Boolean(order.kitchenPrintJob)}
                  title={order.kitchenPrintJob ? formatUiMessage(uiMessages.printJobPending) : ""}
                  onClick={() => startPreparation(order.id)}
                >
                  {t("kitchen.startPreparation")}
                </button>
                <button className="btn-deliver" disabled={order.kitchenStatus === "DELIVERED"} onClick={() => deliver(order.id)}>{t("kitchen.markDelivered")}</button>
                {order.paymentStatus === "PAID" ? (
                  <button
                    className={paymentButtonClass(order, order.paymentMethod, order.paymentMethod === "VISA" ? "btn-pay-visa" : "btn-pay-cash")}
                    onClick={() => openEmployeeAction(order, "payment", order.paymentMethod)}
                  >
                    {paidPaymentLabel(order)}
                  </button>
                ) : (
                  <>
                    <button className={paymentButtonClass(order, "CASH", "btn-pay-cash")} onClick={() => openEmployeeAction(order, "payment", "CASH")}>
                      {t("common.cash")}
                    </button>
                    <button className={paymentButtonClass(order, "VISA", "btn-pay-visa")} onClick={() => openEmployeeAction(order, "payment", "VISA")}>
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
        ))}
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
