"use client";

import { useEffect, useMemo, useState } from "react";

export default function ManagerClient() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch("/api/dashboard");
    setData(await res.json());
  }

  const orders = useMemo(() => {
    const rows = data?.orders || [];
    if (filter === "UNPAID") return rows.filter((order) => order.paymentStatus !== "PAID");
    if (filter === "CASH" || filter === "VISA") return rows.filter((order) => order.paymentStatus === "PAID" && order.paymentMethod === filter);
    return rows;
  }, [data, filter]);

  async function payOrder(orderId, paymentMethod) {
    const res = await fetch(`/api/orders/${orderId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethod }),
    });
    const result = await res.json();
    if (result.success) {
      setSelectedOrder(null);
      await load();
    }
  }

  if (!data) return <div className="panel">Loading...</div>;

  return (
    <>
      <section className="grid">
        <Metric label="Total Paid Sales" value={`${data.totalSales} EGP`} />
        <Metric label="Orders" value={data.ordersCount} />
        <Metric label="Unpaid" value={data.unpaidOrders} />
        <Metric label="Left Unpaid" value={data.leftUnpaid} />
        <Metric label="Archived" value={data.archivedOrders} />
      </section>

      <section className="panel">
        <div className="tabs">
          {["ALL", "CASH", "VISA", "UNPAID"].map((item) => (
            <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>
          ))}
        </div>
        <div className="grid three">
          {orders.map((order) => (
            <div className="card" key={order.id}>
              <div className="row">
                <b>{order.id}</b>
                <span className={`badge ${order.paymentStatus === "PAID" ? "paid" : "unpaid"}`}>{order.paymentStatus}</span>
              </div>
              <div>Bracelet: <b>{order.braceletNo}</b></div>
              <div>Children: <b>{order.childNames}</b></div>
              <div>Method: <b>{order.paymentMethod}</b></div>
              <div>Total: <b>{order.total} EGP</b></div>
              <div className="actions">
                <button onClick={() => setSelectedOrder(order)}>Details</button>
                <button className="secondary" onClick={() => window.open(`/invoice/${order.id}`, "_blank")}>Print</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid three">
        <div className="panel">
          <h3>Payment Breakdown</h3>
          {data.paymentBreakdown.map((row) => (
            <div className="row" key={row.method}><span>{row.method} ({row.count})</span><b>{row.total} EGP</b></div>
          ))}
        </div>
        <div className="panel">
          <h3>Top Products</h3>
          {data.topProducts.map((product) => (
            <div className="row" key={product.name}><span>{product.name}</span><b>{product.total} EGP</b></div>
          ))}
        </div>
        <div className="panel">
          <h3>Status Breakdown</h3>
          {data.statusBreakdown.map((row) => (
            <div className="row" key={row.status}><span>{row.status}</span><b>{row.count}</b></div>
          ))}
        </div>
      </section>

      <section className="grid three">
        <Report title="Cashier Performance" rows={data.cashierPerformance} labelKey="name" valueKey="total" suffix=" EGP" />
        <Report title="Data Employees" rows={data.dataEmployeePerformance} labelKey="name" valueKey="total" suffix=" EGP" />
        <Report title="Top Bracelets" rows={data.topBracelets} labelKey="bracelet" valueKey="total" suffix=" EGP" />
      </section>

      {selectedOrder && (
        <div className="panel">
          <h2>{selectedOrder.id}</h2>
          <div className="grid two">
            <div>Bracelet: <b>{selectedOrder.braceletNo}</b></div>
            <div>Children: <b>{selectedOrder.childNames}</b></div>
            <div>Cashier: <b>{selectedOrder.cashier}</b></div>
            <div>Data Employee: <b>{selectedOrder.dataEmployee}</b></div>
            <div>Kitchen: <b>{selectedOrder.kitchenStatus}</b></div>
            <div>Payment: <b>{selectedOrder.paymentStatus} / {selectedOrder.paymentMethod}</b></div>
            <div>Status: <b>{selectedOrder.status}</b></div>
            <div>Archived: <b>{selectedOrder.archivedAt ? "Yes" : "No"}</b></div>
          </div>
          <div className="panel">
            {selectedOrder.items.map((item) => (
              <div className="row" key={item.id}><span>{item.name} x {item.qty}</span><b>{item.total} EGP</b></div>
            ))}
            <div className="row"><span>Total</span><b>{selectedOrder.total} EGP</b></div>
          </div>
          <div className="actions">
            <button onClick={() => payOrder(selectedOrder.id, "CASH")}>Set Cash Paid</button>
            <button onClick={() => payOrder(selectedOrder.id, "VISA")}>Set Visa Paid</button>
            <button className="secondary" onClick={() => window.open(`/invoice/${selectedOrder.id}`, "_blank")}>Print Invoice</button>
            <button className="danger" onClick={() => setSelectedOrder(null)}>Close</button>
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

function Report({ title, rows, labelKey, valueKey, suffix = "" }) {
  return (
    <div className="panel">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <div className="muted">No data</div>
      ) : rows.slice(0, 8).map((row) => (
        <div className="row" key={row[labelKey]}>
          <span>{row[labelKey]}</span>
          <b>{row[valueKey]}{suffix}</b>
        </div>
      ))}
    </div>
  );
}
