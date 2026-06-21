import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRoleHome } from "@/lib/roles";

export default async function HomePage() {
  const user = await getCurrentUser();
  redirect(user ? getRoleHome(user.role) : "/login");
}
