import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function KitchenCashierPage() {
  await requireUser(["ADMIN", "MANAGER", "KITCHEN"]);
  redirect("/kitchen?view=quick");
}
