const QRCode = require("qrcode");

function absoluteUrl(baseUrl, path) {
  const cleanBase = String(baseUrl || "http://127.0.0.1:3000").replace(/\/+$/, "");
  const cleanPath = String(path || "/").startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

function invoiceQrPayload(order, settings = {}) {
  if (settings.qrMode === "ETA" && order.etaQrCode) return order.etaQrCode;
  if (settings.qrMode === "BOTH" && order.etaQrCode) return order.etaQrCode;

  const invoicePath = order.internalQrPayload || `/invoice/${encodeURIComponent(order.id)}`;
  return absoluteUrl(settings.baseUrl, invoicePath);
}

async function invoiceQrDataUrl(order, settings = {}) {
  const payload = invoiceQrPayload(order, settings);
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 180,
    color: {
      dark: "#111111",
      light: "#ffffff",
    },
  });
}

module.exports = {
  absoluteUrl,
  invoiceQrDataUrl,
  invoiceQrPayload,
};
