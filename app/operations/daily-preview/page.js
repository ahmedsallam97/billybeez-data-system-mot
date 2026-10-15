import { requirePermission } from "@/lib/auth";
import AppShell from "@/app/AppShell";
import DailyApprovalPreview from "./DailyApprovalPreview";

export default async function DailyApprovalPreviewPage() {
  const user = await requirePermission('roster.view');
  return <AppShell title="Daily Operations — Approval Preview" user={user}><DailyApprovalPreview /></AppShell>;
}
