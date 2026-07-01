"use client";

import { useEffect } from "react";
import { useI18n } from "../../i18n";

export default function InvoicePrint({ order, settings = {} }) {
  const { t, formatNumber, labelMethod, formatDateTime } = useI18n();
  const printedAt = formatDateTime(order.createdAt);
  const receiptAmount = (amount) => formatNumber(amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const showTax = ["1", "true", "yes", "on"].includes(String(settings.showTax || "").toLowerCase());
  const taxRate = Number(settings.taxRate) || 0;
  const taxAmount = showTax ? order.total * (taxRate / 100) : 0;

  useEffect(() => {
    const timer = setTimeout(() => window.print(), 700);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="invoice">
      <div className="invoice-logo-wrap">
        <img src={settings.logoUrl || "/bb-logo.png"} alt="Billy Beez" className="invoice-logo" />
      </div>
      <div className="receipt-center">
        <b>{t("invoice.welcome")}</b>
        <div>{settings.companyName || t("invoice.company")}</div>
        <div>{settings.branchName || t("invoice.company")}</div>
        {settings.branchAddress && <div>{settings.branchAddress}</div>}
        {settings.posName && <div>{settings.posName}</div>}
        <div>{t("invoice.tin")}: {settings.branchTin || "474-214-206"}</div>
      </div>

      <div className="receipt-rule" />

      <div className="receipt-meta">
        <span>{t("common.orderId")}</span><b>{order.id}</b>
        <span>{t("common.bracelet")}</span><b>{order.braceletNo}</b>
        <span>{t("invoice.date")}</span><b>{printedAt}</b>
        {order.customerPhone && <><span>{t("common.phone")}</span><b>{order.customerPhone}</b></>}
        <span>{t("common.children")}</span><b>{order.childNames}</b>
        <span>{t("common.cashier")}</span><b>{order.cashier || "-"}</b>
        {order.dataEmployee && <><span>{t("common.employee")}</span><b>{order.dataEmployee}</b></>}
        {order.exitEmployee && <><span>{t("common.exitEmployee")}</span><b>{order.exitEmployee}</b></>}
        {order.paymentEmployee && <><span>{t("common.paymentEmployee")}</span><b>{order.paymentEmployee}</b></>}
        <span>{t("common.payment")}</span><b>{labelMethod(order.paymentMethod)}</b>
        {order.geideaRegisteredAt && (
          <>
            <span>{t("common.geideaRegisteredBy")}</span>
            <b>{order.geideaEmployee || "-"} · {formatDateTime(order.geideaRegisteredAt)}</b>
          </>
        )}
      </div>

      <div className="receipt-rule" />

      <div className="receipt-items">
        <div className="receipt-item receipt-item-head">
          <span>{t("invoice.item")}</span>
          <span>{t("common.qty")}</span>
          <span>{t("invoice.rate")}</span>
          <span>{t("invoice.amount")}</span>
        </div>
        {order.items.map((item) => (
          <div className="receipt-item" key={item.id}>
            <span>{item.name}</span>
            <span>{formatNumber(item.qty)}</span>
            <span>{receiptAmount(item.price)}</span>
            <b>{receiptAmount(item.total)}</b>
          </div>
        ))}
      </div>

      <div className="receipt-rule" />

      <div className="receipt-totals">
        <span>{t("invoice.subtotal")}</span><b>{receiptAmount(order.total)}</b>
        {showTax && <><span>VAT {receiptAmount(taxRate)}%</span><b>{receiptAmount(taxAmount)}</b></>}
        <span>{t("common.orderTotal")}</span><b>{receiptAmount(order.total)}</b>
      </div>

      <div className="receipt-rule" />

      <div className="receipt-footer">
        <div>{t("invoice.points")}: Billy Beez</div>
        <div>{settings.footerMessage || t("invoice.thanks")}</div>
        <div>{t("invoice.contact")}: {settings.contactNumber || settings.branchPhone || "19881"}</div>
        {settings.website && <div>{settings.website}</div>}
      </div>
      <button className="no-print" onClick={() => window.print()}>{t("common.print")}</button>
    </div>
  );
}
