import { NextResponse } from "next/server";
import { basePrisma as db } from "@/lib/db";
import { accountRequest, accountResponse } from "@/lib/accounts/http";
import { readConfig, assertCan, failure,publicAccount,assertOperationsAccount,assertAccountScope } from "@/lib/accounts/service";
import { setAvatar } from "@/lib/accounts/avatar";
import { readEmployeeFile } from "@/lib/employee-file-storage";
export const GET = accountResponse(async (request, { params }) => {
  const actor = await accountRequest(request, null, { allowForced: true });
  const { id } = await params;
  const { config } = await readConfig(db);
  const p = config.accounts[id];
  if (id !== actor.id) {
    assertCan(actor, "users.view");
    assertOperationsAccount(config,id);
    assertAccountScope(actor,publicAccount(await db.user.findUnique({where:{id}}),config),'users.view');
    if (
      !actor.profile.allBranches &&
      (p?.allBranches ||
        p?.branches.some((b) => !actor.profile.branches.includes(b)))
    )
      throw failure("Account outside your scope", 403);
  }
  if (!p?.avatar) throw failure("Avatar not found", 404);
  const bytes = await readEmployeeFile(p.avatar.storageKey);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
});
export const POST = accountResponse(async (request, { params }) => {
  const actor = await accountRequest(request);
  const { id } = await params;
  if (Number(request.headers.get("content-length")) > 6 * 1024 * 1024)
    throw failure("Image is too large", 413);
  const form = await request.formData();
  const user = await setAvatar(db, actor, id, form.get("file"));
  return NextResponse.json({ success: true, user });
});
export const DELETE = accountResponse(async (request, { params }) => {
  const actor = await accountRequest(request);
  const { id } = await params;
  const user = await setAvatar(db, actor, id, null);
  return NextResponse.json({ success: true, user });
});
