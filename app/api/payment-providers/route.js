import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { authorizeApi } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";

const methods = new Set(["CASH", "VISA", "KIDZAPP", "WAFFARHA", "E_INVOICE", "CUSTOM_1", "CUSTOM_2"]);
const types = new Set(["CASH", "VISA", "CUSTOM"]);

function serializeProvider(provider) {
  return {
    id: provider.id,
    name: provider.name,
    type: provider.type,
    method: provider.method,
    active: provider.active,
    editable: provider.editable,
    showInFrontOrder: provider.showInFrontOrder !== false,
    showInDataOrder: provider.showInDataOrder !== false,
    showInQuickOrder: provider.showInQuickOrder !== false,
    sortOrder: provider.sortOrder,
    reportBucket: provider.reportBucket || "",
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
  };
}

function providerPayload(body) {
  const method = String(body.method || "CUSTOM_1").trim().toUpperCase();
  const safeMethod = methods.has(method) ? method : "CUSTOM_1";
  const type = String(body.type || "").trim().toUpperCase();
  const safeType = types.has(type) ? type : safeMethod === "CASH" ? "CASH" : safeMethod === "VISA" ? "VISA" : "CUSTOM";
  const id = String(body.id || safeMethod).trim().toUpperCase().replace(/[^A-Z0-9-_]/g, "_");

  return {
    id,
    name: String(body.name || safeMethod).trim(),
    type: safeType,
    method: safeMethod,
    active: body.active !== false,
    editable: body.editable !== false,
    showInFrontOrder: body.showInFrontOrder !== false,
    showInDataOrder: body.showInDataOrder !== false,
    showInQuickOrder: body.showInQuickOrder !== false,
    sortOrder: Number(body.sortOrder) || 100,
    reportBucket: String(body.reportBucket || safeType).trim() || safeType,
  };
}

export async function GET(request) {
  const { error } = await authorizeApi("PAYMENT_PROVIDER_READ");
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const context = String(searchParams.get("context") || "").toLowerCase();
  const providers = await prisma.paymentProvider.findMany({
    where: {
      ...(context === "front" ? { showInFrontOrder: true } : {}),
      ...(context === "data" ? { showInDataOrder: true } : {}),
      ...(context === "quick" || context === "quickrestaurant" ? { showInQuickOrder: true } : {}),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ success: true, providers: providers.map(serializeProvider) });
}

export async function POST(request) {
  const { user, error } = await authorizeApi("PAYMENT_PROVIDER_MANAGE");
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const data = providerPayload(body);
  const provider = await prisma.paymentProvider.create({ data });

  await writeAudit({
    action: "PAYMENT_PROVIDER_CREATED",
    user,
    summary: `Created payment provider ${provider.name}`,
    metadata: { providerId: provider.id, method: provider.method, type: provider.type },
  });

  return NextResponse.json({ success: true, provider: serializeProvider(provider) });
}

export async function PATCH(request) {
  const { user, error } = await authorizeApi("PAYMENT_PROVIDER_MANAGE");
  if (error) return error;

  const body = await request.json().catch(() => ({}));
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ success: false, error: "Payment provider id is required" }, { status: 400 });

  const data = providerPayload({ ...body, id });
  const before = await prisma.paymentProvider.findUnique({ where: { id } });
  const provider = await prisma.paymentProvider.update({
    where: { id },
    data: {
      name: data.name,
      type: data.type,
      method: data.method,
      active: data.active,
      editable: data.editable,
      showInFrontOrder: data.showInFrontOrder,
      showInDataOrder: data.showInDataOrder,
      showInQuickOrder: data.showInQuickOrder,
      sortOrder: data.sortOrder,
      reportBucket: data.reportBucket,
    },
  });

  await writeAudit({
    action: "PAYMENT_PROVIDER_UPDATED",
    user,
    summary: `Updated payment provider ${provider.name}`,
    before: before ? serializeProvider(before) : null,
    after: serializeProvider(provider),
  });

  return NextResponse.json({ success: true, provider: serializeProvider(provider) });
}
