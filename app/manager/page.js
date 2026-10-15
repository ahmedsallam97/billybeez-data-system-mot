import { requireUser } from "@/lib/auth";
import { notFound } from "next/navigation";

export default async function ManagerPage() {
  await requireUser(["ADMIN", "MANAGER"]);
  notFound();
}
