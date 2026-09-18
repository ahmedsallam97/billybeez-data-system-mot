import { requireUser } from "@/lib/auth";
import AppShell from "../AppShell";
import OperationsSettingsClient from "./OperationsSettingsClient";

export default async function SettingsPage() {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  return <AppShell title="الإعدادات" user={user}><OperationsSettingsClient /></AppShell>;
}
