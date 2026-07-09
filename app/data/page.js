import { requireUser } from "@/lib/auth";
import AppShell from "../AppShell";
import CashierClient from "../cashier/CashierClient";

export default async function DataPage() {
  const user = await requireUser(["ADMIN", "CASHIER"]);

  return (
    <AppShell title="title.data" user={user}>
      <CashierClient user={user} />
    </AppShell>
  );
}
