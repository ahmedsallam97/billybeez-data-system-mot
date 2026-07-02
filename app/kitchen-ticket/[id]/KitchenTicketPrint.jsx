"use client";

import { useEffect } from "react";
import { useI18n } from "../../i18n";
import { filterKitchenTicketItems } from "../../../lib/kitchen-ticket-rules";

export default function KitchenTicketPrint({ order, ticketRules }) {
  const { t, formatNumber, formatDateTime } = useI18n();
  const { matchedItems, items } = filterKitchenTicketItems(order.items || [], ticketRules);

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
        {items.length === 0 ? (
          <div className="receipt-center muted">{t("kitchenTicket.noMatchedItems")}</div>
        ) : items.map((item) => (
          <div className="kitchen-ticket-item" key={item.id}>
            <b>{formatNumber(item.qty)} x</b>
            <span>{item.name}</span>
          </div>
        ))}
      </div>

      <div className="receipt-rule" />

      <div className="receipt-center kitchen-ticket-note">
        {items.length === 0 ? t("kitchenTicket.noMatchedItems") : matchedItems.length ? t("kitchenTicket.filtered") : t("kitchenTicket.allItems")}
      </div>
      <button className="no-print" onClick={() => window.print()}>{t("common.print")}</button>
    </div>
  );
}
