import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getOperationsHome } from "@/lib/operations/dashboard-settings-server";

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? await getOperationsHome(user) : "/login");
}
