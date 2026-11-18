import { logoutAdmin, updatePlatformSettings } from "../../actions";
import { fetchApi } from "../../admin-api";
import SubmitButton from "../../SubmitButton";
import type { PlatformSettings } from "../../types";
import styles from "../../page.module.css";

export const instant = false;

function Message({ error, notice }: { error?: string; notice?: string }) {
  if (error) return <p className={styles.error} role="alert">{error}</p>;
  return notice === "settings-updated"
    ? <p className={styles.success} role="status">Settings saved.</p>
    : null;
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const query = await searchParams;

  let settings: PlatformSettings = { cancellationFeeWindowMinutes: 120, cancellationFeeRatePercent: 10 };
  let loadError = "";

  try {
    settings = await fetchApi<PlatformSettings>("/admin/settings");
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown API error";
    loadError = `Could not load platform settings: ${details}`;
  }

  return (
    <>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>OPERATIONS</p>
          <h1>Platform settings</h1>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.status}><span className={styles.statusDot} />Live data</span>
          <form action={logoutAdmin}><SubmitButton className={styles.actionButton} pendingLabel="Signing out…">Sign out</SubmitButton></form>
        </div>
      </header>

      <Message error={query.error} notice={query.notice} />
      {loadError ? (
        <p className={styles.error} role="alert">{loadError}</p>
      ) : (
        <section className={styles.panel}>
          <div className={styles.panelHeader}><h2>Cancellation policy</h2></div>
          <p className={styles.formHint}>
            Applies when a customer cancels after a partner has already accepted. No fee applies
            outside the window below.
          </p>
          <form action={updatePlatformSettings} className={styles.providerForm}>
            <label className={styles.fieldLabel} htmlFor="cancellation-window">
              FEE APPLIES WITHIN (MINUTES OF THE SCHEDULED START)
            </label>
            <input
              className={styles.textInput}
              defaultValue={settings.cancellationFeeWindowMinutes}
              id="cancellation-window"
              inputMode="numeric"
              min={0}
              name="cancellationFeeWindowMinutes"
              required
              step="1"
              type="number"
            />
            <label className={styles.fieldLabel} htmlFor="cancellation-rate">
              CANCELLATION FEE (% OF BOOKING TOTAL)
            </label>
            <input
              className={styles.textInput}
              defaultValue={settings.cancellationFeeRatePercent}
              id="cancellation-rate"
              inputMode="decimal"
              max={100}
              min={0}
              name="cancellationFeeRatePercent"
              required
              step="0.5"
              type="number"
            />
            <SubmitButton className={styles.primaryButton} pendingLabel="Saving…">Save settings</SubmitButton>
          </form>
        </section>
      )}
    </>
  );
}
