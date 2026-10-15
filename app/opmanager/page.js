import { requirePermission } from "@/lib/auth";
import AppShell from "../AppShell";
import OperationsSettingsClient from "../settings/OperationsSettingsClient";
import { getDashboardSettings } from "@/lib/operations/dashboard-settings-server";

export default async function OperationsManagerPage() {
  const user = await requirePermission('dashboard.view');
  const settings = await getDashboardSettings();
  return <AppShell title="title.operations" user={user} initialSettings={settings}><OperationsSettingsClient dashboardOnly /></AppShell>;
}
