import { NextResponse } from "next/server";
import { clearCurrentUser } from "@/lib/auth";

export async function POST() {
  await clearCurrentUser();
  return NextResponse.json({ success: true });
}
