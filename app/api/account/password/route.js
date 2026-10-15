import { NextResponse } from "next/server";
import { basePrisma as db } from "@/lib/db";
import { accountRequest, accountResponse } from "@/lib/accounts/http";
import { changePassword } from "@/lib/accounts/service";
import { setCurrentUser } from "@/lib/auth";
export const POST = accountResponse(async (request) => {
  const actor = await accountRequest(request, null, { allowForced: true });
  const user = await changePassword(db, actor, await request.json());
  await setCurrentUser(user);
  return NextResponse.json({ success: true, user });
});
