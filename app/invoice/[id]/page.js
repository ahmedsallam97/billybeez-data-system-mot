import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { serializeHistoryOrder } from "@/lib/business-day";
import { includeOrderDetails, routeOrderId, serializeOrder } from "@/lib/orders";
import InvoicePrint from "./InvoicePrint";

export default async function InvoicePage({ params }) {
  await requireUser(["ADMIN", "MANAGER", "CASHIER", "KITCHEN"]);

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
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
