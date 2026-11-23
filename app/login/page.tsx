import { redirect } from "next/navigation";
import { LoginForm } from "@/components/features/login-form";
import { isDemo, workspaceId } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (isDemo() || await workspaceId()) redirect("/");
  return <main className="grid min-h-screen place-items-center p-4"><LoginForm /></main>;
}
