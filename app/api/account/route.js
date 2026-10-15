import { NextResponse } from "next/server";
import { basePrisma as db } from "@/lib/db";
import { accountRequest, accountResponse } from "@/lib/accounts/http";
import { editPersonalProfile } from "@/lib/accounts/service";
export const GET = accountResponse(async (request) =>
  NextResponse.json({
    success: true,
    user: await accountRequest(request, null, { allowForced: true }),
  }),
);
export const PATCH = accountResponse(async (request) => {
  const actor = await accountRequest(request);
  const user = await editPersonalProfile(db, actor, await request.json());
  return NextResponse.json({ success: true, user });
});
