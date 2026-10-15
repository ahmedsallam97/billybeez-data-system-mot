import { NextResponse } from "next/server";
import { consumeLoginAttempt } from "@/lib/login-rate-limit";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { setCurrentUser } from "@/lib/auth";
import { getOperationsHome } from "@/lib/operations/dashboard-settings-server";
import { loadAccount, readConfig, KEY } from '@/lib/accounts/service';

const DUMMY_PASSWORD_HASH = "$2b$12$yXEMc/F1Q6xYPDuZJf1R0eKcO4nroFtg6rRhJ03zyp5zjJQ2q4YjK";

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!username || !password || username.length > 80 || password.length > 200) {
    return NextResponse.json({ success: false, error: "Invalid username or password" }, { status: 401 });
  }

  const limit = consumeLoginAttempt(username);
  if (!limit.allowed) return NextResponse.json({ success: false, error: "Too many login attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(limit.retryAfter) } });

  const user = await prisma.user.findUnique({
    where: { username },
    include: { employee: true },
  });
  const passwordMatches = await bcrypt.compare(password, user?.password || DUMMY_PASSWORD_HASH);

  if (!user?.active || !passwordMatches) {
    return NextResponse.json({ success: false, error: "Invalid username or password" }, { status: 401 });
  }

  let account;
  try { account = await loadAccount(prisma, user); }
  catch { return NextResponse.json({ success: false, error: 'Account access is unavailable. Contact your administrator.' }, { status: 503 }); }
  if (account.profile.archivedAt || !account.roleActive) return NextResponse.json({ success:false,error:'Invalid username or password' },{status:401});
  let recorded=false;
  for(let attempt=0;attempt<3&&!recorded;attempt++)try{
    await prisma.$transaction(async tx => {
      const freshUser=await tx.user.findUnique({where:{id:user.id},include:{employee:true}});
      const freshAccount=await loadAccount(tx,freshUser);
      if(!freshUser.active||freshUser.password!==user.password||freshAccount.profile.archivedAt||!freshAccount.roleActive)throw Object.assign(new Error('Account changed'),{status:401});
      const { row, config } = await readConfig(tx);
      config.accounts[user.id].lastLogin = new Date().toISOString();
      config.revision++;
      const saved = await tx.systemSetting.updateMany({ where:{key:KEY,value:row.value},data:{value:JSON.stringify(config)} });
      if(saved.count!==1)throw new Error('Concurrent account update');
      await tx.auditLog.create({data:{action:'ACCOUNT_LOGIN',userId:user.id,summary:'Account signed in',metadata:JSON.stringify({target:user.id})}});
      account={...freshAccount,profile:{...freshAccount.profile,lastLogin:config.accounts[user.id].lastLogin}};
    });recorded=true;
  }catch(error){if(error.status===401)return NextResponse.json({success:false,error:'Invalid username or password'},{status:401});if(attempt===2)return NextResponse.json({success:false,error:'Sign-in could not be completed. Please retry.'},{status:503});}
  await setCurrentUser(account);

  return NextResponse.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      employeeId: user.employeeId || "",
      employeeName: user.employee?.name || "",
      employeeDepartment: user.employee?.department || "",
    },
    home: account.profile.forcePasswordChange ? '/account?section=password' : await getOperationsHome(account),
  });
}
