import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { serializeHistoryOrder } from "@/lib/business-day";
import { includeOrderDetails, routeOrderId, serializeOrder } from "@/lib/orders";
import { invoiceQrDataUrl } from "@/lib/invoice-qr";
import { getSetting } from "@/lib/settings";
import InvoicePrint from "./InvoicePrint";

export default async function InvoicePage({ params }) {
  await requireUser(["ADMIN", "MANAGER", "CASHIER", "KITCHEN", "DATA"]);

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  const order = await prisma.order.findUnique({
    where: { id },
    include: includeOrderDetails(),
  });
  const settings = {
    companyName: await getSetting("COMPANY_NAME", "BillyBeez"),
    branchName: await getSetting("BRANCH_NAME", "BillyBeez MOA"),
    branchAddress: await getSetting("BRANCH_ADDRESS", ""),
    branchPhone: await getSetting("BRANCH_PHONE", "19881"),
    branchTin: await getSetting("BRANCH_TIN", "474-214-206"),
    posName: await getSetting("POS_NAME", "BDS MOT POS"),
    logoUrl: await getSetting("INVOICE_LOGO_URL", "/bb-logo.png"),
    footerMessage: await getSetting("INVOICE_FOOTER_MESSAGE", "Thanks for making memories with us!"),
    showTax: await getSetting("INVOICE_SHOW_TAX", "false"),
    taxRate: await getSetting("INVOICE_TAX_RATE", "14"),
    contactNumber: await getSetting("INVOICE_CONTACT_NUMBER", "19881"),
    website: await getSetting("INVOICE_WEBSITE", "www.billybeezeg.com"),
    qrMode: await getSetting("ETA_QR_MODE", "INTERNAL"),
    baseUrl: await getSetting("PUBLIC_APP_BASE_URL", "http://127.0.0.1:3000"),
    layoutConfig: await getSetting("INVOICE_LAYOUT_CONFIG", ""),
  };

  if (order) {
    const serializedOrder = serializeOrder(order);
    return <InvoicePrint order={serializedOrder} settings={{ ...settings, qrDataUrl: await invoiceQrDataUrl(serializedOrder, settings) }} />;
  }

  const historyOrder = await prisma.orderHistory.findUnique({
    where: { originalOrderId: id },
  });

  if (!historyOrder) {
    return <div className="invoice">Invoice not found</div>;
  }

  const serializedHistoryOrder = serializeHistoryOrder(historyOrder);
  return <InvoicePrint order={serializedHistoryOrder} settings={{ ...settings, qrDataUrl: await invoiceQrDataUrl(serializedHistoryOrder, settings) }} />;
}
