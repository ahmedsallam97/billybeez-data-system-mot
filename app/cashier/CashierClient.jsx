"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "../ToastProvider";

export default function CashierClient() {
  const toast = useToast();
  const [products, setProducts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [braceletNo, setBraceletNo] = useState("");
  const [childCount, setChildCount] = useState(1);
  const [childNames, setChildNames] = useState([""]);
  const [dataEmployeeId, setDataEmployeeId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [message, setMessage] = useState("");
  const [editingOrder, setEditingOrder] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [productsRes, employeesRes, ordersRes] = await Promise.all([
      fetch("/api/products"),
      fetch("/api/employees"),
      fetch("/api/orders?archived=false"),
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
    setCart([]);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setEditingOrder(null);
    setCart([]);
    setMessage("");
  }

  async function saveOrder() {
    setMessage("");
    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        braceletNo,
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
    setChildNames([""]);
    setChildren(1);
    setPaymentMethod("CASH");
    setCart([]);
    await load();
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
    await load();
  }

  async function markCustomerLeft(orderId) {
    const res = await fetch(`/api/orders/${orderId}/left`, { method: "POST" });
    const data = await res.json();

    if (!data.success) {
      toast(data.error || "Update failed", "error");
      return;
    }

    toast("Customer marked as left", "info");
    await load();
  }

  return (
    <>
      <section className="panel stack">
        <h2>{editingOrder ? "تعديل الطلب" : "إضافة طلب جديد"}</h2>
        {editingOrder ? (
          <div className="summary">
            <div className="meta-line"><span>Order</span><b>{editingOrder.id}</b></div>
            <div className="meta-line"><span>Bracelet</span><b>{editingOrder.braceletNo}</b></div>
            <div className="meta-line"><span>Children</span><b>{editingOrder.childNames}</b></div>
            <div className="meta-line"><span>Current Total</span><b>{editingOrder.total} EGP</b></div>
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
              <select value={childCount} onChange={(event) => setChildren(Number(event.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} child</option>)}
              </select>
              <select value={dataEmployeeId} onChange={(event) => setDataEmployeeId(event.target.value)}>
                <option value="">Employee</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
              </select>
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                <option value="CASH">Cash</option>
                <option value="VISA">Visa</option>
              </select>
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
        <div className="tabs">
          {categories.map((item) => (
            <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>
          ))}
        </div>
        <div className="products">
          {visibleProducts.map((product) => (
            <button className="card product" key={product.id} onClick={() => addToCart(product)}>
              <img
                src={product.imageUrl || "https://placehold.co/320x240?text=Product"}
                alt={product.name}
                onError={(event) => { event.currentTarget.src = "https://placehold.co/320x240?text=Product"; }}
              />
              <div className="product-body">
                <div className="product-name">{product.name}</div>
                <div className="product-price">{product.price} EGP</div>
              </div>
            </button>
          ))}
        </div>
        <div className="panel">
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
          <div className="row"><span>Total</span><b>{total} EGP</b></div>
          <div className="actions">
            <button onClick={saveCart}>{editingOrder ? "Add Items" : "Save Order"}</button>
            <button className="secondary" onClick={() => setCart([])}>Clear Cart</button>
            {editingOrder && <button className="danger" onClick={cancelEdit}>Cancel</button>}
          </div>
          <div className="message">{message}</div>
        </div>
      </section>

      <section className="panel">
        <h2>الطلبات الحالية</h2>
        <div className="grid three honey-grid">
          {orders.map((order) => (
            <div className="card order-cell" key={order.id}>
              <div className="row"><b>{order.id}</b><span className={`badge ${order.paymentStatus === "PAID" ? "paid" : "unpaid"}`}>{order.paymentStatus}</span></div>
              <div className="meta-line"><span>Bracelet</span><b>{order.braceletNo}</b></div>
              <div className="meta-line"><span>Children</span><b>{order.childNames}</b></div>
              <div className="meta-line"><span>Cashier</span><b>{order.cashier || "-"}</b></div>
              <div className="meta-line"><span>Employee</span><b>{order.dataEmployee || "-"}</b></div>
              <div className="meta-line"><span>Kitchen</span><b>{order.kitchenStatus}</b></div>
              <div className="meta-line"><span>Payment Method</span><b>{order.paymentMethod}</b></div>
              <div className="meta-line"><span>Total</span><b>{order.total} EGP</b></div>
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
              {order.customerLeft && order.paymentStatus !== "PAID" && <div className="warning">العميل خرج ولسه متعملش تم الدفع</div>}
              <div className="actions">
                <button onClick={() => startEdit(order)}>تعديل على الأوردر</button>
                <button className="danger" onClick={() => markCustomerLeft(order.id)}>تم الخروج</button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
