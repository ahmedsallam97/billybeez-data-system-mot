import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { includeOrderDetails, routeOrderId, serializeOrder } from "@/lib/orders";
import KitchenTicketPrint from "./KitchenTicketPrint";

export default async function KitchenTicketPage({ params }) {
  await requireUser(["ADMIN", "MANAGER", "KITCHEN"]);

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  const order = await prisma.order.findUnique({
    where: { id },
    include: includeOrderDetails(),
  });

  if (!order) {
    return <div className="invoice">Kitchen ticket not found</div>;
  }

  return <KitchenTicketPrint order={serializeOrder(order)} />;
}
