"use client";

import { useEffect, useState } from "react";
import { useToast } from "../ToastProvider";

export default function KitchenClient() {
  const toast = useToast();
  const [orders, setOrders] = useState([]);
  const [showArchive, setShowArchive] = useState(false);

  useEffect(() => {
    load();
    const timer = setInterval(load, 8000);
    return () => clearInterval(timer);
  }, [showArchive]);

  async function load() {
    const res = await fetch(`/api/orders?archived=${showArchive}`);
    setOrders(await res.json());
  }

  async function deliver(orderId) {
    const res = await fetch(`/api/orders/${orderId}/deliver`, { method: "POST" });
    const data = await res.json();

    if (!data.success) {
      toast(data.error || "Delivery update failed", "error");
      return;
    }

    toast("Order marked delivered");
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
      toast(`Payment saved as ${paymentMethod}`);
      await load();
    } else if (invoiceWindow) {
      invoiceWindow.close();
      toast(data.error || "Payment failed", "error");
    }
  }

  async function archive(orderId) {
    const res = await fetch(`/api/orders/${orderId}/archive`, { method: "POST" });
    const data = await res.json();

    if (!data.success) {
      toast(data.error || "Archive failed", "error");
      return;
    }

    toast("Order archived");
    await load();
  }

  return (
    <section className="panel">
      <div className="row">
        <h2>{showArchive ? "Archive" : "Kitchen Orders"}</h2>
        <div className="actions">
          <button className={!showArchive ? "secondary" : ""} onClick={() => setShowArchive(false)}>Active</button>
          <button className={showArchive ? "secondary" : ""} onClick={() => setShowArchive(true)}>Archive</button>
        </div>
      </div>
      <div className="grid three honey-grid">
        {orders.map((order) => (
          <div className="card order-cell" key={order.id}>
            <div className="row">
              <b>{order.id}</b>
              <span className={`badge ${order.paymentStatus === "PAID" ? "paid" : "unpaid"}`}>{order.paymentStatus}</span>
            </div>
            <div className="meta-line"><span>Bracelet</span><b>{order.braceletNo}</b></div>
            <div className="meta-line"><span>Phone</span><b>{order.customerPhone || "-"}</b></div>
            <div className="meta-line"><span>Children</span><b>{order.childNames}</b></div>
            <div className="meta-line"><span>Order Total</span><b>{order.total} EGP</b></div>
            <div className="meta-line"><span>Kitchen</span><b>{order.kitchenStatus}</b></div>
            {order.customerLeft && order.paymentStatus !== "PAID" && <div className="warning">العميل خرج ولسه متعملش تم الدفع</div>}
            <div className="panel">
              {order.items.map((item) => (
                <div className="row" key={item.id}>
                  <span>{item.name} x {item.qty}</span>
                  <b>{item.total} EGP</b>
                </div>
              ))}
            </div>
            {showArchive ? (
              <div className="muted">Archived at: {order.archivedAt ? new Date(order.archivedAt).toLocaleString() : ""}</div>
            ) : (
              <div className="actions">
                <button disabled={order.kitchenStatus === "DELIVERED"} onClick={() => deliver(order.id)}>تم التسليم</button>
                <button disabled={order.paymentStatus === "PAID"} onClick={() => pay(order.id, "CASH")}>دفع كاش</button>
                <button disabled={order.paymentStatus === "PAID"} onClick={() => pay(order.id, "VISA")}>دفع فيزا</button>
                <button
                  className="secondary"
                  disabled={order.kitchenStatus !== "DELIVERED" || order.paymentStatus !== "PAID"}
                  onClick={() => archive(order.id)}
                >
                  تم تسجيل على السيستم
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
