import { redirect } from "next/navigation";
import styles from "@/components/ui/notice.module.css";
import { LoginForm } from "@/components/features/login-form";
import { isDemo, workspaceId } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (isDemo() || await workspaceId()) redirect("/");
  return <main className={styles.screen}><LoginForm /></main>;
}
