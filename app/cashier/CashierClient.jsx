"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "../ToastProvider";

export default function CashierClient() {
  const toast = useToast();
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

    const lastEmployee = localStorage.getItem("lastDataEmployeeId");
    setDataEmployeeId(lastEmployee || employeesData[0]?.id || "");
  }

  const categories = useMemo(() => ["All", ...new Set(products.map((product) => product.categoryName))], [products]);
  const [category, setCategory] = useState("All");
  const visibleProducts = products.filter((product) => category === "All" || product.categoryName === category);
  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  const orderTotalPreview = editingOrder ? Number(editingOrder.total || 0) + total : total;

  function orderAlertClass(order) {
    if (!order.customerLeft || order.archivedAt) return "";
    if (order.paymentStatus !== "PAID") return "left-unpaid";
    return "needs-system";
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

  function changeQty(productId, change) {
    setCart((current) => current
      .map((item) => item.productId === productId ? { ...item, qty: item.qty + change } : item)
      .filter((item) => item.qty > 0));
  }

  function startEdit(order) {
    setEditingOrder(order);
    setCashierView("form");
    setCart([]);
    setMessage("");
    window.history.replaceState(null, "", "#edit-order");
    scrollToSection(formRef);
  }

  function cancelEdit() {
    setEditingOrder(null);
    setCart([]);
    setMessage("");
    showOrders();
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
      setMessage(data.error || "Order save failed");
      toast(data.error || "Order save failed", "error");
      return;
    }

    toast(`Order ${data.order.id} saved`);
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
    const res = await fetch(`/api/orders/${editingOrder.id}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart }),
    });
    const data = await res.json();

    if (!data.success) {
      setMessage(data.error || "Order update failed");
      toast(data.error || "Order update failed", "error");
      return;
    }

    toast("Items added to order");
    setEditingOrder(null);
    setCart([]);
    await load(showArchived);
    showOrders();
  }

  async function markCustomerLeft(orderId) {
    const res = await fetch(`/api/orders/${orderId}/left`, { method: "POST" });
    const data = await res.json();

    if (!data.success) {
      toast(data.error || "Update failed", "error");
      return;
    }

    toast("Customer marked as left", "info");
    await load(showArchived);
  }

  async function archiveOrder(orderId) {
    const res = await fetch(`/api/orders/${orderId}/archive`, { method: "POST" });
    const data = await res.json();

    if (!data.success) {
      toast(data.error || "Archive failed", "error");
      return;
    }

    toast("Order registered on system", "info");
    await load(showArchived);
  }

  function renderCart() {
    return (
      <div className="cart-panel">
        <h3>Cart</h3>
        {cart.length === 0 ? <div className="muted">No items selected</div> : cart.map((item) => (
          <div className="row" key={item.productId}>
            <span>{item.name} x {item.qty}</span>
            <span className="actions">
              <button onClick={() => changeQty(item.productId, 1)}>+</button>
              <button className="secondary" onClick={() => changeQty(item.productId, -1)}>-</button>
              <b>{item.price * item.qty} EGP</b>
            </span>
          </div>
        ))}
        <div className="row"><span>{editingOrder ? "New Items Total" : "Order Total"}</span><b>{total} EGP</b></div>
        {editingOrder && <div className="row"><span>Order Total After Add</span><b>{orderTotalPreview} EGP</b></div>}
        <div className="actions">
          <button onClick={saveCart}>{editingOrder ? "Add Items" : "Save Order"}</button>
          <button className="secondary" onClick={() => setCart([])}>Clear Cart</button>
          {!editingOrder && <button className="secondary" onClick={showOrders}>رجوع للطلبات</button>}
          {editingOrder && <button className="danger" onClick={cancelEdit}>Cancel</button>}
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
          <span>إضافة طلب جديد</span>
        </button>
        <div className="command-copy">
          <h2>{showArchived ? "الطلبات المؤرشفة" : "الطلبات الحالية"}</h2>
          <div className="muted">{orders.length} {showArchived ? "طلب مؤرشف" : "طلب حالي"}</div>
        </div>
      </section>

      {(cashierView === "form" || editingOrder) && (
      <section className="panel stack" id="new-order" ref={formRef}>
        <h2>{editingOrder ? "تعديل الطلب" : "إضافة طلب جديد"}</h2>
        {editingOrder ? (
          <div className="summary">
            <div className="meta-line"><span>Order</span><b>{editingOrder.id}</b></div>
            <div className="meta-line"><span>Bracelet</span><b>{editingOrder.braceletNo}</b></div>
            <div className="meta-line"><span>Phone</span><b>{editingOrder.customerPhone || "-"}</b></div>
            <div className="meta-line"><span>Children</span><b>{editingOrder.childNames}</b></div>
            <div className="meta-line"><span>Order Total</span><b>{editingOrder.total} EGP</b></div>
            <div className="panel">
              {editingOrder.items.map((item) => (
                <div className="row" key={item.id}><span>{item.name} x {item.qty}</span><b>{item.total} EGP</b></div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="form-grid">
              <input value={braceletNo} onChange={(event) => setBraceletNo(event.target.value)} placeholder="Bracelet number" />
              <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Customer phone (optional)" />
              <select value={childCount} onChange={(event) => setChildren(Number(event.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} child</option>)}
              </select>
              <select value={dataEmployeeId} onChange={(event) => setDataEmployeeId(event.target.value)}>
                <option value="">Employee</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
              </select>
              <div className="payment-radios" role="radiogroup" aria-label="Payment method">
                {[
                  { value: "CASH", label: "كاش", tone: "cash" },
                  { value: "VISA", label: "فيزا", tone: "visa" },
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
            </div>
            <div className="form-grid">
              {childNames.map((name, index) => (
                <input
                  key={index}
                  value={name}
                  onChange={(event) => setChildNames((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                  placeholder={`Child name ${index + 1}`}
                />
              ))}
            </div>
          </>
        )}
        {renderCart()}
        <div className="tabs">
          {categories.map((item) => (
            <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>
          ))}
        </div>
        <div className="products">
          {visibleProducts.map((product) => (
            <button className="card product" key={product.id} onClick={() => addToCart(product)}>
              <img
                src={product.imageUrl || fallbackImage}
                alt={product.name}
                onError={(event) => { event.currentTarget.src = fallbackImage; }}
              />
              <div className="product-body">
                <div className="product-name">{product.name}</div>
                <div className="product-price">{product.price} EGP</div>
              </div>
            </button>
          ))}
        </div>
        {renderCart()}
      </section>
      )}

      <section className="panel" id="orders" ref={ordersRef}>
        <div className="row">
          <h2>{showArchived ? "الطلبات المؤرشفة" : "الطلبات الحالية"}</h2>
          <div className="tabs order-tabs">
            <button className={!showArchived ? "active" : ""} onClick={() => showOrdersTab(false)}>الطلبات الحالية</button>
            <button className={showArchived ? "active" : ""} onClick={() => showOrdersTab(true)}>الطلبات المؤرشفة</button>
          </div>
        </div>
        <div className="grid three honey-grid">
          {orders.map((order) => (
            <div className={`card order-cell ${orderAlertClass(order)}`} key={order.id}>
              <div className="row"><b>{order.id}</b><span className={`badge ${order.paymentStatus === "PAID" ? "paid" : "unpaid"}`}>{order.paymentStatus}</span></div>
              <div className="meta-line"><span>Bracelet</span><b>{order.braceletNo}</b></div>
              <div className="meta-line"><span>Phone</span><b>{order.customerPhone || "-"}</b></div>
              <div className="meta-line"><span>Children</span><b>{order.childNames}</b></div>
              <div className="meta-line"><span>Cashier</span><b>{order.cashier || "-"}</b></div>
              <div className="meta-line"><span>Employee</span><b>{order.dataEmployee || "-"}</b></div>
              <div className="meta-line"><span>Kitchen</span><b>{order.kitchenStatus}</b></div>
              <div className="meta-line"><span>Payment Method</span><b>{order.paymentMethod}</b></div>
              <div className="meta-line"><span>Order Total</span><b>{order.total} EGP</b></div>
              <div className="summary">
                {order.items.length === 0 ? (
                  <div className="muted">No items</div>
                ) : order.items.map((item) => (
                  <div className="row" key={item.id}>
                    <span>{item.name} x {item.qty}</span>
                    <b>{item.total} EGP</b>
                  </div>
                ))}
              </div>
              {order.customerLeft && order.paymentStatus !== "PAID" && <div className="warning warning-orange">العميل خرج ولسه متعملش تم الدفع</div>}
              {order.customerLeft && order.paymentStatus === "PAID" && !order.archivedAt && <div className="warning">العميل خرج ولسه متسجلش على السيستم</div>}
              {showArchived ? (
                <div className="muted">Archived at: {order.archivedAt ? new Date(order.archivedAt).toLocaleString() : ""}</div>
              ) : (
                <div className="actions">
                  <button className="btn-edit" onClick={() => startEdit(order)}>تعديل على الأوردر</button>
                  <button className="btn-exit" disabled={order.customerLeft} onClick={() => markCustomerLeft(order.id)}>تم الخروج</button>
                  <button
                    className="btn-system"
                    disabled={order.kitchenStatus !== "DELIVERED" || order.paymentStatus !== "PAID"}
                    onClick={() => archiveOrder(order.id)}
                  >
                    تم التسجيل على السيستم
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
