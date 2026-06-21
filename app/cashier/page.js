import { requireUser } from "@/lib/auth";
import AppShell from "../AppShell";
import CashierClient from "./CashierClient";

export default async function CashierPage() {
  const user = await requireUser(["ADMIN", "MANAGER", "CASHIER"]);

  return (
    <AppShell title="Cashier Dashboard" user={user}>
      <CashierClient />
    </AppShell>
  );
}
