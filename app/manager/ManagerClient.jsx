"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "../ToastProvider";

export default function ManagerClient() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [viewMode, setViewMode] = useState("TODAY");
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

  function localDateKey(value) {
    if (!value) return "";

    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value.slice(0, 10);
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function filterDateFor(order) {
    if (viewMode === "HISTORY") {
      return localDateKey(order.closedAt || order.archivedAt || order.businessDate || order.createdAt);
    }

    return localDateKey(order.businessDate || order.createdAt);
  }

  function orderAlertClass(order) {
    if (!order.customerLeft || order.archivedAt) return "";
    if (order.paymentStatus !== "PAID") return "left-unpaid";
    return "needs-system";
  }

  const currentArchivedOrders = useMemo(
    () => (data?.orders || []).filter((order) => order.archivedAt).map((order) => ({ ...order, isCurrentArchive: true })),
    [data],
  );

  const historyRows = useMemo(
    () => [...currentArchivedOrders, ...(data?.orderHistory || [])],
    [currentArchivedOrders, data],
  );

  const visibleOrders = useMemo(() => {
    let rows = viewMode === "HISTORY" ? historyRows : data?.orders || [];

    if (filter === "UNPAID") rows = rows.filter((order) => order.paymentStatus !== "PAID");
    if (filter === "CASH" || filter === "VISA") rows = rows.filter((order) => order.paymentStatus === "PAID" && order.paymentMethod === filter);
    if (viewMode === "TODAY" && archiveFilter === "ACTIVE") rows = rows.filter((order) => !order.archivedAt);
    if (viewMode === "TODAY" && archiveFilter === "ARCHIVED") rows = rows.filter((order) => order.archivedAt);

    const search = query.trim().toLowerCase();
    if (search) {
      rows = rows.filter((order) => [
        order.id,
        order.businessDate,
        order.braceletNo,
        order.customerPhone,
        order.childNames,
        order.cashier,
        order.dataEmployee,
      ].some((value) => String(value || "").toLowerCase().includes(search)));
    }

    if (fromDate) {
      rows = rows.filter((order) => filterDateFor(order) >= fromDate);
    }

    if (toDate) {
      rows = rows.filter((order) => filterDateFor(order) <= toDate);
    }

    return rows;
  }, [data, viewMode, historyRows, filter, archiveFilter, query, fromDate, toDate]);

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

  const selectedIsActiveOrder = selectedOrder && !selectedOrder.isHistory && !selectedOrder.archivedAt;
  const selectedIsArchivedOrder = selectedOrder && !selectedOrder.isHistory && selectedOrder.archivedAt;

  return (
    <>
      <section className="grid five">
        <Metric label="Total Paid Sales" value={`${data.totalSales} EGP`} />
        <Metric label="Orders" value={data.ordersCount} />
        <Metric label="Unpaid" value={data.unpaidOrders} />
        <Metric label="Left Unpaid" value={data.leftUnpaid} />
        <Metric label="History" value={historyRows.length} />
      </section>

      <section className="panel">
        <div className="row">
          <div>
            <h2>{viewMode === "HISTORY" ? "Order History" : "Today Orders"}</h2>
            <div className="muted">
              Business day: {data.businessState?.businessDate || "Closed"} · {data.businessState?.message}
              {data.businessState?.closedOrderCount ? ` · Auto-closed ${data.businessState.closedOrderCount} orders` : ""}
            </div>
          </div>
          <div className="actions">
            <button className={viewMode === "TODAY" ? "secondary" : ""} onClick={() => setViewMode("TODAY")}>Today</button>
            <button className={viewMode === "HISTORY" ? "secondary" : ""} onClick={() => setViewMode("HISTORY")}>Order History</button>
          </div>
        </div>
        <div className="tabs">
          {["ALL", "CASH", "VISA", "UNPAID"].map((item) => (
            <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>
          ))}
        </div>
        {viewMode === "TODAY" && <div className="tabs">
          {["ALL", "ACTIVE", "ARCHIVED"].map((item) => (
            <button key={item} className={archiveFilter === item ? "active" : ""} onClick={() => setArchiveFilter(item)}>{item}</button>
          ))}
        </div>}
        <div className="form-grid">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search order, bracelet, phone, child, cashier, day" />
          <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          <button className="secondary" onClick={() => { setQuery(""); setFromDate(""); setToDate(""); }}>Clear Filters</button>
        </div>
        <div className="row"><span>Visible orders</span><b>{visibleOrders.length}</b></div>
        <div className="grid three honey-grid">
          {visibleOrders.map((order) => (
            <div className={`card order-cell ${orderAlertClass(order)}`} key={order.id}>
              <div className="row">
                <b>{order.id}</b>
                <span className={`badge ${order.paymentStatus === "PAID" ? "paid" : "unpaid"}`}>{order.paymentStatus}</span>
              </div>
              {viewMode === "HISTORY" && <div className="meta-line"><span>Business Day</span><b>{order.businessDate}</b></div>}
              <div className="meta-line"><span>Bracelet</span><b>{order.braceletNo}</b></div>
              <div className="meta-line"><span>Phone</span><b>{order.customerPhone || "-"}</b></div>
              <div className="meta-line"><span>Children</span><b>{order.childNames}</b></div>
              <div className="meta-line"><span>Method</span><b>{order.paymentMethod}</b></div>
              {order.customerLeft && order.paymentStatus !== "PAID" && <div className="warning warning-orange">العميل خرج ولسه متعملش تم الدفع</div>}
              {order.customerLeft && order.paymentStatus === "PAID" && !order.archivedAt && <div className="warning">العميل خرج ولسه متسجلش على السيستم</div>}
              {viewMode === "HISTORY" && order.closedAt && <div className="meta-line"><span>Closed</span><b>{new Date(order.closedAt).toLocaleString()}</b></div>}
              {viewMode === "HISTORY" && !order.closedAt && order.archivedAt && <div className="meta-line"><span>Archived</span><b>{new Date(order.archivedAt).toLocaleString()}</b></div>}
              <div className="summary">
                {(order.items || []).length === 0 ? (
                  <div className="muted">No items</div>
                ) : order.items.map((item) => (
                  <div className="row" key={item.id}>
                    <span>{item.name} x {item.qty}</span>
                    <b>{item.total} EGP</b>
                  </div>
                ))}
                <div className="row order-total-row"><span>Order Total</span><b>{order.total} EGP</b></div>
              </div>
              <div className="actions">
                <button onClick={() => setSelectedOrder(order)}>Details</button>
                {order.archivedAt && !order.isHistory && <button className="btn-unarchive" onClick={() => runOrderAction(order.id, "unarchive")}>إلغاء الأرشفة</button>}
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
        <div className="modal-backdrop" onClick={() => setSelectedOrder(null)}>
          <div className="detail-modal" role="dialog" aria-modal="true" aria-label="Order details" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <h2>{selectedOrder.id}</h2>
                <div className="muted">{selectedOrder.braceletNo} · {selectedOrder.paymentStatus} / {selectedOrder.paymentMethod}</div>
              </div>
              <button className="secondary" onClick={() => setSelectedOrder(null)}>Close</button>
            </div>
            <div className="grid two">
              <div className="meta-line"><span>Bracelet</span><b>{selectedOrder.braceletNo}</b></div>
              {(selectedOrder.isHistory || selectedOrder.isCurrentArchive) && <div className="meta-line"><span>Business Day</span><b>{selectedOrder.businessDate}</b></div>}
              <div className="meta-line"><span>Phone</span><b>{selectedOrder.customerPhone || "-"}</b></div>
              <div className="meta-line"><span>Children</span><b>{selectedOrder.childNames}</b></div>
              <div className="meta-line"><span>Cashier</span><b>{selectedOrder.cashier}</b></div>
              <div className="meta-line"><span>Employee</span><b>{selectedOrder.dataEmployee}</b></div>
              <div className="meta-line"><span>Kitchen</span><b>{selectedOrder.kitchenStatus}</b></div>
              <div className="meta-line"><span>Payment</span><b>{selectedOrder.paymentStatus} / {selectedOrder.paymentMethod}</b></div>
              <div className="meta-line"><span>Status</span><b>{selectedOrder.status}</b></div>
              <div className="meta-line"><span>Archived</span><b>{selectedOrder.archivedAt ? "Yes" : "No"}</b></div>
              {selectedOrder.closedAt && <div className="meta-line"><span>Closed At</span><b>{new Date(selectedOrder.closedAt).toLocaleString()}</b></div>}
              {selectedOrder.archivedAt && <div className="meta-line"><span>Archived At</span><b>{new Date(selectedOrder.archivedAt).toLocaleString()}</b></div>}
            </div>
            <div className="detail-items">
              {selectedOrder.items.map((item) => (
                <div className="row" key={item.id}><span>{item.name} x {item.qty}</span><b>{item.total} EGP</b></div>
              ))}
              <div className="row"><span>Order Total</span><b>{selectedOrder.total} EGP</b></div>
            </div>
            {selectedOrder.customerLeft && selectedOrder.paymentStatus !== "PAID" && <div className="warning warning-orange">العميل خرج ولسه متعملش تم الدفع</div>}
            {selectedOrder.customerLeft && selectedOrder.paymentStatus === "PAID" && !selectedOrder.archivedAt && <div className="warning">العميل خرج ولسه متسجلش على السيستم</div>}
            <div className="actions">
              {selectedIsActiveOrder && <button className="btn-pay-cash" onClick={() => payOrder(selectedOrder.id, "CASH")}>Set Cash Paid</button>}
              {selectedIsActiveOrder && <button className="btn-pay-visa" onClick={() => payOrder(selectedOrder.id, "VISA")}>Set Visa Paid</button>}
              {selectedIsActiveOrder && <button className="btn-deliver" onClick={() => runOrderAction(selectedOrder.id, "deliver")}>Mark Delivered</button>}
              {selectedIsActiveOrder && <button className="btn-exit" disabled={selectedOrder.customerLeft} onClick={() => runOrderAction(selectedOrder.id, "left")}>Mark Customer Left</button>}
              {selectedIsActiveOrder && (
                <button
                  className="btn-system"
                  disabled={selectedOrder.kitchenStatus !== "DELIVERED" || selectedOrder.paymentStatus !== "PAID"}
                  onClick={() => runOrderAction(selectedOrder.id, "archive")}
                >
                  Archive
                </button>
              )}
              {selectedIsArchivedOrder && <button className="btn-unarchive" onClick={() => runOrderAction(selectedOrder.id, "unarchive")}>إلغاء الأرشفة</button>}
              <button className="secondary" onClick={() => window.open(`/invoice/${selectedOrder.id}`, "_blank")}>Print Invoice</button>
            </div>
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
