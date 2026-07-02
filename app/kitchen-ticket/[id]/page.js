import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { includeOrderDetails, routeOrderId, serializeOrder } from "@/lib/orders";
import { getSetting } from "@/lib/settings";
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

  const ticketRules = await getSetting("KITCHEN_TICKET_CATEGORIES", "");

  return <KitchenTicketPrint order={serializeOrder(order)} ticketRules={ticketRules} />;
}
