import { requireUser } from "@/lib/auth";
import AppShell from "../AppShell";
import SettingsPortal from "./SettingsPortal";

export default async function SettingsPage() {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  return <AppShell title="الإعدادات" user={user}><SettingsPortal /></AppShell>;
}
