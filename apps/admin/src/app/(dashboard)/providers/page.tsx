import { createProvider, logoutAdmin, setProviderVerification } from "../../actions";
import { fetchApi } from "../../admin-api";
import type { Provider, Service } from "../../types";
import styles from "../../page.module.css";

export const instant = false;

function Message({ error, notice }: { error?: string; notice?: string }) {
  if (error) return <p className={styles.error} role="alert">{error}</p>;
  const messages: Record<string, string> = {
    "provider-created": "Provider added. Verify their details before assigning jobs.",
    "provider-updated": "Provider verification updated.",
  };
  return notice && messages[notice]
    ? <p className={styles.success} role="status">{messages[notice]}</p>
    : null;
}

export default async function ProvidersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const query = await searchParams;

  let providers: Provider[] = [];
  let services: Service[] = [];
  let loadError = "";

  try {
    [providers, services] = await Promise.all([
      fetchApi<Provider[]>("/providers"),
      fetchApi<Service[]>("/services"),
    ]);
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown API error";
    loadError = `Could not load provider data: ${details}`;
  }

  return (
    <>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>OPERATIONS</p>
          <h1>Providers</h1>
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
        <section className={styles.providerGrid}>
          <div className={styles.panel}>
            <div className={styles.panelHeader}><h2>Providers</h2><span>{providers.length} profiles</span></div>
            <div className={styles.providerList}>
              {providers.map((provider) => (
                <article className={styles.providerCard} key={provider.id}>
                  <div className={styles.providerHeading}>
                    <div><strong>{provider.name}</strong><div className={styles.timeCell}>{provider.phone} · {provider.serviceArea}</div></div>
                    <span className={`${styles.statusPill} ${provider.verified ? styles.statusAssigned : styles.statusPending}`}>
                      {provider.verified ? "verified" : "pending review"}
                    </span>
                  </div>
                  <p className={styles.providerSkills}>{provider.services.map((service) => service.name).join(", ")}</p>
                  {provider.verified ? (
                    <span className={`${styles.statusPill} ${provider.available ? styles.statusAssigned : styles.statusPending}`}>
                      {provider.available ? "available" : "off duty"}
                    </span>
                  ) : null}
                  <form action={setProviderVerification}>
                    <input name="providerId" type="hidden" value={provider.id} />
                    <input name="verified" type="hidden" value={String(!provider.verified)} />
                    <button className={styles.smallButton} type="submit">
                      {provider.verified ? "Remove verification" : "Verify provider"}
                    </button>
                  </form>
                </article>
              ))}
              {providers.length === 0 ? <p className={styles.emptyState}>No providers yet. Add the first provider using the form.</p> : null}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}><h2>Add provider</h2></div>
            <p className={styles.formHint}>New providers start unverified and cannot be assigned until reviewed.</p>
            <form action={createProvider} className={styles.providerForm}>
              <label className={styles.fieldLabel} htmlFor="provider-name">NAME</label>
              <input className={styles.textInput} id="provider-name" name="name" required />
              <label className={styles.fieldLabel} htmlFor="provider-phone">10-DIGIT PHONE</label>
              <input className={styles.textInput} id="provider-phone" inputMode="numeric" maxLength={14} name="phone" required />
              <label className={styles.fieldLabel} htmlFor="provider-area">SERVICE AREA</label>
              <input className={styles.textInput} id="provider-area" name="serviceArea" required />
              <fieldset className={styles.serviceChoices}>
                <legend className={styles.fieldLabel}>SERVICES</legend>
                {services.map((service) => (
                  <label className={styles.checkboxRow} key={service.id}>
                    <input name="serviceIds" type="checkbox" value={service.id} />
                    {service.name}
                  </label>
                ))}
              </fieldset>
              <button className={styles.primaryButton} type="submit">Add provider</button>
            </form>
          </div>
        </section>
      )}
    </>
  );
}
