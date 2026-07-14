"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "../ToastProvider";
import { useI18n } from "../i18n";
import { categoryAvailability, categoryToneClass, orderProductCategories, productAvailability, productCardVisual } from "../categoryRules";

const KITCHEN_CASHIER_DEVICE_STORAGE_KEY = "bbKitchenCashierDeviceId";

function productInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const source = parts.length > 1 ? parts.slice(0, 2) : parts;
  return source.map((part) => part[0]).join("").toUpperCase() || "?";
}

function resolveStoredDevice(devices, currentDeviceId) {
  if (!devices.length) return "";
  const params = new URLSearchParams(window.location.search);
  const requestedId = params.get("deviceId");
  const requestedNo = params.get("device");
  const storedId = window.localStorage.getItem(KITCHEN_CASHIER_DEVICE_STORAGE_KEY);
  const candidates = [
    requestedId,
    requestedNo ? `DEVICE_${requestedNo}` : "",
    storedId,
    currentDeviceId,
    devices[0]?.id,
  ].filter(Boolean);
  const matched = candidates.find((candidate) => devices.some((device) => device.id === candidate));
  if (matched) window.localStorage.setItem(KITCHEN_CASHIER_DEVICE_STORAGE_KEY, matched);
  return matched || "";
}

export default function QuickRestaurantOrder({ embedded = false, onOrderCreated = null }) {
  const toast = useToast();
  const { t, currency, formatNumber, labelCategory, labelMethod, labelStatus, formatDateTime } = useI18n();
  const [products, setProducts] = useState([]);
  const [devices, setDevices] = useState([]);
  const [paymentProviders, setPaymentProviders] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [paymentProviderId, setPaymentProviderId] = useState("CASH");
  const [cart, setCart] = useState([]);
  const [category, setCategory] = useState("All");
  const [productQuery, setProductQuery] = useState("");
  const [orderQuery, setOrderQuery] = useState("");
  const [message, setMessage] = useState("");
  const [printFrameUrl, setPrintFrameUrl] = useState("");

  useEffect(() => {
    loadAll();
  }, []);

  const kitchenCashierDevices = useMemo(() => devices.filter((device) => device.active && device.type === "KITCHEN_CASHIER"), [devices]);
  const selectedDevice = useMemo(() => kitchenCashierDevices.find((device) => device.id === selectedDeviceId), [kitchenCashierDevices, selectedDeviceId]);
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
      order.paymentMethod,
      order.deviceName,
    ].some((value) => String(value || "").toLowerCase().includes(search)));
  }, [orders, orderQuery]);

  async function loadAll() {
    const [productsRes, devicesRes, providersRes, ordersRes] = await Promise.all([
      fetch("/api/products?context=quickRestaurant"),
      fetch("/api/devices"),
      fetch("/api/payment-providers?context=quickRestaurant"),
      fetch("/api/orders?archived=false&deviceType=KITCHEN_CASHIER"),
    ]);
    const [productsData, devicesData, providersData, ordersData] = await Promise.all([
      productsRes.json(),
      devicesRes.json(),
      providersRes.json(),
      ordersRes.json(),
    ]);

    setProducts(Array.isArray(productsData) ? productsData : []);
    const nextDevices = Array.isArray(devicesData.devices) ? devicesData.devices : [];
    setDevices(nextDevices);
    setPaymentProviders(providersData.providers || []);
    setOrders(Array.isArray(ordersData) ? ordersData : []);

    const activeDevices = nextDevices.filter((device) => device.active && device.type === "KITCHEN_CASHIER");
    const firstProvider = (providersData.providers || []).find((provider) => provider.id === "CASH") || providersData.providers?.[0];
    setSelectedDeviceId((current) => resolveStoredDevice(activeDevices, current));
    setPaymentProviderId((current) => current || firstProvider?.id || "CASH");
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
      if (!existing) {
        return [...current, {
          productId,
          name: product.name,
          price: product.price,
          categoryName: product.categoryName,
          qty,
        }];
      }
      return current
        .map((item) => item.productId === productId ? { ...item, qty } : item)
        .filter((item) => item.qty > 0);
    });
  }

  function changeQty(product, amount) {
    if (!productAvailability(product).available) return;
    setCartQty(product, cartQuantity(product.id || product.productId) + amount);
  }

  function resetCart() {
    setCart([]);
    setMessage("");
  }

  function orderUrlId(orderId) {
    return encodeURIComponent(orderId);
  }

  async function saveRestaurantOrder() {
    setMessage("");
    if (!cart.length) {
      toast(t("cashier.noItemsSelected"), "error");
      return;
    }
    if (!selectedDeviceId) {
      toast(t("kitchenCashier.noDevices"), "error");
      return;
    }

    const provider = paymentProviders.find((item) => item.id === paymentProviderId) || selectedProvider;
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        autoBracelet: true,
        deviceId: selectedDeviceId,
        deviceType: "KITCHEN_CASHIER",
        paymentProviderId: provider?.id,
        paymentMethod: provider?.method || "CASH",
        childNames: ["Restaurant"],
        comments: "Quick restaurant order",
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
    if (typeof onOrderCreated === "function") onOrderCreated(data.order);
    toast(t("kitchenCashier.saved", { id: data.order.invoiceSerial || data.order.id }), "success");
    setPrintFrameUrl(`/invoice/${orderUrlId(data.order.id)}?print=${Date.now()}`);
    window.setTimeout(() => setPrintFrameUrl(""), 5000);
    resetCart();
  }

  return (
    <section className={`front-pos kitchen-cashier-pos ${embedded ? "kitchen-cashier-embedded" : ""}`}>
      <div className="cart-panel front-cart">
        <div className="row">
          <h2>{t("kitchenCashier.createOrder")}</h2>
          <span className="muted">{t("kitchenCashier.orderNote")}</span>
        </div>
        {cart.length === 0 ? <div className="muted">{t("cashier.noItemsSelected")}</div> : cart.map((item) => (
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
          <button className="btn-confirm" onClick={saveRestaurantOrder}>{t("cashier.saveOrder")}</button>
          <button className="secondary" onClick={() => setCart([])}>{t("cashier.clearCart")}</button>
          <button className="danger" onClick={resetCart}>{t("common.cancel")}</button>
        </div>
        {message && <div className="message">{message}</div>}
      </div>

      <div className="front-workspace">
        <aside className="front-details panel">
          <h3>{t("kitchenCashier.title")}</h3>
          <div className="device-fixed-value">
            <span>{t("front.device")}</span>
            <b>{selectedDevice?.name || t("kitchenCashier.noDevices")}</b>
          </div>
          <select aria-label={t("front.paymentProvider")} value={paymentProviderId} onChange={(event) => setPaymentProviderId(event.target.value)}>
            {paymentProviders.map((provider) => <option value={provider.id} key={provider.id}>{provider.name || labelMethod(provider.method)}</option>)}
          </select>
          <button className="secondary" onClick={loadAll}>{t("common.refresh")}</button>
        </aside>

        <main className="front-products panel">
          <div className="row">
            <h2>{t("kitchenCashier.products")}</h2>
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
                    {product.imageUrl ? (
                      <img className="front-product-image" src={product.imageUrl} alt={product.name} loading="lazy" decoding="async" />
                    ) : (
                      <div className={`front-product-letter ${visual.className}`}>{visual.text}</div>
                    )}
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

      {!embedded && <section className="panel">
        <div className="row">
          <h2>{t("kitchenCashier.currentOrders")}</h2>
          <b>{formatNumber(visibleOrders.length)}</b>
        </div>
        <div className="form-grid cashier-order-search">
          <input value={orderQuery} onChange={(event) => setOrderQuery(event.target.value)} placeholder={t("manager.searchPlaceholder")} />
          <button className="secondary" onClick={() => setOrderQuery("")}>{t("common.clearFilters")}</button>
        </div>
        <div className="grid three">
          {visibleOrders.slice(0, 60).map((order) => (
            <div className="card admission-card" key={order.id}>
              <div className="row order-head">
                <b>{order.invoiceSerial || order.braceletNo}</b>
                <span className={`badge ${order.paymentStatus === "PAID" ? "paid" : "unpaid"}`}>{labelStatus(order.paymentStatus)}</span>
              </div>
              <div className="meta-line"><span>{t("common.orderId")}</span><b>{order.id}</b></div>
              <div className="meta-line"><span>{t("common.date")}</span><b>{formatDateTime(order.createdAt)}</b></div>
              <div className="meta-line"><span>{t("front.device")}</span><b>{order.deviceName || "-"}</b></div>
              <div className="meta-line"><span>{t("common.paymentMethod")}</span><b>{labelMethod(order.paymentMethod)}</b></div>
              <div className="meta-line"><span>{t("common.orderTotal")}</span><b>{currency(order.total)}</b></div>
              <div className="actions">
                <a className="btn-print" href={`/invoice/${orderUrlId(order.id)}`} target="_blank" rel="noreferrer">{t("common.print")}</a>
              </div>
            </div>
          ))}
        </div>
      </section>}

      {printFrameUrl && (
        <iframe
          className="print-frame"
          src={printFrameUrl}
          title="Quick restaurant invoice print"
        />
      )}
    </section>
  );
}
