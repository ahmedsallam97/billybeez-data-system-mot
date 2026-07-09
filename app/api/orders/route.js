import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { assertActiveBraceletAvailable, claimActiveBracelet, isBraceletLockConflict } from "@/lib/active-bracelets";
import { ensureBusinessDayState } from "@/lib/business-day";
import { actorFields, upsertOrderRecord } from "@/lib/order-records";
import { buildOrderId, includeOrderDetails, serializeOrder, validateBracelet, validateCustomerPhone } from "@/lib/orders";
import { getSetting } from "@/lib/settings";
import { isDataDepartment } from "@/lib/employee-departments";
import { enumValue, jsonValidationResponse, optionalString, requireArray, requireString } from "@/lib/validation";

export async function GET(request) {
  const { error } = await authorizeApi("ORDER_READ");
  if (error) return error;

  await ensureBusinessDayState();

  const { searchParams } = new URL(request.url);
  const paymentStatus = searchParams.get("paymentStatus");
  const archived = searchParams.get("archived");
  const braceletNo = searchParams.get("braceletNo");
  const compact = searchParams.get("compact") === "1";

  const where = {};

  if (paymentStatus) where.paymentStatus = paymentStatus;
  if (archived === "true") where.archivedAt = { not: null };
  if (archived === "false") where.archivedAt = null;
  if (braceletNo) where.braceletNo = braceletNo.trim();

  const orders = await prisma.order.findMany(compact ? {
    where,
    select: {
      id: true,
      braceletNo: true,
      childNames: true,
      customerPhone: true,
      archivedAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  } : {
    where,
    include: includeOrderDetails(),
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  if (compact) {
    return NextResponse.json(orders);
  }

  const records = await prisma.orderTransactionRecord.findMany({
    where: { orderId: { in: orders.map((order) => order.id) } },
  });
  const recordMap = new Map(records.map((record) => [record.orderId, record]));

  return NextResponse.json(orders.map((order) => serializeOrder(order, recordMap.get(order.id))));
}

export async function POST(request) {
  const { user, error } = await authorizeApi("ORDER_CREATE");
  if (error) return error;

  const businessState = await ensureBusinessDayState();
  const body = await request.json();
  let braceletNo;
  let customerPhone;
  let childNames;
  let items;

  try {
    braceletNo = requireString(body.braceletNo, "braceletNo");
    customerPhone = optionalString(body.customerPhone);
    childNames = requireArray(body.childNames, "childNames").map((name) => String(name || "").trim()).filter(Boolean);
    items = requireArray(body.items, "items");
  } catch (error) {
    return jsonValidationResponse(NextResponse, error);
  }

  if (!businessState.isOpen) {
    return NextResponse.json({ success: false, error: businessState.message }, { status: 400 });
  }

  if (!validateBracelet(braceletNo)) {
    return NextResponse.json({ success: false, error: "Bracelet must be 5 digits starting with 0, or 6 digits starting with 0, 1, 2, or 3" }, { status: 400 });
  }

  if (!validateCustomerPhone(customerPhone)) {
    return NextResponse.json({ success: false, error: "Phone must be 11 digits and start with 010, 011, or 012" }, { status: 400 });
  }

  if (!childNames.length) {
    return NextResponse.json({ success: false, error: "Child name is required" }, { status: 400 });
  }

  const duplicateBraceletOrder = await assertActiveBraceletAvailable(prisma, braceletNo);

  if (duplicateBraceletOrder) {
    return NextResponse.json({
      success: false,
      error: duplicateBraceletOrder.message,
    }, { status: duplicateBraceletOrder.status });
  }

  const departmentConfig = await getSetting("EMPLOYEE_DEPARTMENT_CONFIG", "");
  const userIsDataEmployee = user.employee ? isDataDepartment(user.employee.department, departmentConfig) : false;
  const dataEmployeeId = userIsDataEmployee ? user.employeeId : body.dataEmployeeId;

  if (!dataEmployeeId) {
    return NextResponse.json({ success: false, error: "Employee is required" }, { status: 400 });
  }

  const dataEmployee = await prisma.employee.findFirst({
    where: {
      id: dataEmployeeId,
      active: true,
    },
  });

  if (!dataEmployee || !isDataDepartment(dataEmployee.department, departmentConfig)) {
    return NextResponse.json({ success: false, error: "Data employee is required" }, { status: 400 });
  }

  if (!items.length) {
    return NextResponse.json({ success: false, error: "Please select at least one product" }, { status: 400 });
  }

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((item) => item.productId) } },
  });
  const productMap = new Map(products.map((product) => [product.id, product]));
  const orderItems = [];
  let total = 0;

  items.forEach((item) => {
    const product = productMap.get(item.productId);
    if (!product) return;

    const qty = Math.max(1, Number(item.qty) || 1);
    const lineTotal = product.price * qty;
    total += lineTotal;
    orderItems.push({
      productId: product.id,
      name: product.name,
      qty,
      price: product.price,
      total: lineTotal,
    });
  });

  const orderId = await buildOrderId();
  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      const createdOrder = await tx.order.create({
        data: {
          id: orderId,
          businessDate: businessState.businessDate,
          braceletNo,
          customerPhone: customerPhone || null,
          childNames: childNames.join(", "),
          childrenCount: childNames.length,
          total,
          workflowState: "OPEN",
          paymentMethod: enumValue(body.paymentMethod, ["CASH", "VISA"], "CASH"),
          cashierId: user.id,
          dataEmployeeId,
          items: { create: orderItems },
        },
        include: includeOrderDetails(),
      });
      await claimActiveBracelet(tx, braceletNo, createdOrder.id);
      await upsertOrderRecord(tx, createdOrder, {
        orderCreatedAt: createdOrder.createdAt,
        ...actorFields("orderCreated", user, dataEmployee),
      });
      return createdOrder;
    });
  } catch (error) {
    if (isBraceletLockConflict(error)) {
      return NextResponse.json({
        success: false,
        error: `Bracelet ${braceletNo} already has an active order`,
      }, { status: 409 });
    }
    throw error;
  }

  await writeAudit({
    action: "ORDER_CREATED",
    orderId: order.id,
    user,
    summary: `Created order ${order.id}`,
    metadata: { total, items: orderItems.length, paymentMethod: order.paymentMethod },
    after: {
      id: order.id,
      workflowState: order.workflowState,
      total: order.total,
      paymentMethod: order.paymentMethod,
    },
    reason: "New order created by data team",
  });

  return NextResponse.json({ success: true, order: serializeOrder(order) });
}
