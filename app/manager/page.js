import { requireUser } from "@/lib/auth";
import AppShell from "../AppShell";
import ManagerClient from "./ManagerClient";

export default async function ManagerPage() {
  const user = await requireUser(["ADMIN", "MANAGER"]);

  return (
    <AppShell title="title.manager" user={user}>
      <ManagerClient />
    </AppShell>
  );
}
