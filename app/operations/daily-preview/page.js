import { requireUser } from "@/lib/auth";
import AppShell from "@/app/AppShell";
import DailyApprovalPreview from "./DailyApprovalPreview";

export default async function DailyApprovalPreviewPage() {
  const user = await requireUser(["ADMIN", "MANAGER"]);
  return <AppShell title="Daily Operations — Approval Preview" user={user}><DailyApprovalPreview /></AppShell>;
}
