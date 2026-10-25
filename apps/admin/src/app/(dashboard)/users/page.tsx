import { logoutAdmin } from "../../actions";
import { fetchApi, formatPrice } from "../../admin-api";
import type { Customer } from "../../types";
import styles from "../../page.module.css";

export const instant = false;

export default async function UsersPage() {
  let customers: Customer[] = [];
  let loadError = "";

  try {
    customers = await fetchApi<Customer[]>("/admin/customers");
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown API error";
    loadError = `Could not load customers: ${details}`;
  }

  return (
    <>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>OPERATIONS</p>
          <h1>Customers</h1>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.status}><span className={styles.statusDot} />Live data</span>
          <form action={logoutAdmin}><button className={styles.actionButton} type="submit">Sign out</button></form>
        </div>
      </header>

      {loadError ? (
        <p className={styles.error} role="alert">{loadError}</p>
      ) : (
        <section className={styles.panel}>
          <div className={styles.panelHeader}><h2>Customers</h2><span>{customers.length} total</span></div>
          <div className={styles.tableWrap}>
            <table className={styles.bookingsTable}>
              <thead>
                <tr><th>Name</th><th>Phone</th><th>Joined</th><th>Bookings</th><th>Lifetime value</th></tr>
              </thead>
              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id}>
                    <td>{customer.name}</td>
                    <td>{customer.phone}</td>
                    <td>{new Date(customer.joinedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</td>
                    <td>{customer.bookingCount}</td>
                    <td>{formatPrice(customer.lifetimeValue)}</td>
                  </tr>
                ))}
                {customers.length === 0 ? <tr><td colSpan={5}>No customers yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
