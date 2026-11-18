import Link from "next/link";
import { fetchApi } from "../../../../admin-api";
import type { BookingHistoryEntry } from "../../../../types";
import styles from "../../../../page.module.css";

export const instant = false;

const actionLabels: Record<string, string> = {
  cancelled: "Booking cancelled",
  dispute_dismissed: "Dispute dismissed",
  refunded: "Refund issued",
  provider_assigned: "Provider assigned by admin",
  assignment_accepted: "Partner accepted",
  assignment_rejected: "Partner declined",
  assignment_cancelled: "Partner cancelled",
  assignment_on_the_way: "Partner on the way",
  assignment_arrived: "Partner arrived",
  assignment_started: "Job started",
  assignment_completed: "Job completed",
};

export default async function BookingHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let history: BookingHistoryEntry[] = [];
  let loadError = "";

  try {
    history = await fetchApi<BookingHistoryEntry[]>(`/bookings/${encodeURIComponent(id)}/history`);
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown API error";
    loadError = `Could not load history: ${details}`;
  }

  return (
    <>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>BOOKING {id}</p>
          <h1>Change history</h1>
        </div>
        <Link className={styles.actionButton} href="/bookings">Back to bookings</Link>
      </header>

      {loadError ? (
        <p className={styles.error} role="alert">{loadError}</p>
      ) : (
        <section className={styles.panel}>
          <div className={styles.panelHeader}><h2>Timeline</h2><span>{history.length} entries, most recent first</span></div>
          <div className={styles.providerList}>
            {history.map((entry) => (
              <article className={styles.providerCard} key={entry.id}>
                <div className={styles.providerHeading}>
                  <strong>{actionLabels[entry.actionType] ?? entry.actionType}</strong>
                  <span className={styles.timeCell}>
                    {new Date(entry.createdAt).toLocaleString("en-IN")}
                  </span>
                </div>
                <p className={styles.providerSkills}>By {entry.modifiedBy}</p>
                {entry.updatedValues ? (
                  <p className={styles.timeCell}>{JSON.stringify(entry.updatedValues)}</p>
                ) : null}
              </article>
            ))}
            {history.length === 0 ? <p className={styles.emptyState}>No changes recorded yet.</p> : null}
          </div>
        </section>
      )}
    </>
  );
}
