"use client";

import { useEffect, useState } from "react";

export default function KitchenClient() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, []);

  async function load() {
    const res = await fetch("/api/orders?archived=false");
    setOrders(await res.json());
  }

  async function deliver(orderId) {
    await fetch(`/api/orders/${orderId}/deliver`, { method: "POST" });
    await load();
  }

  async function pay(orderId, paymentMethod) {
    const invoiceWindow = window.open("about:blank", "_blank");
    const res = await fetch(`/api/orders/${orderId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethod }),
    });
    const data = await res.json();

    if (data.success) {
      if (invoiceWindow) invoiceWindow.location.href = `/invoice/${orderId}`;
      await load();
    } else if (invoiceWindow) {
      invoiceWindow.close();
    }
  }

  return (
    <section className="panel">
      <h2>Kitchen Orders</h2>
      <div className="grid three">
        {orders.map((order) => (
          <div className="card" key={order.id}>
            <div className="row">
              <b>{order.id}</b>
              <span className={`badge ${order.paymentStatus === "PAID" ? "paid" : "unpaid"}`}>{order.paymentStatus}</span>
            </div>
            <div>Bracelet: <b>{order.braceletNo}</b></div>
            <div>Children: <b>{order.childNames}</b></div>
            <div>Total: <b>{order.total} EGP</b></div>
            <div>Kitchen: <b>{order.kitchenStatus}</b></div>
            <div className="panel">
              {order.items.map((item) => (
                <div className="row" key={item.id}>
                  <span>{item.name} x {item.qty}</span>
                  <b>{item.total} EGP</b>
                </div>
              ))}
            </div>
            <div className="actions">
              <button disabled={order.kitchenStatus === "DELIVERED"} onClick={() => deliver(order.id)}>تم التسليم</button>
              <button disabled={order.paymentStatus === "PAID"} onClick={() => pay(order.id, "CASH")}>دفع كاش</button>
              <button disabled={order.paymentStatus === "PAID"} onClick={() => pay(order.id, "VISA")}>دفع فيزا</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
