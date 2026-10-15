// Existing endpoint retained; all account mutations use the unified service.
import { NextResponse } from "next/server";
import { basePrisma as db } from "@/lib/db";
import { accountRequest, accountResponse } from "@/lib/accounts/http";
import { readConfig, publicAccount, saveUser,accountInScope,managementAccount } from "@/lib/accounts/service";
import {isOperationsRole} from '@/lib/accounts/registry';
export const GET = accountResponse(async (request) => {
  const actor = await accountRequest(request, "users.view");
  const { config } = await readConfig(db);
  const users = (
    await db.user.findMany({
      include: { employee: true },
      orderBy: { name: "asc" },
    })
  )
    .map((u) => publicAccount(u, config))
    .filter(
      u=>isOperationsRole(config.roles.find(r=>r.id===u.profile?.roleId))&&accountInScope(actor,u,'users.view'),
    ).map(managementAccount);
  return NextResponse.json(users);
});
export const POST = accountResponse(async (request) => {
  const actor = await accountRequest(request, "users.create");
  const user = await saveUser(db, actor, await request.json());
  return NextResponse.json({ success: true, user: managementAccount(user) });
});
export const PATCH = accountResponse(async (request) => {
  const actor = await accountRequest(request, "users.edit");
  const body = await request.json();
  const user = await saveUser(db, actor, body, body.id);
  return NextResponse.json({ success: true, user: managementAccount(user) });
});
