import { prisma } from "@/lib/db";
import { serializeHistoryOrder } from "@/lib/business-day";
import { includeOrderDetails, serializeOrder } from "@/lib/orders";
import InvoicePrint from "./InvoicePrint";

export default async function InvoicePage({ params }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: includeOrderDetails(),
  });

  if (order) {
    return <InvoicePrint order={serializeOrder(order)} />;
  }

  const historyOrder = await prisma.orderHistory.findUnique({
    where: { originalOrderId: id },
  });

  if (!historyOrder) {
    return <div className="invoice">Invoice not found</div>;
  }

  return <InvoicePrint order={serializeHistoryOrder(historyOrder)} />;
}
