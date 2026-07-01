"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../ToastProvider";
import { useI18n } from "../i18n";
import { employeeGenderClass } from "../employeeDisplay";

export default function CashierClient() {
  const toast = useToast();
  const { t, formatNumber, currency, labelCategory, labelMethod, labelOrderStage, labelStatus, formatDateTime } = useI18n();
  const fallbackImage = "/products/fallback.jpg";
  const formRef = useRef(null);
  const ordersRef = useRef(null);
  const [products, setProducts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [braceletNo, setBraceletNo] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [childCount, setChildCount] = useState(1);
  const [childNames, setChildNames] = useState([""]);
  const [dataEmployeeId, setDataEmployeeId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [message, setMessage] = useState("");
  const [editingOrder, setEditingOrder] = useState(null);
  const [cashierView, setCashierView] = useState("orders");
  const [showArchived, setShowArchived] = useState(false);
  const [ordersQuery, setOrdersQuery] = useState("");
  const [exitEmployeeByOrder, setExitEmployeeByOrder] = useState({});
  const [defaultExitEmployeeId, setDefaultExitEmployeeId] = useState("");
  const [employeeEditor, setEmployeeEditor] = useState(null);
  const [entryPassword, setEntryPassword] = useState("");

  useEffect(() => {
    load(showArchived);
  }, [showArchived]);

  async function load(archived = showArchived) {
    const [productsRes, employeesRes, ordersRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/employees"),
      fetch(`/api/orders?archived=${archived}`),
    ]);
    const [productsData, employeesData, ordersData] = await Promise.all([
      productsRes.json(),
      employeesRes.json(),
      ordersRes.json(),
    ]);
    setProducts(productsData);
    setEmployees(employeesData);
    setOrders(ordersData);
    setExitEmployeeByOrder((current) => {
      const next = { ...current };
      ordersData.forEach((order) => {
        if (!next[order.id] && order.exitEmployeeId) next[order.id] = order.exitEmployeeId;
      });
      return next;
    });

    const lastEmployee = localStorage.getItem("lastDataEmployeeId");
    setDataEmployeeId(lastEmployee || employeesData[0]?.id || "");

    const operationEmployees = employeesData.filter((employee) => employee.department === "OPERATION");
    const lastExitEmployee = localStorage.getItem("lastExitEmployeeId") || "";
    setDefaultExitEmployeeId(
      operationEmployees.some((employee) => employee.id === lastExitEmployee)
        ? lastExitEmployee
        : operationEmployees[0]?.id || ""
    );
  }

  const categories = useMemo(() => ["All", ...new Set(products.map((product) => product.categoryName))], [products]);
  const operationEmployees = useMemo(() => employees.filter((employee) => employee.department === "OPERATION"), [employees]);
  const [category, setCategory] = useState("All");
  const visibleProducts = products.filter((product) => category === "All" || product.categoryName === category);
  const visibleOrders = useMemo(() => {
    const search = ordersQuery.trim().toLowerCase();
    if (!search) return orders;

    return orders.filter((order) => [
      order.braceletNo,
      order.customerPhone,
      order.childNames,
    ].some((value) => String(value || "").toLowerCase().includes(search)));
  }, [orders, ordersQuery]);
  const unpaidCount = orders.filter((order) => order.paymentStatus !== "PAID").length;
  const unregisteredCount = orders.filter((order) => !order.geideaRegisteredAt).length;
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const orderTotalPreview = editingOrder ? Number(editingOrder.total || 0) + total : total;

  function orderAlertClass(order) {
    if (order.archivedAt) return "archived-order";
    if (!order.customerLeft || order.archivedAt) return "";
    if (order.paymentStatus !== "PAID") return "left-unpaid";
    return order.geideaRegisteredAt ? "" : "needs-system";
  }

  function orderUrlId(orderId) {
    return encodeURIComponent(orderId);
  }

  function selectedExitEmployeeId(orderId) {
    return exitEmployeeByOrder[orderId] || defaultExitEmployeeId;
  }

  function selectExitEmployee(orderId, employeeId) {
    setExitEmployeeByOrder((current) => ({ ...current, [orderId]: employeeId }));
    localStorage.setItem("lastExitEmployeeId", employeeId);
  }

  function exitEmployeeName(order) {
    if (order.exitEmployee) return order.exitEmployee;
    const selectedId = selectedExitEmployeeId(order.id);
    return operationEmployees.find((employee) => employee.id === selectedId)?.name || "";
  }

  function orderStageClass(order) {
    if (order.geideaRegisteredAt) return "meta-system";
    if (order.paymentStatus === "PAID") return order.paymentMethod === "VISA" ? "meta-visa" : "meta-cash";
    if (order.kitchenStatus === "DELIVERED") return "meta-delivered";
    return "meta-pending";
  }

  function scrollToSection(ref) {
    setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function showOrders(archived = showArchived) {
    setShowArchived(archived);
    setCashierView("orders");
    window.history.replaceState(null, "", "#orders");
    scrollToSection(ordersRef);
  }

  function showOrdersTab(archived) {
    setShowArchived(archived);
    setCashierView("orders");
    window.history.replaceState(null, "", archived ? "#archived-orders" : "#orders");
    scrollToSection(ordersRef);
  }

  function showNewOrder() {
    setEditingOrder(null);
    setShowArchived(false);
    setMessage("");
    setBraceletNo("");
    setCustomerPhone("");
    setChildNames([""]);
    setChildren(1);
    setPaymentMethod("CASH");
    setCart([]);
    setCashierView("form");
    window.history.replaceState(null, "", "#new-order");
    scrollToSection(formRef);
  }

  function setChildren(count) {
    setChildCount(count);
    setChildNames((current) => Array.from({ length: count }, (_, index) => current[index] || ""));
  }

  function addToCart(product) {
    setCart((current) => {
      const existing = current.find((item) => item.productId === product.id);
      if (existing) {
        return current.map((item) => item.productId === product.id ? { ...item, qty: item.qty + 1 } : item);
      }
      return [...current, { productId: product.id, name: product.name, price: product.price, qty: 1 }];
    });
  }

  function cartQuantity(productId) {
    return cart.find((item) => item.productId === productId)?.qty || 0;
  }

  function changeQty(productId, change) {
    setCart((current) => current
      .map((item) => item.productId === productId ? { ...item, qty: item.qty + change } : item)
      .filter((item) => item.qty > 0));
  }

  function setCartQty(product, qty) {
    const nextQty = Math.max(0, Number(qty) || 0);
    const productId = product.id || product.productId;
    setCart((current) => {
      const existing = current.find((item) => item.productId === productId);
      if (!existing && nextQty <= 0) return current;
      if (!existing) return [...current, { productId, name: product.name, price: product.price, qty: nextQty }];
      return current
        .map((item) => item.productId === productId ? { ...item, qty: nextQty } : item)
        .filter((item) => item.qty > 0);
    });
  }

  function splitChildNames(order) {
    const names = String(order.childNames || "")
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);
    return names.length ? names : [""];
  }

  function startEdit(order) {
    const names = splitChildNames(order);
    setEditingOrder(order);
    setCashierView("form");
    setBraceletNo(order.braceletNo || "");
    setCustomerPhone(order.customerPhone || "");
    setChildCount(names.length);
    setChildNames(names);
    setCart([]);
    setMessage("");
    window.history.replaceState(null, "", "#edit-order");
    scrollToSection(formRef);
  }

  function cancelEdit() {
    setEditingOrder(null);
    setCart([]);
    setMessage("");
    showOrders(false);
  }

  async function saveOrder() {
    setMessage("");
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        braceletNo,
        customerPhone,
        childNames,
        dataEmployeeId,
        paymentMethod,
        items: cart,
      }),
    });
    const data = await res.json();

    if (!data.success) {
      setMessage(data.error || t("cashier.saveFailed"));
      toast(data.error || t("cashier.saveFailed"), "error");
      return;
    }

    toast(t("cashier.saved", { id: data.order.id }));
    localStorage.setItem("lastDataEmployeeId", dataEmployeeId);
    setEditingOrder(null);
    setBraceletNo("");
    setCustomerPhone("");
    setChildNames([""]);
    setChildren(1);
    setPaymentMethod("CASH");
    setCart([]);
    await load(false);
    showOrders(false);
  }

  async function saveCart() {
    if (!editingOrder) {
      await saveOrder();
      return;
    }

    setMessage("");
    const detailsRes = await fetch(`/api/orders/${orderUrlId(editingOrder.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        braceletNo,
        customerPhone,
        childNames,
      }),
    });
    const detailsData = await detailsRes.json();

    if (!detailsData.success) {
      setMessage(detailsData.error || t("cashier.updateFailed"));
      toast(detailsData.error || t("cashier.updateFailed"), "error");
      return;
    }

    if (cart.length) {
      const res = await fetch(`/api/orders/${orderUrlId(editingOrder.id)}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart }),
      });
      const data = await res.json();

      if (!data.success) {
        setMessage(data.error || t("cashier.updateFailed"));
        toast(data.error || t("cashier.updateFailed"), "error");
        return;
      }
    }

    toast(cart.length ? t("cashier.orderUpdatedWithItems") : t("cashier.orderUpdated"));
    setEditingOrder(null);
    setBraceletNo("");
    setCustomerPhone("");
    setChildNames([""]);
    setChildren(1);
    setCart([]);
    await load(showArchived);
    showOrders();
  }

  async function markCustomerLeft(orderId) {
    const exitEmployeeId = selectedExitEmployeeId(orderId);

    if (!exitEmployeeId) {
      toast(t("cashier.exitEmployeeRequired"), "error");
      return;
    }

    const res = await fetch(`/api/orders/${orderUrlId(orderId)}/left`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exitEmployeeId }),
    });
    const data = await res.json();

    if (!data.success) {
      toast(data.error || t("manager.orderUpdateFailed"), "error");
      return;
    }

    toast(t("cashier.leftToast"), "info");
    localStorage.setItem("lastExitEmployeeId", exitEmployeeId);
    setEmployeeEditor(null);
    await load(showArchived);
  }

  async function markCustomerPresent(orderId) {
    const res = await fetch(`/api/orders/${orderUrlId(orderId)}/left`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerLeft: false, managerPassword: entryPassword }),
    });
    const data = await res.json();

    if (!data.success) {
      toast(data.error || t("manager.orderUpdateFailed"), "error");
      return;
    }

    toast(t("cashier.presentToast"), "info");
    setEntryPassword("");
    setEmployeeEditor(null);
    await load(showArchived);
  }

  function openExitFlow(order) {
    setEntryPassword("");
    setEmployeeEditor(order);
  }

  function renderCart(className = "") {
    return (
      <div className={`cart-panel ${className}`}>
        <h3>{t("cashier.cart")}</h3>
        {cart.length === 0 ? <div className="muted">{t("cashier.noItemsSelected")}</div> : cart.map((item) => (
          <div className="row cart-item-row" key={item.productId}>
            <span>{item.name}</span>
            <span className="actions cart-qty-actions">
              <button className="secondary qty-button" onClick={() => changeQty(item.productId, -1)}>-</button>
              <input
                className="qty-input"
                type="number"
                min="0"
                value={item.qty}
                onChange={(event) => setCartQty(item, event.target.value)}
                aria-label={`${item.name} quantity`}
              />
              <button className="btn-confirm qty-button" onClick={() => changeQty(item.productId, 1)}>+</button>
              <b>{currency(item.price * item.qty)}</b>
            </span>
          </div>
        ))}
        <div className="row order-total-row"><span>{editingOrder ? t("cashier.newItemsTotal") : t("common.orderTotal")}</span><b>{currency(total)}</b></div>
        {editingOrder && <div className="row order-total-row"><span>{t("cashier.totalAfterAdd")}</span><b>{currency(orderTotalPreview)}</b></div>}
        <div className="actions">
          <button className="btn-confirm" onClick={saveCart}>{editingOrder ? t("cashier.saveChanges") : t("cashier.saveOrder")}</button>
          <button className="secondary" onClick={() => setCart([])}>{t("cashier.clearCart")}</button>
          {!editingOrder && <button className="danger" onClick={() => showOrders(false)}>{t("cashier.backToOrders")}</button>}
          {editingOrder && <button className="danger" onClick={cancelEdit}>{t("cashier.cancel")}</button>}
        </div>
        <div className="message">{message}</div>
      </div>
    );
  }

  return (
    <>
      <section className="cashier-command">
        <button className="hex-action" onClick={showNewOrder}>
          <span className="hex-plus">+</span>
          <span>{t("cashier.addNewOrder")}</span>
        </button>
        <div className="command-copy">
          <h2>{showArchived ? t("common.archivedOrders") : t("common.currentOrders")}</h2>
          <div className="muted">{showArchived ? t("cashier.archivedCount", { count: orders.length }) : t("cashier.currentCount", { count: orders.length })}</div>
        </div>
      </section>

      {(cashierView === "form" || editingOrder) && (
      <section className="panel stack new-order-panel" id="new-order" ref={formRef}>
        <h2>{editingOrder ? t("cashier.editOrder") : t("cashier.addNewOrder")}</h2>
        <div className="new-order-layout">
          <div className="new-order-details">
        {editingOrder ? (
          <div className="summary edit-order-summary">
            <div className="meta-line"><span>{t("common.order")}</span><b>{editingOrder.id}</b></div>
            <div className="form-grid new-order-fields">
              <input value={braceletNo} onChange={(event) => setBraceletNo(event.target.value)} placeholder={t("cashier.braceletPlaceholder")} />
              <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder={t("cashier.phonePlaceholder")} />
              <select value={childCount} onChange={(event) => setChildren(Number(event.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{t("cashier.childCount", { count })}</option>)}
              </select>
            </div>
            <div className="form-grid child-fields">
              {childNames.map((name, index) => (
                <input
                  key={index}
                  value={name}
                  onChange={(event) => setChildNames((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                  placeholder={t("cashier.childName", { count: index + 1 })}
                />
              ))}
            </div>
            <div className="panel existing-order-items">
              {editingOrder.items.map((item) => (
                <div className="row" key={item.id}><span>{item.name} x {item.qty}</span><b>{currency(item.total)}</b></div>
              ))}
              <div className="row order-total-row"><span>{t("common.orderTotal")}</span><b>{currency(editingOrder.total)}</b></div>
            </div>
          </div>
        ) : (
          <>
            <div className="form-grid new-order-fields">
              <input value={braceletNo} onChange={(event) => setBraceletNo(event.target.value)} placeholder={t("cashier.braceletPlaceholder")} />
              <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder={t("cashier.phonePlaceholder")} />
              <div className="payment-radios" role="radiogroup" aria-label={t("common.paymentMethod")}>
                {[
                  { value: "CASH", label: t("common.cash"), tone: "cash" },
                  { value: "VISA", label: t("common.visa"), tone: "visa" },
                ].map((method) => (
                  <label className={`payment-option ${method.tone} ${paymentMethod === method.value ? "active" : ""}`} key={method.value}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={method.value}
                      checked={paymentMethod === method.value}
                      onChange={() => setPaymentMethod(method.value)}
                    />
                    <span>{method.label}</span>
                  </label>
                ))}
              </div>
              <select value={childCount} onChange={(event) => setChildren(Number(event.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{t("cashier.childCount", { count })}</option>)}
              </select>
              <select value={dataEmployeeId} onChange={(event) => setDataEmployeeId(event.target.value)}>
                <option value="">{t("common.employee")}</option>
                {employees.map((employee) => <option className={employeeGenderClass(employee.name)} key={employee.id} value={employee.id}>{employee.name}</option>)}
              </select>
            </div>
            <div className="form-grid child-fields">
              {childNames.map((name, index) => (
                <input
                  key={index}
                  value={name}
                  onChange={(event) => setChildNames((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                  placeholder={t("cashier.childName", { count: index + 1 })}
                />
              ))}
            </div>
          </>
        )}
          </div>
          <div className="new-order-products">
        <div className="tabs">
          {categories.map((item) => (
            <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{labelCategory(item)}</button>
          ))}
        </div>
        <div className="products">
          {visibleProducts.map((product) => {
            const qty = cartQuantity(product.id);
            return (
              <div className={`card product ${qty ? "in-cart" : ""}`} key={product.id}>
                <button className="product-main" onClick={() => addToCart(product)}>
                  <img
                    src={product.imageUrl || fallbackImage}
                    alt={product.name}
                    onError={(event) => { event.currentTarget.src = fallbackImage; }}
                  />
                  <div className="product-name">{product.name}</div>
                </button>
                <div className="product-body">
                  <div className="product-qty-actions">
                    <button className="secondary qty-button" onClick={() => changeQty(product.id, -1)} disabled={!qty}>-</button>
                    <input
                      className="qty-input"
                      type="number"
                      min="0"
                      value={qty}
                      onChange={(event) => setCartQty(product, event.target.value)}
                      aria-label={`${product.name} quantity`}
                    />
                    <button className="btn-confirm qty-button" onClick={() => addToCart(product)}>+</button>
                  </div>
                  <div className="product-price">{currency(product.price)}</div>
                </div>
              </div>
            );
          })}
        </div>
          </div>
          {renderCart("order-cart")}
        </div>
      </section>
      )}

      <section className="panel" id="orders" ref={ordersRef}>
        <div className="row">
          <h2>{showArchived ? t("common.archivedOrders") : t("common.currentOrders")}</h2>
          <div className="tabs order-tabs">
            <button className={!showArchived ? "active" : ""} onClick={() => showOrdersTab(false)}>{t("common.currentOrders")}</button>
            <button className={showArchived ? "active" : ""} onClick={() => showOrdersTab(true)}>{t("common.archivedOrders")}</button>
          </div>
        </div>
        <div className="grid four top-summary">
          <Metric label={t("common.visibleOrders")} value={formatNumber(visibleOrders.length)} />
          <Metric label={t("common.unpaid")} value={formatNumber(unpaidCount)} />
          <Metric label={t("manager.notRegisteredGeidea")} value={formatNumber(unregisteredCount)} />
          <Metric label={showArchived ? t("common.archived") : t("common.active")} value={formatNumber(orders.length)} />
        </div>
        <div className="form-grid cashier-order-search">
          <input
            value={ordersQuery}
            onChange={(event) => setOrdersQuery(event.target.value)}
            placeholder={t("cashier.searchOrdersPlaceholder")}
          />
          <button className="secondary" onClick={() => setOrdersQuery("")}>{t("common.clearFilters")}</button>
        </div>
        <div className="grid three honey-grid">
          {visibleOrders.map((order) => (
            <div className={`card order-cell ${orderAlertClass(order)}`} key={order.id}>
              <div className="row order-head"><b>{order.id}</b><span className={`badge ${order.paymentStatus === "PAID" ? "paid" : "unpaid"}`}>{labelStatus(order.paymentStatus)}</span></div>
              <div className="order-info">
                <div className="meta-line"><span>{t("common.bracelet")}</span><b>{order.braceletNo}</b></div>
                {order.customerPhone && <div className="meta-line"><span>{t("common.phone")}</span><b>{order.customerPhone}</b></div>}
                <div className="meta-line"><span>{t("common.children")}</span><b>{order.childNames}</b></div>
                <div className="meta-line"><span>{t("common.cashier")}</span><b className="meta-value meta-user">{order.cashier || "-"}</b></div>
                <div className="meta-line"><span>{t("common.employee")}</span><b className={`meta-value meta-data-employee ${employeeGenderClass(order.dataEmployee)}`}>{order.dataEmployee || "-"}</b></div>
                <div className="meta-line"><span>{t("common.status")}</span><b className={`meta-value ${orderStageClass(order)}`}>{labelOrderStage(order)}</b></div>
                {order.paymentStatus !== "PAID" && <div className="meta-line"><span>{t("common.paymentMethod")}</span><b className={`meta-value ${order.paymentMethod === "VISA" ? "meta-visa" : "meta-cash"}`}>{labelMethod(order.paymentMethod)}</b></div>}
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
                {order.customerLeft && order.paymentStatus !== "PAID" && <div className="warning">{t("alert.leftUnpaid")}</div>}
                {order.customerLeft && order.paymentStatus === "PAID" && !order.geideaRegisteredAt && <div className="warning warning-orange">{t("alert.leftNeedsSystem")}</div>}
                {order.geideaRegisteredAt && (
                  <div className="geidea-alert-line">
                    <span>{t("common.geideaRegisteredBy")}</span>
                    <b><span className={employeeGenderClass(order.geideaEmployee)}>{order.geideaEmployee || "-"}</span> · {formatDateTime(order.geideaRegisteredAt)}</b>
                  </div>
                )}
                {showArchived && <div className="archive-alert-line">{t("common.archivedAt")}: {formatDateTime(order.archivedAt)}</div>}
                {!showArchived && order.customerLeft && (
                  <div className="meta-line exit-employee-line"><span>{t("common.exitEmployee")}</span><b className={employeeGenderClass(exitEmployeeName(order))}>{exitEmployeeName(order) || "-"}</b></div>
                )}
              </div>
              {!showArchived && (
                  <div className="actions">
                    <button
                      className="btn-order-edit"
                      disabled={order.customerLeft || order.paymentStatus === "PAID"}
                      onClick={() => startEdit(order)}
                    >
                      {t("common.edit")}
                    </button>
                    <button
                      className={order.customerLeft ? "btn-confirm" : "btn-exit"}
                      onClick={() => openExitFlow(order)}
                    >
                      {order.customerLeft ? t("cashier.customerEnter") : t("cashier.customerLeft")}
                    </button>
                  </div>
              )}
            </div>
          ))}
        </div>
      </section>
      {employeeEditor && (
        <div className="modal-backdrop" onClick={() => setEmployeeEditor(null)}>
          <div className="detail-modal employee-edit-modal" role="dialog" aria-modal="true" aria-label={t("cashier.editExitEmployee")} onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{employeeEditor.customerLeft ? t("cashier.customerEnter") : t("cashier.customerLeft")}</h2>
                <div className="muted">{employeeEditor.id}</div>
              </div>
              <button className="secondary" onClick={() => setEmployeeEditor(null)}>{t("common.cancel")}</button>
            </div>
            <div className="stack">
              {employeeEditor.customerLeft ? (
                <input
                  value={entryPassword}
                  onChange={(event) => setEntryPassword(event.target.value)}
                  placeholder={t("cashier.managerPasswordPrompt")}
                  type="password"
                  name="cashier-manager-action-code"
                  inputMode="numeric"
                  autoComplete="new-password"
                  autoCorrect="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                />
              ) : (
                <select
                  className="employee-select-line modal-select"
                  value={selectedExitEmployeeId(employeeEditor.id)}
                  disabled={operationEmployees.length === 0}
                  onChange={(event) => selectExitEmployee(employeeEditor.id, event.target.value)}
                >
                  {operationEmployees.length === 0 ? (
                    <option value="">{t("common.noData")}</option>
                  ) : (
                    <>
                      <option value="">{t("cashier.selectExitEmployee")}</option>
                      {operationEmployees.map((employee) => (
                        <option className={employeeGenderClass(employee.name)} key={employee.id} value={employee.id}>{employee.name}</option>
                      ))}
                    </>
                  )}
                </select>
              )}
              <div className="actions">
                {employeeEditor.customerLeft ? (
                  <button className="btn-confirm" disabled={!entryPassword} onClick={() => markCustomerPresent(employeeEditor.id)}>{t("cashier.customerEnter")}</button>
                ) : (
                  <button className="btn-exit" disabled={!selectedExitEmployeeId(employeeEditor.id)} onClick={() => markCustomerLeft(employeeEditor.id)}>{t("cashier.customerLeft")}</button>
                )}
                <button className="danger" onClick={() => setEmployeeEditor(null)}>{t("common.cancel")}</button>
              </div>
            </div>
          </div>
        </div>
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
