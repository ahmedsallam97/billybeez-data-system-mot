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
import { enumValue, jsonValidationResponse, optionalString, requireArray } from "@/lib/validation";
import { nextDeviceInvoiceSerial } from "@/lib/numbering";
import { findUnavailableProducts } from "@/lib/product-availability";

const supportedPaymentMethods = ["CASH", "VISA", "KIDZAPP", "WAFFARHA", "E_INVOICE", "CUSTOM_1", "CUSTOM_2"];
const supportedDeviceTypes = ["FRONT", "KITCHEN", "KITCHEN_CASHIER"];

async function resolveOrderDevice(body) {
  const requestedDeviceId = optionalString(body.deviceId);
  const requestedType = supportedDeviceTypes.includes(String(body.deviceType || "").toUpperCase())
    ? String(body.deviceType).toUpperCase()
    : "";
  const defaultSettingKey = requestedType === "KITCHEN_CASHIER"
    ? "DEFAULT_KITCHEN_CASHIER_DEVICE_ID"
    : requestedType === "KITCHEN"
      ? "DEFAULT_KITCHEN_DEVICE_ID"
      : "DEFAULT_FRONT_DEVICE_ID";
  const fallbackId = await getSetting(defaultSettingKey, requestedType === "KITCHEN_CASHIER" ? "DEVICE_9" : requestedType === "KITCHEN" ? "DEVICE_5" : "DEVICE_1");
  const candidates = [...new Set([requestedDeviceId, fallbackId].filter(Boolean))];

  const devices = await prisma.device.findMany({
    where: {
      id: { in: candidates },
      active: true,
      ...(requestedType ? { type: requestedType } : {}),
    },
  });
  const deviceMap = new Map(devices.map((device) => [device.id, device]));
  return candidates.map((id) => deviceMap.get(id)).find(Boolean) || null;
}

function optionalDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const formatted = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (formatted) {
    const day = Number(formatted[1]);
    const month = Number(formatted[2]);
    const year = Number(formatted[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? parsed : null;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request) {
  const { error } = await authorizeApi("ORDER_READ");
  if (error) return error;

  await ensureBusinessDayState();

  const { searchParams } = new URL(request.url);
  const paymentStatus = searchParams.get("paymentStatus");
  const archived = searchParams.get("archived");
  const braceletNo = searchParams.get("braceletNo");
  const deviceType = String(searchParams.get("deviceType") || "").toUpperCase();
  const compact = searchParams.get("compact") === "1";

  const where = {};

  if (paymentStatus) where.paymentStatus = paymentStatus;
  if (archived === "true") where.archivedAt = { not: null };
  if (archived === "false") where.archivedAt = null;
  if (braceletNo) where.braceletNo = braceletNo.trim();
  if (["FRONT", "KITCHEN", "KITCHEN_CASHIER"].includes(deviceType)) where.device = { is: { type: deviceType } };

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
    braceletNo = optionalString(body.braceletNo);
    customerPhone = optionalString(body.customerPhone);
    childNames = Array.isArray(body.childNames) ? body.childNames.map((name) => String(name || "").trim()).filter(Boolean) : [];
    items = requireArray(body.items, "items");
  } catch (error) {
    return jsonValidationResponse(NextResponse, error);
  }

  if (!businessState.isOpen) {
    return NextResponse.json({ success: false, error: businessState.message }, { status: 400 });
  }

  if (!validateCustomerPhone(customerPhone)) {
    return NextResponse.json({ success: false, error: "Phone must be 11 digits and start with 010, 011, or 012" }, { status: 400 });
  }

  const device = await resolveOrderDevice(body);
  const isKitchenCashierOrder = device?.type === "KITCHEN_CASHIER";
  const isInstantPaidDevice = ["FRONT", "KITCHEN_CASHIER"].includes(device?.type);

  if (!childNames.length && isKitchenCashierOrder) {
    childNames = ["Restaurant"];
  }

  if (!childNames.length) {
    return NextResponse.json({ success: false, error: "Child name is required" }, { status: 400 });
  }

  const departmentConfig = await getSetting("EMPLOYEE_DEPARTMENT_CONFIG", "");
  const userIsDataEmployee = user.employee ? isDataDepartment(user.employee.department, departmentConfig) : false;
  const dataEmployeeId = userIsDataEmployee ? user.employeeId : body.dataEmployeeId;

  if (!dataEmployeeId && !isKitchenCashierOrder) {
    return NextResponse.json({ success: false, error: "Employee is required" }, { status: 400 });
  }

  const dataEmployee = dataEmployeeId ? await prisma.employee.findFirst({
    where: {
      id: dataEmployeeId,
      active: true,
    },
  }) : null;

  if (!isKitchenCashierOrder && (!dataEmployee || !isDataDepartment(dataEmployee.department, departmentConfig))) {
    return NextResponse.json({ success: false, error: "Data employee is required" }, { status: 400 });
  }

  if (!items.length) {
    return NextResponse.json({ success: false, error: "Please select at least one product" }, { status: 400 });
  }

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((item) => item.productId) } },
    include: { category: true },
  });
  const productMap = new Map(products.map((product) => [product.id, product]));
  const missingProductIds = [...new Set(items.map((item) => item.productId).filter((productId) => !productMap.has(productId)))];
  if (missingProductIds.length) {
    return NextResponse.json({ success: false, error: `Product not found: ${missingProductIds.join(", ")}` }, { status: 400 });
  }
  const unavailableProducts = findUnavailableProducts(products);
  if (unavailableProducts.length) {
    return NextResponse.json({
      success: false,
      error: `Product is not available now: ${unavailableProducts.map(({ product }) => product.name).join(", ")}`,
    }, { status: 400 });
  }
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
      netSales: product.netSales === null || product.netSales === undefined ? null : product.netSales * qty,
      taxAmount: product.taxAmount === null || product.taxAmount === undefined ? null : product.taxAmount * qty,
      total: lineTotal,
    });
  });

  const orderId = await buildOrderId();
  const paymentMethod = enumValue(body.paymentMethod, supportedPaymentMethods, "CASH");
  const paymentProvider = await prisma.paymentProvider.findFirst({
    where: {
      OR: [
        { id: String(body.paymentProviderId || "").trim() },
        { method: paymentMethod },
      ],
      active: true,
    },
  });
  if (device?.type === "FRONT" && !customerPhone) {
    return NextResponse.json({ success: false, error: "Phone is required for front orders" }, { status: 400 });
  }
  const invoiceSerial = device ? await nextDeviceInvoiceSerial(device.deviceNo) : null;
  if (!braceletNo && body.autoBracelet) braceletNo = invoiceSerial || "";

  if (!validateBracelet(braceletNo)) {
    return NextResponse.json({ success: false, error: "Bracelet must be 5 digits starting with 0, 6 digits starting with 0, 1, 2, or 3, or a 10 digit invoice serial" }, { status: 400 });
  }

  const duplicateBraceletOrder = isKitchenCashierOrder ? null : await assertActiveBraceletAvailable(prisma, braceletNo);

  if (duplicateBraceletOrder) {
    return NextResponse.json({
      success: false,
      error: duplicateBraceletOrder.message,
    }, { status: duplicateBraceletOrder.status });
  }

  const customerName = optionalString(body.customerName);
  const childBirthDates = Array.isArray(body.childBirthDates) ? body.childBirthDates : [];
  const childComments = Array.isArray(body.childComments) ? body.childComments : [];
  const childOpenCharges = Array.isArray(body.childOpenCharges) ? body.childOpenCharges : [];
  const allowOpenCharges = Boolean(body.allowOpenCharges);
  const quickRestaurantRegisteredAt = isKitchenCashierOrder ? new Date() : null;
  let order;
  try {
    order = await prisma.$transaction(async (tx) => {
      let customer = null;
      if (customerName || customerPhone) {
        const customerData = {
          name: customerName || childNames.join(", "),
          phone: customerPhone || null,
          comments: optionalString(body.customerComments) || null,
        };
        const existingCustomer = customerPhone
          ? await tx.customer.findFirst({ where: { phone: customerPhone } })
          : null;
        customer = existingCustomer
          ? await tx.customer.update({ where: { id: existingCustomer.id }, data: customerData })
          : await tx.customer.create({ data: customerData });
      }
      const createdOrder = await tx.order.create({
        data: {
          id: orderId,
          businessDate: businessState.businessDate,
          invoiceSerial,
          deviceId: device?.id || null,
          customerId: customer?.id || null,
          customerName: customerName || null,
          braceletNo,
          customerPhone: customerPhone || null,
          childNames: childNames.join(", "),
          childrenCount: childNames.length,
          allowOpenCharges,
          comments: optionalString(body.comments) || null,
          total,
          workflowState: quickRestaurantRegisteredAt ? "GEIDEA_REGISTERED" : "OPEN",
          paymentStatus: isInstantPaidDevice ? "PAID" : "UNPAID",
          status: isInstantPaidDevice ? "PAID" : "OPEN",
          paymentMethod,
          paymentProviderId: paymentProvider?.id || null,
          geideaRegisteredAt: quickRestaurantRegisteredAt,
          internalQrPayload: invoiceSerial ? `/invoice/${encodeURIComponent(orderId)}` : null,
          cashierId: user.id,
          dataEmployeeId,
          items: { create: orderItems },
          payments: isInstantPaidDevice && total > 0 ? {
            create: {
              paymentProviderId: paymentProvider?.id || null,
              method: paymentMethod,
              amount: total,
            },
          } : undefined,
          children: {
            create: childNames.map((name, index) => ({
              customerId: customer?.id || null,
              name,
              birthDate: optionalDate(childBirthDates[index]),
              comments: optionalString(childComments[index]) || null,
              allowOpenCharges: allowOpenCharges || Boolean(childOpenCharges[index]),
            })),
          },
        },
        include: includeOrderDetails(),
      });
      if (!isKitchenCashierOrder) {
        await claimActiveBracelet(tx, braceletNo, createdOrder.id);
      }
      await upsertOrderRecord(tx, createdOrder, {
        orderCreatedAt: createdOrder.createdAt,
        ...actorFields("orderCreated", user, dataEmployee),
        ...(isInstantPaidDevice ? {
          paidAt: createdOrder.createdAt,
          paymentMethod: createdOrder.paymentMethod,
          ...actorFields("paid", user, dataEmployee),
        } : {}),
        ...(quickRestaurantRegisteredAt ? {
          geideaRegisteredAt: quickRestaurantRegisteredAt,
          ...actorFields("geidea", user, dataEmployee),
        } : {}),
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
