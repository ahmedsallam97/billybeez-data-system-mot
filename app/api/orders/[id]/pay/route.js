import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { ensureBusinessDayState } from "@/lib/business-day";
import { routeOrderId } from "@/lib/orders";

export async function POST(request, { params }) {
  const { user, error } = await authorizeApi("ORDER_PAY");
  if (error) return error;

  const { id: rawId } = await params;
  const id = routeOrderId(rawId);
  await ensureBusinessDayState();
  const body = await request.json();
  const paymentMethod = body.paymentMethod === "VISA" ? "VISA" : "CASH";
  const paymentEmployeeId = String(body.paymentEmployeeId || "");
  const current = await prisma.order.findUnique({ where: { id } });

  if (!current) {
    return NextResponse.json({ success: false, error: "Order not found" }, { status: 404 });
  }

  let paymentEmployee = null;

  if (paymentEmployeeId) {
    paymentEmployee = await prisma.employee.findFirst({
      where: {
        id: paymentEmployeeId,
        active: true,
        department: "RESTAURANT",
      },
    });
  }

  if (user.role === "KITCHEN" && !paymentEmployee) {
    return NextResponse.json({ success: false, error: "Restaurant employee is required" }, { status: 400 });
  }

  const order = await prisma.order.update({
    where: { id },
    data: current.paymentStatus === "PAID" && user.role === "KITCHEN"
      ? { paymentEmployeeId: paymentEmployee?.id || current.paymentEmployeeId }
      : {
          paymentStatus: "PAID",
          paymentMethod,
          status: "PAID",
          paymentEmployeeId: paymentEmployee?.id || current.paymentEmployeeId,
        },
  });

  await writeAudit({
    action: "ORDER_PAID",
    orderId: id,
    user,
    summary: `Marked paid by ${paymentMethod}`,
    metadata: {
      paymentMethod: order.paymentMethod,
      total: order.total,
      paymentEmployee: paymentEmployee?.name || null,
      employeeOnlyUpdate: current.paymentStatus === "PAID" && user.role === "KITCHEN",
    },
  });

  return NextResponse.json({ success: true });
}
