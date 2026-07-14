"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "../ToastProvider";
import { useI18n } from "../i18n";
import { employeeGenderClass } from "../employeeDisplay";
import { categoryAvailability, categoryToneClass, orderProductCategories, productAvailability, productCardVisual } from "../categoryRules";

const FRONT_DEVICE_STORAGE_KEY = "bbFrontDeviceId";
const cashierEmployeeNames = new Set(["مهرا سمير", "الاء نصار", "ألاء نصار", "محمد مدكور", "أحمد السيد"]);

function isRequiredCustomerPhone(value) {
  return /^01[012][0-9]{8}$/.test(String(value || "").trim());
}

function formatBirthDateForInput(value) {
  if (!value) return "";
  const text = String(value);
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) return text;
  const iso = text.slice(0, 10);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function birthDateInputToIso(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function childAgeLabel(value) {
  if (!value) return "";
  const iso = String(value).slice(0, 10);
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const birth = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (
    now.getUTCMonth() < birth.getUTCMonth()
    || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate())
  ) age -= 1;
  return age >= 0 ? `${age}` : "";
}

function productInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const source = parts.length > 1 ? parts.slice(0, 2) : parts;
  return source.map((part) => part[0]).join("").toUpperCase() || "?";
}

function shortBracelet(value) {
  const text = String(value || "").trim();
  return text.length > 6 ? text.slice(-6) : text;
}

function resolveStoredFrontDevice(frontDevices, currentDeviceId) {
  if (!frontDevices.length) return "";
  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get("deviceId");
  const requestedNo = params.get("device");
  const storedId = window.localStorage.getItem(FRONT_DEVICE_STORAGE_KEY);
  const candidates = [
    requestedId,
    requestedNo ? `DEVICE_${requestedNo}` : "",
    storedId,
    currentDeviceId,
    frontDevices[0]?.id,
  ].filter(Boolean);
  const matched = candidates.find((candidate) => frontDevices.some((device) => device.id === candidate));
  if (matched) window.localStorage.setItem(FRONT_DEVICE_STORAGE_KEY, matched);
  return matched || "";
}

function splitNames(value) {
  return String(value || "")
    .split(/[,،]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function blankChildren(count, current = []) {
  return Array.from({ length: count }, (_, index) => current[index] || {
    name: "",
    birthDate: "",
    comments: "",
  });
}

export default function FrontClient({ user }) {
  const toast = useToast();
  const { t, currency, formatNumber, labelCategory, labelMethod, labelStatus, formatDateTime } = useI18n();
  const linkedEmployeeId = user?.employeeId && user?.employee?.department !== "KITCHEN" ? user.employeeId : "";
  const linkedEmployeeName = linkedEmployeeId ? user.employee.name : "";

  const [products, setProducts] = useState([]);
  const [devices, setDevices] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [paymentProviders, setPaymentProviders] = useState([]);
  const [orders, setOrders] = useState([]);
  const [childNameHistory, setChildNameHistory] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [dataEmployeeId, setDataEmployeeId] = useState("");
  const [paymentProviderId, setPaymentProviderId] = useState("CASH");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerComments, setCustomerComments] = useState("");
  const [allowOpenCharges, setAllowOpenCharges] = useState(false);
  const [childCount, setChildCount] = useState(1);
  const [children, setChildren] = useState(blankChildren(1));
  const [cart, setCart] = useState([]);
  const [category, setCategory] = useState("All");
  const [productQuery, setProductQuery] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [editingOrder, setEditingOrder] = useState(null);
  const [showAdmissionForm, setShowAdmissionForm] = useState(false);
  const [customerMatches, setCustomerMatches] = useState([]);
  const [customerLookupMessage, setCustomerLookupMessage] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (!showAdmissionForm && !editingOrder) {
      setCustomerMatches([]);
      setCustomerLookupMessage("");
      return undefined;
    }
    const phone = customerPhone.trim();
    if (phone.length < 5) {
      setCustomerMatches([]);
      setCustomerLookupMessage("");
      return undefined;
    }

    const handle = window.setTimeout(async () => {
      const res = await fetch(`/api/customers?phone=${encodeURIComponent(phone)}`, { cache: "no-store", credentials: "include" });
      if (!res.ok) return;
      const result = await res.json();
      const matches = Array.isArray(result.customers) ? result.customers : [];
      setCustomerMatches(matches.slice(0, 5));
      setCustomerLookupMessage(matches.length ? t("front.customerFound", { count: matches.length }) : t("front.noCustomerFound"));
    }, 250);

    return () => window.clearTimeout(handle);
  }, [customerPhone, showAdmissionForm, editingOrder, t]);

  const frontDevices = useMemo(() => devices.filter((device) => device.active && device.type === "FRONT"), [devices]);
  const selectedDevice = useMemo(() => frontDevices.find((device) => device.id === selectedDeviceId), [frontDevices, selectedDeviceId]);
  const frontEmployees = useMemo(() => employees.filter((employee) => (
    employee.active && (employee.department === "CASHIER" || cashierEmployeeNames.has(employee.name))
  )), [employees]);
  const categories = useMemo(() => ["All", ...orderProductCategories(products.map((product) => product.categoryName))], [products]);
  const visibleProducts = products
    .filter((product) => category === "All" || product.categoryName === category)
    .filter((product) => {
      const search = productQuery.trim().toLowerCase();
      if (!search) return true;
      return [product.name, product.categoryName].some((value) => String(value || "").toLowerCase().includes(search));
    });
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const selectedProvider = paymentProviders.find((provider) => provider.id === paymentProviderId) || paymentProviders[0];
  const visibleOrders = useMemo(() => {
    const search = orderQuery.trim().toLowerCase();
    if (!search) return orders;
    return orders.filter((order) => [
      order.id,
      order.invoiceSerial,
      order.braceletNo,
      order.customerName,
      order.customerPhone,
      order.childNames,
    ].some((value) => String(value || "").toLowerCase().includes(search)));
  }, [orders, orderQuery]);

  async function loadAll() {
    const [productsRes, devicesRes, employeesRes, providersRes, ordersRes, namesRes] = await Promise.all([
      fetch("/api/products?department=ENTRANCE"),
      fetch("/api/devices"),
      fetch("/api/employees?department=ALL"),
      fetch("/api/payment-providers?context=front"),
      fetch("/api/orders?archived=false&deviceType=FRONT"),
      fetch("/api/child-names"),
    ]);
    const [productsData, devicesData, employeesData, providersData, ordersData, namesData] = await Promise.all([
      productsRes.json(),
      devicesRes.json(),
      employeesRes.json(),
      providersRes.json(),
      ordersRes.json(),
      namesRes.ok ? namesRes.json() : { names: [] },
    ]);

    setProducts(productsData);
    setDevices(devicesData.devices || []);
    setEmployees(employeesData);
    setPaymentProviders(providersData.providers || []);
    setOrders(ordersData);
    setChildNameHistory(Array.isArray(namesData.names) ? namesData.names : []);

    const activeFrontDevices = (devicesData.devices || []).filter((device) => device.active && device.type === "FRONT");
    const firstProvider = (providersData.providers || []).find((provider) => provider.id === "CASH") || providersData.providers?.[0];
    setSelectedDeviceId((current) => resolveStoredFrontDevice(activeFrontDevices, current));
    setPaymentProviderId((current) => current || firstProvider?.id || "CASH");
    setDataEmployeeId((current) => (
      linkedEmployeeId || current || employeesData.find((employee) => (
        employee.active && (employee.department === "CASHIER" || cashierEmployeeNames.has(employee.name))
      ))?.id || ""
    ));
  }

  function updateChild(index, patch) {
    setChildren((current) => current.map((child, childIndex) => childIndex === index ? { ...child, ...patch } : child));
  }

  function setNextChildCount(count) {
    setChildCount(count);
    setChildren((current) => blankChildren(count, current));
  }

  function cartQuantity(productId) {
    return cart.find((item) => item.productId === productId)?.qty || 0;
  }

  function setCartQty(product, value) {
    if (!productAvailability(product).available) return;
    const qty = Math.max(0, Number(value) || 0);
    setCart((current) => {
      const productId = product.id || product.productId;
      const existing = current.find((item) => item.productId === productId);
      if (!existing && qty <= 0) return current;
      if (!existing) return [...current, { productId, name: product.name, price: product.price, qty }];
      return current
        .map((item) => item.productId === productId ? { ...item, qty } : item)
        .filter((item) => item.qty > 0);
    });
  }

  function changeQty(product, amount) {
    if (!productAvailability(product).available) return;
    setCartQty(product, cartQuantity(product.id || product.productId) + amount);
  }

  function resetForm() {
    setEditingOrder(null);
    setShowAdmissionForm(false);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerComments("");
    setAllowOpenCharges(false);
    setNextChildCount(1);
    setCart([]);
    setCustomerMatches([]);
    setCustomerLookupMessage("");
    setMessage("");
  }

  function startNewAdmission() {
    resetForm();
    setShowAdmissionForm(true);
  }

  function applyCustomer(customer) {
    const nextChildren = Array.isArray(customer.children) && customer.children.length
      ? customer.children.map((child) => ({
        name: child.name || "",
        birthDate: formatBirthDateForInput(child.birthDate),
        comments: child.comments || "",
      }))
      : blankChildren(1);
    setCustomerName(customer.name || "");
    setCustomerPhone(customer.phone || customerPhone);
    setCustomerComments(customer.comments || "");
    setChildCount(Math.max(1, nextChildren.length));
    setChildren(blankChildren(Math.max(1, nextChildren.length), nextChildren));
    setCustomerMatches([]);
    setCustomerLookupMessage("");
  }

  function startEdit(order) {
    const orderChildren = Array.isArray(order.children) && order.children.length
      ? order.children.map((child) => ({
        name: child.name || "",
        birthDate: formatBirthDateForInput(child.birthDate),
        comments: child.comments || "",
      }))
      : splitNames(order.childNames).map((name) => ({ name, birthDate: "", comments: "" }));

    setEditingOrder(order);
    setShowAdmissionForm(true);
    setCustomerName(order.customerName || "");
    setCustomerPhone(order.customerPhone || "");
    setCustomerComments(order.comments || "");
    setAllowOpenCharges(Boolean(order.allowOpenCharges || order.children?.some((child) => child.allowOpenCharges)));
    setChildCount(Math.max(1, orderChildren.length));
    setChildren(blankChildren(Math.max(1, orderChildren.length), orderChildren));
    setCart([]);
    setMessage("");
  }

  function orderUrlId(orderId) {
    return encodeURIComponent(orderId);
  }

  async function saveAdmission() {
    setMessage("");
    const cleanedChildren = children.map((child) => ({ ...child, name: child.name.trim() })).filter((child) => child.name);
    if (!customerName.trim()) {
      toast(t("front.customerName"), "error");
      return;
    }
    if (!isRequiredCustomerPhone(customerPhone)) {
      toast(t("cashier.invalidPhone"), "error");
      return;
    }
    const invalidBirthDate = cleanedChildren.some((child) => child.birthDate && !birthDateInputToIso(child.birthDate));
    if (invalidBirthDate) {
      toast(t("front.invalidBirthDate"), "error");
      return;
    }
    if (!cleanedChildren.length) {
      toast(t("cashier.childName", { count: 1 }), "error");
      return;
    }
    if (!editingOrder && !cart.length) {
      toast(t("cashier.noItemsSelected"), "error");
      return;
    }
    if (!selectedDeviceId) {
      toast(t("front.noFrontDevices"), "error");
      return;
    }
    if (!linkedEmployeeId && !dataEmployeeId) {
      toast(t("cashier.exitEmployeeRequired"), "error");
      return;
    }

    const childNames = cleanedChildren.map((child) => child.name);
    const payload = {
      customerName,
      customerPhone,
      customerComments,
      comments: customerComments,
      childNames,
      childBirthDates: cleanedChildren.map((child) => birthDateInputToIso(child.birthDate)),
      childComments: cleanedChildren.map((child) => child.comments),
      childOpenCharges: cleanedChildren.map(() => allowOpenCharges),
      allowOpenCharges,
      dataEmployeeId: linkedEmployeeId || dataEmployeeId,
    };

    if (editingOrder) {
      const res = await fetch(`/api/orders/${orderUrlId(editingOrder.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          braceletNo: editingOrder.braceletNo,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setMessage(data.error || t("cashier.updateFailed"));
        toast(data.error || t("cashier.updateFailed"), "error");
        return;
      }

      setOrders((current) => current.map((order) => order.id === data.order.id ? data.order : order));
      setChildNameHistory((current) => [...new Set([...childNames, ...current])]);
      toast(t("cashier.orderUpdated"), "success");
      resetForm();
      return;
    }

    const provider = paymentProviders.find((item) => item.id === paymentProviderId) || selectedProvider;
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        autoBracelet: true,
        deviceId: selectedDeviceId,
        deviceType: "FRONT",
        paymentProviderId: provider?.id,
        paymentMethod: provider?.method || "CASH",
        items: cart,
      }),
    });
    const data = await res.json();
    if (!data.success) {
      setMessage(data.error || t("cashier.saveFailed"));
      toast(data.error || t("cashier.saveFailed"), "error");
      return;
    }

    setOrders((current) => [data.order, ...current]);
    setChildNameHistory((current) => [...new Set([...childNames, ...current])]);
    toast(t("cashier.saved", { id: data.order.invoiceSerial || data.order.id }), "success");
    resetForm();
  }

  return (
    <section className="front-pos">
      <datalist id="front-child-name-history">
        {childNameHistory.map((name) => <option value={name} key={name} />)}
      </datalist>

      {!showAdmissionForm && !editingOrder && (
        <section className="panel front-entry-panel">
          <div className="row">
            <div>
              <h2>{t("front.currentAdmissions")}</h2>
              <div className="muted">{t("front.currentAdmissionsHint")}</div>
            </div>
            <button className="btn-confirm" onClick={startNewAdmission}>{t("front.addNewCustomer")}</button>
          </div>
          <div className="front-admission-list">
            {visibleOrders.slice(0, 18).map((order) => (
              <button className="front-admission-chip" key={order.id} onClick={() => startEdit(order)}>
                <b>{shortBracelet(order.invoiceSerial || order.braceletNo)}</b>
                <span>{order.customerName || "-"}</span>
                <small>{order.childNames}</small>
              </button>
            ))}
            {!visibleOrders.length && <div className="muted">{t("common.noData")}</div>}
          </div>
        </section>
      )}

      {(showAdmissionForm || editingOrder) && <>
      <div className="cart-panel front-cart">
        <div className="row">
          <h2>{editingOrder ? t("front.editAdmission") : t("front.createAdmission")}</h2>
          {editingOrder && <b>{shortBracelet(editingOrder.invoiceSerial || editingOrder.braceletNo)}</b>}
        </div>
        {cart.length === 0 ? <div className="muted">{editingOrder ? t("cashier.noItemsSelected") : t("cashier.noItemsSelected")}</div> : cart.map((item) => (
          <div className="row cart-item-row" key={item.productId}>
            <span>{item.name}</span>
            <span className="actions cart-qty-actions">
              <button className="secondary qty-button" onClick={() => setCartQty(item, item.qty - 1)}>-</button>
              <input className="qty-input" type="number" min="0" value={item.qty} onChange={(event) => setCartQty(item, event.target.value)} aria-label={`${item.name} quantity`} />
              <button className="btn-confirm qty-button" onClick={() => setCartQty(item, item.qty + 1)}>+</button>
              <b>{currency(item.price * item.qty)}</b>
            </span>
          </div>
        ))}
        <div className="row order-total-row"><span>{t("common.orderTotal")}</span><b>{currency(total)}</b></div>
        <div className="actions">
          <button className="btn-confirm" onClick={saveAdmission}>{editingOrder ? t("cashier.saveChanges") : t("cashier.saveOrder")}</button>
          <button className="secondary" onClick={() => setCart([])}>{t("cashier.clearCart")}</button>
          <button className="danger" onClick={resetForm}>{t("common.cancel")}</button>
        </div>
        {message && <div className="message">{message}</div>}
      </div>

      <div className="front-workspace">
        <aside className="front-details panel">
          <h3>{t("front.customerName")}</h3>
          <div className="device-fixed-value">
            <span>{t("front.device")}</span>
            <b>{selectedDevice?.name || t("front.noFrontDevices")}</b>
          </div>
          <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder={t("front.customerName")} />
          <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder={t("front.phonePlaceholder")} inputMode="numeric" />
          {(customerLookupMessage || customerMatches.length > 0) && (
            <div className="customer-lookup-panel">
              {customerLookupMessage && <small className="muted">{customerLookupMessage}</small>}
              {customerMatches.map((customer) => (
                <button type="button" key={customer.id} className="customer-match-card" onClick={() => applyCustomer(customer)}>
                  <b>{customer.name || "-"}</b>
                  <span>{customer.phone || "-"}</span>
                  <small>
                    {(customer.children || []).slice(0, 4).map((child) => {
                      const age = childAgeLabel(child.birthDate);
                      return `${child.name}${age ? ` (${age})` : ""}`;
                    }).join("، ") || t("common.noData")}
                  </small>
                </button>
              ))}
            </div>
          )}
          <select aria-label={t("front.paymentProvider")} value={paymentProviderId} onChange={(event) => setPaymentProviderId(event.target.value)} disabled={Boolean(editingOrder)}>
            {paymentProviders.map((provider) => <option value={provider.id} key={provider.id}>{provider.name || labelMethod(provider.method)}</option>)}
          </select>
          {linkedEmployeeId ? (
            <div className={`employee-fixed-value ${employeeGenderClass(linkedEmployeeName)}`}>{linkedEmployeeName}</div>
          ) : (
            <select aria-label={t("common.employee")} value={dataEmployeeId} onChange={(event) => setDataEmployeeId(event.target.value)}>
              <option value="">{t("common.employee")}</option>
              {frontEmployees.map((employee) => <option value={employee.id} key={employee.id}>{employee.name}</option>)}
            </select>
          )}
          <select aria-label={t("common.children")} value={childCount} onChange={(event) => setNextChildCount(Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((count) => <option value={count} key={count}>{t("cashier.childCount", { count })}</option>)}
          </select>
          <div className="front-children">
            {children.map((child, index) => (
              <div className="front-child" key={index}>
                <input value={child.name} onChange={(event) => updateChild(index, { name: event.target.value })} placeholder={t("cashier.childName", { count: index + 1 })} list="front-child-name-history" />
                <input value={child.birthDate} onChange={(event) => updateChild(index, { birthDate: event.target.value })} placeholder="dd/mm/yyyy" inputMode="numeric" aria-label={t("front.birthDate")} />
                <input value={child.comments} onChange={(event) => updateChild(index, { comments: event.target.value })} placeholder={t("front.childComment")} />
              </div>
            ))}
          </div>
          <label className="toggle-row front-open-charge">
            <input type="checkbox" checked={allowOpenCharges} onChange={(event) => setAllowOpenCharges(event.target.checked)} />
            <span>I</span>
          </label>
          <textarea value={customerComments} onChange={(event) => setCustomerComments(event.target.value)} placeholder={t("front.customerComments")} />
        </aside>

        <main className="front-products panel">
          <div className="row">
            <h2>{t("front.entranceProducts")}</h2>
            <input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} placeholder={t("manager.productSearch")} />
          </div>
          <div className="tabs category-tabs">
            {categories.map((item) => {
              const availability = categoryAvailability(item);
              return (
                <button
                  key={item}
                  className={`${categoryToneClass(item)} ${category === item ? "active" : ""}`}
                  disabled={!availability.available}
                  title={availability.opensOn ? `${labelCategory(item)} opens on ${availability.opensOn}` : undefined}
                  onClick={() => setCategory(item)}
                >
                  {labelCategory(item)}
                </button>
              );
            })}
          </div>
          <div className="products front-product-grid">
            {visibleProducts.map((product) => {
              const qty = cartQuantity(product.id);
              const availability = productAvailability(product);
              const visual = productCardVisual(product, productInitials(product.name));
              return (
                <div
                  className={`card product ${qty ? "in-cart" : ""} ${visual.style ? "product-custom-accent" : ""} ${!availability.available ? "product-disabled" : ""}`}
                  style={visual.style}
                  key={product.id}
                >
                  <button className="product-main" onClick={() => changeQty(product, 1)} disabled={!availability.available}>
                    <div className={`front-product-letter ${visual.className}`}>{visual.text}</div>
                    <div className="product-name">{product.name}</div>
                  </button>
                  <div className="product-body">
                    <div className="product-qty-actions">
                      <button className="secondary qty-button" onClick={() => changeQty(product, -1)} disabled={!qty || !availability.available}>-</button>
                      <input className="qty-input" type="number" min="0" value={qty} onChange={(event) => setCartQty(product, event.target.value)} aria-label={`${product.name} quantity`} disabled={!availability.available} />
                      <button className="btn-confirm qty-button" onClick={() => changeQty(product, 1)} disabled={!availability.available}>+</button>
                    </div>
                    <div className="product-price">{currency(product.price)}</div>
                    {!availability.available && <small className="muted product-availability">{availability.opensOn}</small>}
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      </div>
      </>}

      <section className="panel">
        <div className="row">
          <h2>{t("front.currentAdmissions")}</h2>
          <b>{formatNumber(visibleOrders.length)}</b>
        </div>
        <div className="form-grid cashier-order-search">
          <input value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} placeholder={t("cashier.searchOrdersPlaceholder")} />
          <button className="secondary" onClick={() => setOrderQuery("")}>{t("common.clearFilters")}</button>
        </div>
        <div className="grid three">
          {visibleOrders.slice(0, 60).map((order) => (
            <div className="card admission-card" key={order.id}>
              <div className="row order-head">
                <b>{shortBracelet(order.invoiceSerial || order.braceletNo)}</b>
                <span className={`badge ${order.paymentStatus === "PAID" ? "paid" : "unpaid"}`}>{labelStatus(order.paymentStatus)}</span>
              </div>
              <div className="meta-line"><span>{t("common.orderId")}</span><b>{order.id}</b></div>
              <div className="meta-line"><span>{t("common.date")}</span><b>{formatDateTime(order.createdAt)}</b></div>
              <div className="meta-line"><span>{t("front.customerName")}</span><b>{order.customerName || "-"}</b></div>
              {order.customerPhone && <div className="meta-line"><span>{t("common.phone")}</span><b>{order.customerPhone}</b></div>}
              <div className="meta-line"><span>{t("common.children")}</span><b>{order.childNames}</b></div>
              <div className="meta-line"><span>{t("common.orderTotal")}</span><b>{currency(order.total)}</b></div>
              <div className="front-admission-items">
                {(order.items || []).map((item) => (
                  <div className="order-item-row" key={item.id || item.productId || item.name}>
                    <b>{currency(item.total)}</b>
                    <span>{item.name} x {item.qty}</span>
                  </div>
                ))}
                {!(order.items || []).length && <div className="muted">{t("common.noItems")}</div>}
              </div>
              <div className="actions">
                <button className="btn-details" onClick={() => startEdit(order)}>{t("common.edit")}</button>
                <a className="btn-print" href={`/invoice/${encodeURIComponent(order.id)}`} target="_blank" rel="noreferrer">{t("common.print")}</a>
              </div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
