import { assignProvider, logoutAdmin } from "../../actions";
import { fetchApi, formatPrice } from "../../admin-api";
import type { Booking, Provider } from "../../types";
import styles from "../../page.module.css";

export const instant = false;

function getStatusClass(status: string) {
  if (["assigned", "accepted"].includes(status)) return styles.statusAssigned;
  if (["started", "on_the_way", "arrived", "in_progress"].includes(status)) {
    return styles.statusProgress;
  }
  return styles.statusPending;
}

function Message({ error, notice }: { error?: string; notice?: string }) {
  if (error) return <p className={styles.error} role="alert">{error}</p>;
  const messages: Record<string, string> = {
    "provider-assigned": "Provider assigned to the booking.",
  };
  return notice && messages[notice]
    ? <p className={styles.success} role="status">{messages[notice]}</p>
    : null;
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const query = await searchParams;

  let bookings: Booking[] = [];
  let providers: Provider[] = [];
  let loadError = "";

  try {
    [bookings, providers] = await Promise.all([
      fetchApi<Booking[]>("/bookings"),
      fetchApi<Provider[]>("/providers"),
    ]);
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown API error";
    loadError = `Could not load live operations data: ${details}`;
  }

  const openBookings = bookings.filter(
    (booking) => !["completed", "cancelled", "failed", "refunded"].includes(booking.status),
  ).length;
  const assignedBookings = bookings.filter((booking) =>
    booking.requirements.some((requirement) =>
      requirement.assignments.some((assignment) => !["cancelled", "rejected"].includes(assignment.status)),
    ),
  ).length;
  const averageValue = bookings.length
    ? bookings.reduce((total, booking) => total + booking.estimatedTotal, 0) / bookings.length
    : 0;
  const verifiedProviders = providers.filter((provider) => provider.verified).length;
  const metrics = [
    { label: "Open bookings", value: String(openBookings), tone: styles.metricGreen },
    { label: "Bookings with providers", value: String(assignedBookings), tone: styles.metricBlue },
    { label: "Avg. request value", value: formatPrice(averageValue), tone: styles.metricAmber },
    { label: "Verified providers", value: String(verifiedProviders), tone: styles.metricPurple },
  ];

  return (
    <>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>OPERATIONS</p>
          <h1>Booking overview</h1>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.status}><span className={styles.statusDot} />Live data</span>
          <form action={logoutAdmin}><button className={styles.actionButton} type="submit">Sign out</button></form>
        </div>
      </header>

      <Message error={query.error} notice={query.notice} />
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
            <div className={styles.panelHeader}><h2>Bookings</h2><span>{bookings.length} total</span></div>
            <div className={styles.tableWrap}>
              <table className={styles.bookingsTable}>
                <thead>
                  <tr><th>Booking</th><th>Customer</th><th>Service</th><th>When</th><th>Total</th><th>Status / assignment</th></tr>
                </thead>
                <tbody>
                  {bookings.map((booking) => (
                    <tr key={booking.id}>
                      <td>{booking.id}</td>
                      <td>{booking.customerName}</td>
                      <td>
                        {booking.requirements.map((requirement) => (
                          <div key={requirement.id}>
                            {requirement.serviceName} · {requirement.people}{" "}
                            {requirement.people === 1 ? "person" : "people"}
                          </div>
                        ))}
                      </td>
                      <td>
                        {new Date(`${booking.date}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        <div className={styles.timeCell}>{booking.time}</div>
                      </td>
                      <td>{formatPrice(booking.estimatedTotal)}</td>
                      <td>
                        <span className={`${styles.statusPill} ${getStatusClass(booking.status)}`}>{booking.status.replaceAll("_", " ")}</span>
                        {booking.requirements.map((requirement) => {
                          const activeAssignments = requirement.assignments.filter(
                            (assignment) => !["cancelled", "rejected"].includes(assignment.status),
                          );
                          const eligibleProviders = providers.filter(
                            (provider) =>
                              provider.verified &&
                              provider.available &&
                              provider.services.some((service) => service.id === requirement.serviceId),
                          );
                          const assignableProviders = eligibleProviders.filter(
                            (provider) => !activeAssignments.some((assignment) => assignment.providerId === provider.id),
                          );
                          const slotsRemaining = Math.max(requirement.people - activeAssignments.length, 0);
                          return (
                            <div className={styles.requirementBlock} key={requirement.id}>
                              <div className={styles.timeCell}>{requirement.serviceName}</div>
                              {activeAssignments.map((assignment) => (
                                <div className={styles.assignmentLine} key={assignment.id}>
                                  {assignment.providerName} · {assignment.status.replaceAll("_", " ")}
                                </div>
                              ))}
                              {slotsRemaining > 0 && assignableProviders.length > 0 ? (
                                <form action={assignProvider} className={styles.inlineForm}>
                                  <input name="bookingId" type="hidden" value={booking.id} />
                                  <input name="requirementId" type="hidden" value={requirement.id} />
                                  <select aria-label={`Choose provider for ${requirement.serviceName} on booking ${booking.id}`} className={styles.selectInput} name="providerId" required>
                                    <option value="">Assign provider…</option>
                                    {assignableProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                                  </select>
                                  <button className={styles.smallButton} type="submit">Assign</button>
                                </form>
                              ) : null}
                            </div>
                          );
                        })}
                      </td>
                    </tr>
                  ))}
                  {bookings.length === 0 ? <tr><td colSpan={6}>No bookings have been placed yet.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
