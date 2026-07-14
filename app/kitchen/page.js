import { requireUser } from "@/lib/auth";
import AppShell from "../AppShell";
import KitchenClient from "./KitchenClient";

export default async function KitchenPage() {
  const user = await requireUser(["ADMIN", "MANAGER", "KITCHEN"]);

  return (
    <AppShell title="title.kitchen" user={user}>
      <KitchenClient user={user} />
    </AppShell>
  );
}
