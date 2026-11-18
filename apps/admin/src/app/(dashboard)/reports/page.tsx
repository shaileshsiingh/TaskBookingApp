import { logoutAdmin } from "../../actions";
import { fetchApi, formatPrice } from "../../admin-api";
import SubmitButton from "../../SubmitButton";
import type { Booking } from "../../types";
import styles from "../../page.module.css";

export const instant = false;

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = (day + 6) % 7; // Monday-start week
  result.setDate(result.getDate() - diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;

  let bookings: Booking[] = [];
  let loadError = "";

  try {
    bookings = await fetchApi<Booking[]>("/bookings");
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown API error";
    loadError = `Could not load bookings: ${details}`;
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);

  const withDate = bookings.map((booking) => ({ booking, date: new Date(booking.date) }));

  const countSince = (from: Date) => withDate.filter((item) => item.date >= from).length;
  const revenueSince = (from: Date) =>
    withDate
      .filter(
        (item) =>
          item.date >= from &&
          item.booking.status !== "cancelled" &&
          item.booking.status !== "failed",
      )
      .reduce((sum, item) => sum + item.booking.estimatedTotal, 0);

  const totalRevenue = bookings
    .filter((booking) => booking.status !== "cancelled" && booking.status !== "failed")
    .reduce((sum, booking) => sum + booking.estimatedTotal, 0);
  const cancelledCount = bookings.filter((booking) => booking.status === "cancelled").length;

  const metrics = [
    { label: "Bookings today", value: String(countSince(todayStart)), tone: styles.metricBlue },
    { label: "Bookings this week", value: String(countSince(weekStart)), tone: styles.metricGreen },
    { label: "Bookings this month", value: String(countSince(monthStart)), tone: styles.metricPurple },
    { label: "Cancelled (all time)", value: String(cancelledCount), tone: styles.metricAmber },
  ];

  const serviceTotals = new Map<string, { bookings: number; people: number }>();
  const partnerCompletions = new Map<string, number>();

  for (const booking of bookings) {
    for (const requirement of booking.requirements) {
      const current = serviceTotals.get(requirement.serviceName) ?? { bookings: 0, people: 0 };
      current.bookings += 1;
      current.people += requirement.people;
      serviceTotals.set(requirement.serviceName, current);

      for (const assignment of requirement.assignments) {
        if (assignment.status !== "completed") continue;
        partnerCompletions.set(
          assignment.providerName,
          (partnerCompletions.get(assignment.providerName) ?? 0) + 1,
        );
      }
    }
  }

  const serviceRows = Array.from(serviceTotals.entries()).sort((a, b) => b[1].bookings - a[1].bookings);
  const partnerRows = Array.from(partnerCompletions.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>OPERATIONS</p>
          <h1>Reports</h1>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.status}><span className={styles.statusDot} />Live data</span>
          <form action={logoutAdmin}><SubmitButton className={styles.actionButton} pendingLabel="Signing out…">Sign out</SubmitButton></form>
        </div>
      </header>

      {query.error ? <p className={styles.error} role="alert">{query.error}</p> : null}
      {loadError ? (
        <p className={styles.error} role="alert">{loadError}</p>
      ) : (
        <>
          <div className={styles.metricsGrid}>
            {metrics.map((item) => (
              <div className={`${styles.metricCard} ${item.tone}`} key={item.label}>
                <span>{item.label}</span><strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Revenue</h2>
              <span>{formatPrice(totalRevenue)} total, excluding cancelled/failed</span>
            </div>
            <div className={styles.metricsGrid}>
              <div className={`${styles.metricCard} ${styles.metricBlue}`}>
                <span>Today</span><strong>{formatPrice(revenueSince(todayStart))}</strong>
              </div>
              <div className={`${styles.metricCard} ${styles.metricGreen}`}>
                <span>This week</span><strong>{formatPrice(revenueSince(weekStart))}</strong>
              </div>
              <div className={`${styles.metricCard} ${styles.metricPurple}`}>
                <span>This month</span><strong>{formatPrice(revenueSince(monthStart))}</strong>
              </div>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.panelHeaderSpaced}`}>
            <div className={styles.panelHeader}><h2>Service-wise bookings</h2><span>{serviceRows.length} services</span></div>
            <div className={styles.tableWrap}>
              <table className={styles.bookingsTable}>
                <thead><tr><th>Service</th><th>Bookings</th><th>Personnel requested</th></tr></thead>
                <tbody>
                  {serviceRows.map(([name, totals]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{totals.bookings}</td>
                      <td>{totals.people}</td>
                    </tr>
                  ))}
                  {serviceRows.length === 0 ? <tr><td colSpan={3}>No bookings yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.panelHeaderSpaced}`}>
            <div className={styles.panelHeader}><h2>Partner performance</h2><span>Completed jobs, most active first</span></div>
            <div className={styles.tableWrap}>
              <table className={styles.bookingsTable}>
                <thead><tr><th>Partner</th><th>Completed jobs</th></tr></thead>
                <tbody>
                  {partnerRows.map(([name, count]) => (
                    <tr key={name}>
                      <td>{name}</td>
                      <td>{count}</td>
                    </tr>
                  ))}
                  {partnerRows.length === 0 ? <tr><td colSpan={2}>No completed jobs yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
