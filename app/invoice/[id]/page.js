import { prisma } from "@/lib/db";
import { includeOrderDetails, serializeOrder } from "@/lib/orders";
import InvoicePrint from "./InvoicePrint";

export default async function InvoicePage({ params }) {
  const { id } = await params;
  const order = await prisma.order.findUnique({
    where: { id },
    include: includeOrderDetails(),
  });

  if (!order) {
    return <div className="invoice">Invoice not found</div>;
  }

  return <InvoicePrint order={serializeOrder(order)} />;
}
