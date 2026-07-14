"use client";

import { useEffect } from "react";
import { useI18n } from "../../i18n";

const defaultInvoiceLayout = {
  paperSize: "80mm",
  logoUrl: "/bb-logo.png",
  footerMessage: "",
  fontSize: 11,
  lineHeight: 1.25,
  logoWidthMm: 38,
  qrSizeMm: 34,
  showLogo: true,
  showCompany: true,
  showBranch: true,
  showTin: true,
  showSerial: true,
  showOrderId: true,
  showBracelet: true,
  showCustomer: true,
  showPhone: true,
  showChildren: true,
  showCashier: true,
  showEmployee: true,
  showPayment: true,
  showSystemRegistration: true,
  showTax: false,
  showQr: true,
  showFooter: true,
};

function boolSetting(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function paperWidth(size) {
  if (size === "A4") return "190mm";
  if (size === "58mm") return "58mm";
  return "80mm";
}

function invoiceLayoutKey(order) {
  if (order.deviceType === "FRONT") return "front";
  if (order.deviceType === "KITCHEN_CASHIER") return "restaurant";
  return "data";
}

function parseInvoiceLayouts(value) {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export default function InvoicePrint({ order, settings = {} }) {
  const { t, formatNumber, labelMethod, formatDateTime } = useI18n();
  const printedAt = formatDateTime(order.createdAt);
  const receiptAmount = (amount) => formatNumber(amount, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const layouts = parseInvoiceLayouts(settings.layoutConfig);
  const layout = { ...defaultInvoiceLayout, ...(layouts[invoiceLayoutKey(order)] || {}) };
  const showTax = boolSetting(layout.showTax, boolSetting(settings.showTax));
  const taxRate = Number(settings.taxRate) || 0;
  const taxAmount = showTax ? order.total * (taxRate / 100) : 0;
  const invoiceStyle = {
    "--invoice-width": paperWidth(layout.paperSize || settings.paperSize),
    "--invoice-font-size": `${Number(layout.fontSize) || 11}px`,
    "--invoice-line-height": Number(layout.lineHeight) || 1.25,
    "--invoice-logo-width": `${Number(layout.logoWidthMm) || 38}mm`,
    "--invoice-qr-size": `${Number(layout.qrSizeMm) || 34}mm`,
  };
  const logoUrl = layout.logoUrl || settings.logoUrl || "/bb-logo.png";
  const footerMessage = layout.footerMessage || settings.footerMessage || t("invoice.thanks");

  useEffect(() => {
    const timer = setTimeout(() => window.print(), 700);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="invoice" style={invoiceStyle}>
      {layout.showLogo && <div className="invoice-logo-wrap">
        <img src={logoUrl} alt="Billy Beez" className="invoice-logo" width="456" height="140" />
      </div>}
      <div className="receipt-center">
        {layout.showCompany && <><b>{t("invoice.welcome")}</b><div>{settings.companyName || t("invoice.company")}</div></>}
        {layout.showBranch && <div>{settings.branchName || t("invoice.company")}</div>}
        {layout.showBranch && settings.branchAddress && <div>{settings.branchAddress}</div>}
        {settings.posName && <div>{settings.posName}</div>}
        {layout.showTin && <div>{t("invoice.tin")}: {settings.branchTin || "474-214-206"}</div>}
      </div>

      <div className="receipt-rule" />

      <div className="receipt-meta">
        {layout.showSerial && order.invoiceSerial && <><span>{t("invoice.serial")}</span><b>{order.invoiceSerial}</b></>}
        {layout.showOrderId && <><span>{t("common.orderId")}</span><b>{order.id}</b></>}
        {layout.showBracelet && <><span>{t("common.bracelet")}</span><b>{order.braceletNo}</b></>}
        <span>{t("invoice.date")}</span><b>{printedAt}</b>
        {layout.showCustomer && order.customerName && <><span>{t("common.customer")}</span><b>{order.customerName}</b></>}
        {layout.showPhone && order.customerPhone && <><span>{t("common.phone")}</span><b>{order.customerPhone}</b></>}
        {layout.showChildren && <><span>{t("common.children")}</span><b>{order.childNames}</b></>}
        {layout.showCashier && <><span>{t("common.cashier")}</span><b>{order.cashier || "-"}</b></>}
        {layout.showEmployee && order.dataEmployee && <><span>{t("common.employee")}</span><b>{order.dataEmployee}</b></>}
        {order.exitEmployee && <><span>{t("common.exitEmployee")}</span><b>{order.exitEmployee}</b></>}
        {order.paymentEmployee && <><span>{t("common.paymentEmployee")}</span><b>{order.paymentEmployee}</b></>}
        {layout.showPayment && <><span>{t("common.payment")}</span><b>{labelMethod(order.paymentMethod)}</b></>}
        {layout.showSystemRegistration && order.geideaRegisteredAt && (
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

      {layout.showQr && settings.qrDataUrl && (
        <>
          <div className="receipt-qr">
            <img src={settings.qrDataUrl} alt={t("invoice.qrCode")} width="132" height="132" />
            <span>{t("invoice.qrCode")}</span>
          </div>
          <div className="receipt-rule" />
        </>
      )}

      {layout.showFooter && <div className="receipt-footer">
        <div>{t("invoice.points")}: Billy Beez</div>
        <div>{footerMessage}</div>
        <div>{t("invoice.contact")}: {settings.contactNumber || settings.branchPhone || "19881"}</div>
        {settings.website && <div>{settings.website}</div>}
      </div>}
      <button className="no-print" onClick={() => window.print()}>{t("common.print")}</button>
    </div>
  );
}
