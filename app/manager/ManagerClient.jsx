"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "../ToastProvider";

export default function ManagerClient() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [archiveFilter, setArchiveFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedOrder, setSelectedOrder] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const res = await fetch("/api/dashboard");
    setData(await res.json());
  }

  const orders = useMemo(() => {
    let rows = data?.orders || [];

    if (filter === "UNPAID") rows = rows.filter((order) => order.paymentStatus !== "PAID");
    if (filter === "CASH" || filter === "VISA") rows = rows.filter((order) => order.paymentStatus === "PAID" && order.paymentMethod === filter);
    if (archiveFilter === "ACTIVE") rows = rows.filter((order) => !order.archivedAt);
    if (archiveFilter === "ARCHIVED") rows = rows.filter((order) => order.archivedAt);

    const search = query.trim().toLowerCase();
    if (search) {
      rows = rows.filter((order) => [
        order.id,
        order.braceletNo,
        order.childNames,
        order.cashier,
        order.dataEmployee,
      ].some((value) => String(value || "").toLowerCase().includes(search)));
    }

    if (fromDate) {
      rows = rows.filter((order) => new Date(order.createdAt) >= new Date(fromDate));
    }

    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      rows = rows.filter((order) => new Date(order.createdAt) <= end);
    }

    return rows;
  }, [data, filter, archiveFilter, query, fromDate, toDate]);

  async function payOrder(orderId, paymentMethod) {
    const res = await fetch(`/api/orders/${orderId}/pay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethod }),
    });
    const result = await res.json();
    if (result.success) {
      toast(`Payment saved as ${paymentMethod}`);
      setSelectedOrder(null);
      await load();
    } else {
      toast(result.error || "Payment update failed", "error");
    }
  }

  async function runOrderAction(orderId, action) {
    const res = await fetch(`/api/orders/${orderId}/${action}`, { method: "POST" });
    const result = await res.json();

    if (!result.success) {
      toast(result.error || "Order update failed", "error");
      return;
    }

    toast("Order updated");
    setSelectedOrder(null);
    await load();
  }

  if (!data) return <div className="panel">Loading...</div>;

  return (
    <>
      <section className="grid five">
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
        <div className="tabs">
          {["ALL", "ACTIVE", "ARCHIVED"].map((item) => (
            <button key={item} className={archiveFilter === item ? "active" : ""} onClick={() => setArchiveFilter(item)}>{item}</button>
          ))}
        </div>
        <div className="form-grid">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, bracelet, child, cashier" />
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          <button className="secondary" onClick={() => { setQuery(""); setFromDate(""); setToDate(""); }}>Clear Filters</button>
        </div>
        <div className="row"><span>Visible orders</span><b>{orders.length}</b></div>
        <div className="grid three honey-grid">
          {orders.map((order) => (
            <div className="card order-cell" key={order.id}>
              <div className="row">
                <b>{order.id}</b>
                <span className={`badge ${order.paymentStatus === "PAID" ? "paid" : "unpaid"}`}>{order.paymentStatus}</span>
              </div>
              <div className="meta-line"><span>Bracelet</span><b>{order.braceletNo}</b></div>
              <div className="meta-line"><span>Children</span><b>{order.childNames}</b></div>
              <div className="meta-line"><span>Method</span><b>{order.paymentMethod}</b></div>
              <div className="meta-line"><span>Total</span><b>{order.total} EGP</b></div>
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
          <MiniBars rows={data.paymentBreakdown} labelKey="method" valueKey="total" />
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
        <Report title="Employees" rows={data.dataEmployeePerformance} labelKey="name" valueKey="total" suffix=" EGP" />
        <Report title="Top Bracelets" rows={data.topBracelets} labelKey="bracelet" valueKey="total" suffix=" EGP" />
      </section>

      <section className="panel">
        <h3>Daily Sales</h3>
        <MiniBars rows={data.dailySales} labelKey="date" valueKey="total" />
      </section>

      <section className="panel">
        <h3>Recent Activity</h3>
        {(data.auditLogs || []).length === 0 ? (
          <div className="muted">No activity yet</div>
        ) : data.auditLogs.map((log) => (
          <div className="activity-row" key={log.id}>
            <span className="activity-dot" />
            <div>
              <b>{log.summary || log.action}</b>
              <div className="muted">{log.user} · {log.orderId || "No order"} · {new Date(log.createdAt).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </section>

      {selectedOrder && (
        <div className="panel">
          <h2>{selectedOrder.id}</h2>
          <div className="grid two">
            <div className="meta-line"><span>Bracelet</span><b>{selectedOrder.braceletNo}</b></div>
            <div className="meta-line"><span>Children</span><b>{selectedOrder.childNames}</b></div>
            <div className="meta-line"><span>Cashier</span><b>{selectedOrder.cashier}</b></div>
            <div className="meta-line"><span>Employee</span><b>{selectedOrder.dataEmployee}</b></div>
            <div className="meta-line"><span>Kitchen</span><b>{selectedOrder.kitchenStatus}</b></div>
            <div className="meta-line"><span>Payment</span><b>{selectedOrder.paymentStatus} / {selectedOrder.paymentMethod}</b></div>
            <div className="meta-line"><span>Status</span><b>{selectedOrder.status}</b></div>
            <div className="meta-line"><span>Archived</span><b>{selectedOrder.archivedAt ? "Yes" : "No"}</b></div>
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
            <button className="secondary" onClick={() => runOrderAction(selectedOrder.id, "deliver")}>Mark Delivered</button>
            <button className="danger" onClick={() => runOrderAction(selectedOrder.id, "left")}>Mark Customer Left</button>
            <button
              className="secondary"
              disabled={selectedOrder.kitchenStatus !== "DELIVERED" || selectedOrder.paymentStatus !== "PAID"}
              onClick={() => runOrderAction(selectedOrder.id, "archive")}
            >
              Archive
            </button>
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

function MiniBars({ rows, labelKey, valueKey }) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 1);

  return (
    <div className="stack">
      {rows.map((row) => {
        const value = Number(row[valueKey]) || 0;
        return (
          <div className="bar-row" key={row[labelKey]}>
            <span>{row[labelKey]}</span>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(4, (value / max) * 100)}%` }} /></div>
            <b>{value}</b>
          </div>
        );
      })}
    </div>
  );
}
