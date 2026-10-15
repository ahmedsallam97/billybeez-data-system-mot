import { requirePermission } from "@/lib/auth";
import AppShell from "@/app/AppShell";
import AccountProfile from "./AccountProfile";
export default async function AccountPage() {
  const user = await requirePermission(null, { allowPasswordChange: true });
  return (
    <AppShell title="My Profile" user={user}>
      <AccountProfile initialUser={user} />
    </AppShell>
  );
}
