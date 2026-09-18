import { requireUser } from "@/lib/auth";
import AppShell from "../AppShell";
import OperationsClient from "./OperationsClient";

export default async function OperationsPage() {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  return (
    <AppShell title="title.operations" user={user}>
      <OperationsClient />
    </AppShell>
  );
}
