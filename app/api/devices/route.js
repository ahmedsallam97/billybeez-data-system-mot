import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

function serializeDevice(device) {
  return {
    id: device.id,
    deviceNo: device.deviceNo,
    name: device.name,
    type: device.type,
    active: device.active,
    invoicePrinterName: device.invoicePrinterName || "",
    kitchenPrinterName: device.kitchenPrinterName || "",
    posSerial: device.posSerial || "",
    branchCode: device.branchCode || "",
    createdAt: device.createdAt,
    updatedAt: device.updatedAt,
  };
}

function devicePayload(body) {
  const deviceNo = Math.max(1, Math.min(10, Number(body.deviceNo) || 1));
  const id = String(body.id || `DEVICE_${deviceNo}`).trim().toUpperCase().replace(/[^A-Z0-9-_]/g, "_");
  const requestedType = String(body.type || "").toUpperCase();
  const type = ["FRONT", "KITCHEN", "KITCHEN_CASHIER"].includes(requestedType) ? requestedType : "FRONT";

  return {
    id,
    deviceNo,
    name: String(body.name || `Device ${deviceNo}`).trim(),
    type,
    active: body.active !== false,
    invoicePrinterName: String(body.invoicePrinterName || "").trim() || null,
    kitchenPrinterName: String(body.kitchenPrinterName || "").trim() || null,
    posSerial: String(body.posSerial || "").trim() || null,
    branchCode: String(body.branchCode || "").trim() || null,
  };
}

export async function GET() {
  const { error } = await authorizeApi("DEVICE_READ");
  if (error) return error;

  const devices = await prisma.device.findMany({
    orderBy: [{ deviceNo: "asc" }],
  });

  return NextResponse.json({ success: true, devices: devices.map(serializeDevice) });
}

export async function POST(request) {
  const { user, error } = await authorizeApi("DEVICE_MANAGE");
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const data = devicePayload(body);

  const device = await prisma.device.create({ data });

  await writeAudit({
    action: "DEVICE_CREATED",
    user,
    summary: `Created device ${device.name}`,
    metadata: { deviceId: device.id, deviceNo: device.deviceNo, type: device.type },
  });

  return NextResponse.json({ success: true, device: serializeDevice(device) });
}

export async function PATCH(request) {
  const { user, error } = await authorizeApi("DEVICE_MANAGE");
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ success: false, error: "Device id is required" }, { status: 400 });

  const data = devicePayload({ ...body, id });
  const before = await prisma.device.findUnique({ where: { id } });
  const device = await prisma.device.update({
    where: { id },
    data: {
      deviceNo: data.deviceNo,
      name: data.name,
      type: data.type,
      active: data.active,
      invoicePrinterName: data.invoicePrinterName,
      kitchenPrinterName: data.kitchenPrinterName,
      posSerial: data.posSerial,
      branchCode: data.branchCode,
    },
  });

  await writeAudit({
    action: "DEVICE_UPDATED",
    user,
    summary: `Updated device ${device.name}`,
    before: before ? serializeDevice(before) : null,
    after: serializeDevice(device),
  });

  return NextResponse.json({ success: true, device: serializeDevice(device) });
}
