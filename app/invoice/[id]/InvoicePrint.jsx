"use client";

import { useEffect } from "react";

export default function InvoicePrint({ order }) {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 700);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="invoice">
      <div className="invoice-head">
        <img src="/bb-logo.png" alt="Billy Beez" className="invoice-logo" />
        <div className="invoice-title">
          <h1>BDS MOT Invoice</h1>
          <div className="muted">{new Date(order.createdAt).toLocaleString()}</div>
        </div>
      </div>
      <div className="panel">
        <div>Order ID: <b>{order.id}</b></div>
        <div>Bracelet: <b>{order.braceletNo}</b></div>
        <div>Phone: <b>{order.customerPhone || "-"}</b></div>
        <div>Children: <b>{order.childNames}</b></div>
        <div>Cashier: <b>{order.cashier}</b></div>
        <div>Payment: <b>{order.paymentMethod}</b></div>
        <div>Order Total: <b>{order.total} EGP</b></div>
      </div>
      <div className="panel">
        {order.items.map((item) => (
          <div className="row" key={item.id}>
            <span>{item.name} x {item.qty}</span>
            <b>{item.total} EGP</b>
          </div>
        ))}
        <div className="row invoice-total"><span>Order Total</span><b>{order.total} EGP</b></div>
      </div>
      <button className="no-print" onClick={() => window.print()}>Print</button>
    </div>
  );
}
