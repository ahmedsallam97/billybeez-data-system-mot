import { requireUser } from "@/lib/auth";
import AppShell from "../AppShell";
import FrontClient from "./FrontClient";

export default async function FrontPage() {
  const user = await requireUser(["ADMIN", "MANAGER", "CASHIER", "DATA"]);

  return (
    <AppShell title="title.front" user={user}>
      <FrontClient user={user} />
    </AppShell>
  );
}
