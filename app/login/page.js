import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getOperationsHome } from "@/lib/operations/dashboard-settings-server";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect(await getOperationsHome(user));
  }

  return <LoginForm />;
}
