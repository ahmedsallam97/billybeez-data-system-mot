import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { serializeHistoryOrder } from "@/lib/business-day";
import { includeOrderDetails, routeOrderId, serializeOrder } from "@/lib/orders";
import { getSetting } from "@/lib/settings";
import InvoicePrint from "./InvoicePrint";

export default async function InvoicePage({ params }) {
  await requireUser(["ADMIN", "MANAGER", "CASHIER", "KITCHEN"]);

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  const order = await prisma.order.findUnique({
    where: { id },
    include: includeOrderDetails(),
  });
  const settings = {
    branchName: await getSetting("BRANCH_NAME", "BillyBeez MOA"),
    branchTin: await getSetting("BRANCH_TIN", "474-214-206"),
  };

  if (order) {
    return <InvoicePrint order={serializeOrder(order)} settings={settings} />;
  }

  const historyOrder = await prisma.orderHistory.findUnique({
    where: { originalOrderId: id },
  });

  if (!historyOrder) {
    return <div className="invoice">Invoice not found</div>;
  }

  return <InvoicePrint order={serializeHistoryOrder(historyOrder)} settings={settings} />;
}
