import { requireUser } from "@/lib/auth";
import AppShell from "../AppShell";
import CashierClient from "./CashierClient";

export default async function CashierPage() {
  const user = await requireUser(["ADMIN", "CASHIER"]);

  return (
    <AppShell title="title.cashier" user={user}>
      <CashierClient />
    </AppShell>
  );
}
