"use client";

import { useEffect, useMemo, useState } from "react";

export default function CashierClient() {
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
      return;
    }

    localStorage.setItem("lastDataEmployeeId", dataEmployeeId);
    setBraceletNo("");
    setChildNames([""]);
    setChildren(1);
    setPaymentMethod("CASH");
    setCart([]);
    await load();
  }

  return (
    <>
      <section className="panel stack">
        <h2>إضافة طلب جديد</h2>
        <div className="form-grid">
          <input value={braceletNo} onChange={(event) => setBraceletNo(event.target.value)} placeholder="Bracelet number" />
          <select value={childCount} onChange={(event) => setChildren(Number(event.target.value))}>
            {[1, 2, 3, 4, 5, 6].map((count) => <option key={count} value={count}>{count} child</option>)}
          </select>
          <select value={dataEmployeeId} onChange={(event) => setDataEmployeeId(event.target.value)}>
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
        <div className="tabs">
          {categories.map((item) => (
            <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>
          ))}
        </div>
        <div className="products">
          {visibleProducts.map((product) => (
            <button className="card product" key={product.id} onClick={() => addToCart(product)}>
              <img src={product.imageUrl || "https://placehold.co/320x240?text=Product"} alt="" />
              <div className="product-body">
                <div className="product-name">{product.name}</div>
                <div className="muted">{product.price} EGP</div>
              </div>
            </button>
          ))}
        </div>
        <div className="panel">
          <h3>Cart</h3>
          {cart.length === 0 ? <div className="muted">No items selected</div> : cart.map((item) => (
            <div className="row" key={item.productId}>
              <span>{item.name} x {item.qty}</span>
              <b>{item.price * item.qty} EGP</b>
            </div>
          ))}
          <div className="row"><span>Total</span><b>{total} EGP</b></div>
          <div className="actions">
            <button onClick={saveOrder}>Save Order</button>
            <button className="secondary" onClick={() => setCart([])}>Clear Cart</button>
          </div>
          <div className="message">{message}</div>
        </div>
      </section>

      <section className="panel">
        <h2>الطلبات الحالية</h2>
        <div className="grid three">
          {orders.map((order) => (
            <div className="card" key={order.id}>
              <div className="row"><b>{order.id}</b><span className={`badge ${order.paymentStatus === "PAID" ? "paid" : "unpaid"}`}>{order.paymentStatus}</span></div>
              <div>Bracelet: <b>{order.braceletNo}</b></div>
              <div>Children: <b>{order.childNames}</b></div>
              <div>Total: <b>{order.total} EGP</b></div>
              <div className="muted">{order.items.length} items</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
