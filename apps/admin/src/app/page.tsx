import { assignProvider, createProvider, loginAdmin, logoutAdmin, setProviderVerification } from "./actions";
import { isAdminSessionValid } from "./admin-auth";
import styles from "./page.module.css";

type Service = {
  id: string;
  name: string;
  price: number;
  pricingModel: string;
};

type Provider = {
  id: string;
  name: string;
  phone: string;
  serviceArea: string | null;
  verified: boolean;
  services: { id: string; name: string }[];
};

type Booking = {
  id: string;
  customerName: string;
  serviceId: string;
  serviceName: string;
  people: number;
  date: string;
  time: string;
  estimatedTotal: number;
  status: string;
  assignments: {
    id: string;
    providerId: string;
    providerName: string;
    status: string;
  }[];
};

export const instant = false;

async function fetchApi<T>(path: string): Promise<T> {
  const baseUrl = (process.env.API_BASE_URL ?? "http://localhost:3000/api").replace(/\/+$/, "");
  const adminKey = process.env.API_ADMIN_KEY;
  if (!adminKey) throw new Error("Admin API key is not configured.");

  const response = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    headers: { "x-admin-api-key": adminKey },
  });
  if (!response.ok) throw new Error(`API returned ${response.status} for ${path}`);
  return response.json() as Promise<T>;
}

const formatPrice = (amount: number) =>
  `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

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
    "provider-created": "Provider added. Verify their details before assigning jobs.",
    "provider-updated": "Provider verification updated.",
    "provider-assigned": "Provider assigned to the booking.",
  };
  return notice && messages[notice]
    ? <p className={styles.success} role="status">{messages[notice]}</p>
    : null;
}

function LoginPage({ error }: { error?: string }) {
  return (
    <main className={styles.loginPage}>
      <form action={loginAdmin} className={styles.loginCard}>
        <span className={styles.brandMark}>T</span>
        <p className={styles.eyebrow}>TASK PLATFORM</p>
        <h1>Admin sign in</h1>
        <p className={styles.loginCopy}>Enter the admin key configured for this workspace.</p>
        {error ? <p className={styles.error} role="alert">The key was not accepted. Check it and try again.</p> : null}
        <label className={styles.fieldLabel} htmlFor="admin-key">ADMIN KEY</label>
        <input autoComplete="current-password" className={styles.textInput} id="admin-key" name="key" required type="password" />
        <button className={styles.primaryButton} type="submit">Sign in</button>
      </form>
    </main>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const query = await searchParams;
  if (!(await isAdminSessionValid())) {
    return <LoginPage error={query.error} />;
  }

  let bookings: Booking[] = [];
  let services: Service[] = [];
  let providers: Provider[] = [];
  let loadError = "";

  try {
    [bookings, services, providers] = await Promise.all([
      fetchApi<Booking[]>("/bookings"),
      fetchApi<Service[]>("/services"),
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
    booking.assignments.some((assignment) => !["cancelled", "rejected"].includes(assignment.status)),
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
    <main className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark}>T</span>
          <span>Task Platform</span>
        </div>
        <nav className={styles.navigation} aria-label="Main navigation">
          <a className={styles.navItem} href="#bookings"><span className={styles.navDot} />Bookings</a>
          <a className={styles.navItem} href="#providers"><span className={styles.navDot} />Providers</a>
        </nav>
        <div className={styles.sidebarFooter}>LIVE OPERATIONS</div>
      </aside>

      <section className={styles.content}>
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

            <section className={styles.panel} id="bookings">
              <div className={styles.panelHeader}><h2>Bookings</h2><span>{bookings.length} total</span></div>
              <div className={styles.tableWrap}>
                <table className={styles.bookingsTable}>
                  <thead>
                    <tr><th>Booking</th><th>Customer</th><th>Service</th><th>When</th><th>Total</th><th>Status / assignment</th></tr>
                  </thead>
                  <tbody>
                    {bookings.map((booking) => {
                      const activeAssignments = booking.assignments.filter(
                        (assignment) => !["cancelled", "rejected"].includes(assignment.status),
                      );
                      const eligibleProviders = providers.filter(
                        (provider) => provider.verified && provider.services.some((service) => service.id === booking.serviceId),
                      );
                      const assignableProviders = eligibleProviders.filter(
                        (provider) => !activeAssignments.some((assignment) => assignment.providerId === provider.id),
                      );
                      const slotsRemaining = Math.max(booking.people - activeAssignments.length, 0);
                      return (
                        <tr key={booking.id}>
                          <td>{booking.id}</td>
                          <td>{booking.customerName}</td>
                          <td>{booking.serviceName}</td>
                          <td>
                            {new Date(`${booking.date}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            <div className={styles.timeCell}>{booking.time}</div>
                          </td>
                          <td>{formatPrice(booking.estimatedTotal)}</td>
                          <td>
                            <span className={`${styles.statusPill} ${getStatusClass(booking.status)}`}>{booking.status.replaceAll("_", " ")}</span>
                            {activeAssignments.map((assignment) => (
                              <div className={styles.assignmentLine} key={assignment.id}>
                                {assignment.providerName} · {assignment.status.replaceAll("_", " ")}
                              </div>
                            ))}
                            {slotsRemaining > 0 && assignableProviders.length > 0 ? (
                              <form action={assignProvider} className={styles.inlineForm}>
                                <input name="bookingId" type="hidden" value={booking.id} />
                                <select aria-label={`Choose provider for booking ${booking.id}`} className={styles.selectInput} name="providerId" required>
                                  <option value="">Assign provider…</option>
                                  {assignableProviders.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
                                </select>
                                <button className={styles.smallButton} type="submit">Assign</button>
                              </form>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                    {bookings.length === 0 ? <tr><td colSpan={6}>No bookings have been placed yet.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={styles.providerGrid} id="providers">
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

            <section className={styles.panel}>
              <div className={styles.panelHeader}><h2>Service catalog</h2><span>{services.length} active</span></div>
              <div className={styles.serviceList}>
                {services.map((service) => (
                  <div className={styles.serviceRow} key={service.id}>
                    <div className={styles.serviceMeta}><span>{service.name}</span><small>{formatPrice(service.price)} / person / hour</small></div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
