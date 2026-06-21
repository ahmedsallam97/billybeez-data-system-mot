import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getRoleHome } from "@/lib/roles";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect(getRoleHome(user.role));
  }

  return <LoginForm />;
}
