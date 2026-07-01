"use client";

import { useEffect } from "react";
import { useI18n } from "../../i18n";

const kitchenCategoryPatterns = [
  /meal/i,
  /sandwich/i,
  /burger/i,
  /وجبات/,
  /وجبة/,
  /ساند/,
  /برجر/,
];

function isKitchenItem(item) {
  const category = `${item.categoryName || ""} ${item.name || ""}`;
  return kitchenCategoryPatterns.some((pattern) => pattern.test(category));
}

export default function KitchenTicketPrint({ order }) {
  const { t, formatNumber, formatDateTime } = useI18n();
  const matchedItems = (order.items || []).filter(isKitchenItem);
  const items = matchedItems.length ? matchedItems : (order.items || []);

  useEffect(() => {
    const timer = setTimeout(() => window.print(), 700);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="invoice kitchen-ticket">
      <div className="receipt-center">
        <img src="/bb-logo.png" alt="Billy Beez" className="kitchen-ticket-logo" />
        <h1>{t("kitchenTicket.title")}</h1>
        <b>{order.id}</b>
      </div>

      <div className="receipt-rule" />

      <div className="receipt-meta">
        <span>{t("common.bracelet")}</span><b>{order.braceletNo}</b>
        <span>{t("common.children")}</span><b>{order.childNames}</b>
        <span>{t("invoice.date")}</span><b>{formatDateTime(new Date())}</b>
        <span>{t("common.cashier")}</span><b>{order.cashier || "-"}</b>
      </div>

      <div className="receipt-rule" />

      <div className="kitchen-ticket-items">
        {items.map((item) => (
          <div className="kitchen-ticket-item" key={item.id}>
            <b>{formatNumber(item.qty)} x</b>
            <span>{item.name}</span>
          </div>
        ))}
      </div>

      <div className="receipt-rule" />

      <div className="receipt-center kitchen-ticket-note">
        {matchedItems.length ? t("kitchenTicket.filtered") : t("kitchenTicket.allItems")}
      </div>
      <button type="button" className="no-print" onClick={() => window.print()}>{t("common.print")}</button>
    </div>
  );
}
