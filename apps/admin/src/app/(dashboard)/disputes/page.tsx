import { logoutAdmin, resolveDispute } from "../../actions";
import { fetchApi, formatPrice } from "../../admin-api";
import type { Booking } from "../../types";
import styles from "../../page.module.css";

export const instant = false;

function Message({ error, notice }: { error?: string; notice?: string }) {
  if (error) return <p className={styles.error} role="alert">{error}</p>;
  const messages: Record<string, string> = {
    "dispute-refunded": "Refund recorded and the booking is now marked refunded.",
    "dispute-dismissed": "Dispute dismissed; the booking is back to completed.",
  };
  return notice && messages[notice]
    ? <p className={styles.success} role="status">{messages[notice]}</p>
    : null;
}

export default async function DisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
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

  const open = bookings.filter((booking) => booking.status === "disputed");
  const resolved = bookings.filter((booking) => booking.status === "refunded");

  return (
    <>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>OPERATIONS</p>
          <h1>Disputes & refunds</h1>
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
          <section className={styles.panel}>
            <div className={styles.panelHeader}><h2>Open disputes</h2><span>{open.length} to review</span></div>
            <div className={styles.providerList}>
              {open.map((booking) => (
                <article className={styles.disputeCard} key={booking.id}>
                  <div className={styles.providerHeading}>
                    <div>
                      <strong>{booking.customerName}</strong>
                      <div className={styles.timeCell}>Booking {booking.id} · {formatPrice(booking.estimatedTotal)}</div>
                    </div>
                    <span className={`${styles.statusPill} ${styles.statusPending}`}>disputed</span>
                  </div>
                  {booking.disputeReason ? (
                    <p className={styles.disputeReason}>&ldquo;{booking.disputeReason}&rdquo;</p>
                  ) : null}
                  <div className={styles.disputeActions}>
                    <form action={resolveDispute} className={styles.disputeForm}>
                      <input name="orderId" type="hidden" value={booking.id} />
                      <input name="action" type="hidden" value="refund" />
                      <label className={styles.fieldLabel} htmlFor={`refund-${booking.id}`}>REFUND AMOUNT (₹)</label>
                      <input
                        className={styles.textInput}
                        id={`refund-${booking.id}`}
                        inputMode="decimal"
                        max={booking.estimatedTotal}
                        min={1}
                        name="refundAmount"
                        required
                        step="0.01"
                        type="number"
                      />
                      <label className={styles.fieldLabel} htmlFor={`refund-note-${booking.id}`}>NOTE</label>
                      <input className={styles.textInput} id={`refund-note-${booking.id}`} name="note" />
                      <button className={styles.dangerButton} type="submit">Issue refund</button>
                    </form>
                    <form action={resolveDispute} className={styles.disputeForm}>
                      <input name="orderId" type="hidden" value={booking.id} />
                      <input name="action" type="hidden" value="dismiss" />
                      <label className={styles.fieldLabel} htmlFor={`dismiss-note-${booking.id}`}>RESOLUTION NOTE</label>
                      <input className={styles.textInput} id={`dismiss-note-${booking.id}`} name="note" />
                      <button className={styles.smallButton} type="submit">Dismiss, no refund</button>
                    </form>
                  </div>
                </article>
              ))}
              {open.length === 0 ? <p className={styles.emptyState}>No open disputes right now.</p> : null}
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}><h2>Refund history</h2><span>{resolved.length} total</span></div>
            <div className={styles.providerList}>
              {resolved.map((booking) => (
                <article className={styles.providerCard} key={booking.id}>
                  <div className={styles.providerHeading}>
                    <div>
                      <strong>{booking.customerName}</strong>
                      <div className={styles.timeCell}>Booking {booking.id}</div>
                    </div>
                    <span className={styles.statusPill}>{booking.refundAmount ? formatPrice(booking.refundAmount) : "—"}</span>
                  </div>
                  {booking.resolutionNote ? <p className={styles.disputeReason}>{booking.resolutionNote}</p> : null}
                </article>
              ))}
              {resolved.length === 0 ? <p className={styles.emptyState}>No refunds issued yet.</p> : null}
            </div>
          </section>
        </>
      )}
    </>
  );
}
