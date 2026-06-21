"use client";

import { useEffect } from "react";

export default function InvoicePrint({ order }) {
  useEffect(() => {
    const timer = setTimeout(() => window.print(), 700);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="invoice">
      <h1>BillyBeez Data System MOT</h1>
      <div className="panel">
        <div>Order ID: <b>{order.id}</b></div>
        <div>Bracelet: <b>{order.braceletNo}</b></div>
        <div>Children: <b>{order.childNames}</b></div>
        <div>Cashier: <b>{order.cashier}</b></div>
        <div>Payment: <b>{order.paymentMethod}</b></div>
      </div>
      <div className="panel">
        {order.items.map((item) => (
          <div className="row" key={item.id}>
            <span>{item.name} x {item.qty}</span>
            <b>{item.total} EGP</b>
          </div>
        ))}
        <div className="row"><span>Total</span><b>{order.total} EGP</b></div>
      </div>
      <button className="no-print" onClick={() => window.print()}>Print</button>
    </div>
  );
}
