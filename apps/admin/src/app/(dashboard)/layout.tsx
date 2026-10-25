import { redirect } from "next/navigation";
import { isAdminSessionValid } from "../admin-auth";
import Sidebar from "./Sidebar";
import styles from "../page.module.css";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdminSessionValid())) {
    redirect("/");
  }

  return (
    <main className={styles.page}>
      <Sidebar />
      <section className={styles.content}>{children}</section>
    </main>
  );
}
