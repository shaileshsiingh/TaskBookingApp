import { redirect } from "next/navigation";
import { loginAdmin } from "./actions";
import { isAdminSessionValid } from "./admin-auth";
import styles from "./page.module.css";

export const instant = false;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  if (await isAdminSessionValid()) {
    redirect("/bookings");
  }

  return (
    <main className={styles.loginPage}>
      <form action={loginAdmin} className={styles.loginCard}>
        <span className={styles.brandMark}>T</span>
        <p className={styles.eyebrow}>TASK PLATFORM</p>
        <h1>Admin sign in</h1>
        <p className={styles.loginCopy}>Enter the admin key configured for this workspace.</p>
        {query.error ? (
          <p className={styles.error} role="alert">The key was not accepted. Check it and try again.</p>
        ) : null}
        <label className={styles.fieldLabel} htmlFor="admin-key">ADMIN KEY</label>
        <input autoComplete="current-password" className={styles.textInput} id="admin-key" name="key" required type="password" />
        <button className={styles.primaryButton} type="submit">Sign in</button>
      </form>
    </main>
  );
}
