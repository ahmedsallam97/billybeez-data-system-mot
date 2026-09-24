import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ManagerPage() {
  await requireUser(["ADMIN", "MANAGER"]);
  redirect("/settings?section=business");
}
