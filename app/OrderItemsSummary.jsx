"use client";

import { formatCairoItemTime } from "./dateTime";

export default function OrderItemsSummary({ order, t, currency }) {
  const items = order.items || [];
  const paidAmount = Number(order.paidAmount || 0);
  const balanceDue = Number(order.balanceDue || 0);
  const showPaymentSplit = paidAmount > 0 || balanceDue > 0;

  return (
    <div className="summary">
      <div className="order-items">
        {items.length === 0 ? (
          <div className="muted">{t("common.noItems")}</div>
        ) : items.map((item) => (
          <div className="order-item-row" key={item.id || item.productId || item.name}>
            <b>{currency(item.total)}</b>
            <small>{formatCairoItemTime(item.createdAt)}</small>
            <span>{item.name} x {item.qty}</span>
          </div>
        ))}
      </div>
      <div className="row order-total-row"><span>{t("common.orderTotal")}</span><b>{currency(order.total)}</b></div>
      {showPaymentSplit && (
        <>
          <div className="row order-paid-row"><span>{t("common.paidAmount")}</span><b>{currency(paidAmount)}</b></div>
          <div className="row order-balance-row"><span>{t("common.balanceDue")}</span><b>{currency(balanceDue)}</b></div>
        </>
      )}
    </div>
  );
}
