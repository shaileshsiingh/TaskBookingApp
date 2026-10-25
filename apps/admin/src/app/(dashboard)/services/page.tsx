import { createCategory, createService, logoutAdmin, updateCategory, updateService } from "../../actions";
import { fetchApi } from "../../admin-api";
import type { AdminCatalog } from "../../types";
import styles from "../../page.module.css";

export const instant = false;

const pricingModelLabels: Record<string, string> = {
  FIXED: "Fixed",
  HOURLY: "Hourly",
  PER_PERSON: "Per person",
  DURATION_BASED: "Duration based",
  DISTANCE_BASED: "Distance based",
};
const pricingModels = Object.keys(pricingModelLabels);

function Message({ error, notice }: { error?: string; notice?: string }) {
  if (error) return <p className={styles.error} role="alert">{error}</p>;
  const messages: Record<string, string> = {
    "category-created": "Category added.",
    "category-updated": "Category updated.",
    "service-created": "Service added to the catalog.",
    "service-updated": "Service updated.",
  };
  return notice && messages[notice]
    ? <p className={styles.success} role="status">{messages[notice]}</p>
    : null;
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const query = await searchParams;

  let catalog: AdminCatalog = { categories: [], services: [] };
  let loadError = "";

  try {
    catalog = await fetchApi<AdminCatalog>("/admin/catalog");
  } catch (error) {
    const details = error instanceof Error ? error.message : "Unknown API error";
    loadError = `Could not load the catalog: ${details}`;
  }

  return (
    <>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>OPERATIONS</p>
          <h1>Services & pricing</h1>
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
            <div className={styles.panelHeader}><h2>Services</h2><span>{catalog.services.length} total</span></div>
            <div className={styles.serviceEditList}>
              {catalog.services.map((service) => (
                <form action={updateService} className={styles.serviceEditRow} key={service.id}>
                  <input name="serviceId" type="hidden" value={service.id} />
                  <div className={styles.serviceEditHeading}>
                    <strong>{service.name}</strong>
                    <span className={styles.timeCell}>{service.categoryName}</span>
                  </div>
                  <label className={styles.fieldLabel} htmlFor={`price-${service.id}`}>PRICE (₹)</label>
                  <input
                    className={styles.textInput}
                    defaultValue={service.price}
                    id={`price-${service.id}`}
                    inputMode="decimal"
                    min={1}
                    name="price"
                    required
                    step="0.01"
                    type="number"
                  />
                  <label className={styles.fieldLabel} htmlFor={`pricing-model-${service.id}`}>PRICING MODEL</label>
                  <select
                    className={styles.selectInput}
                    defaultValue={service.pricingModel}
                    id={`pricing-model-${service.id}`}
                    name="pricingModel"
                  >
                    {pricingModels.map((model) => (
                      <option key={model} value={model}>{pricingModelLabels[model]}</option>
                    ))}
                  </select>
                  <label className={styles.checkboxRow}>
                    <input defaultChecked={service.active} name="active" type="checkbox" value="true" />
                    Active (bookable by customers)
                  </label>
                  <button className={styles.smallButton} type="submit">Save</button>
                </form>
              ))}
              {catalog.services.length === 0 ? <p className={styles.emptyState}>No services yet.</p> : null}
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeader}><h2>Add service</h2></div>
            <form action={createService} className={styles.providerForm}>
              <label className={styles.fieldLabel} htmlFor="service-category">CATEGORY</label>
              <select className={styles.selectInput} id="service-category" name="categoryId" required>
                <option value="">Choose a category…</option>
                {catalog.categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <label className={styles.fieldLabel} htmlFor="service-name">NAME</label>
              <input className={styles.textInput} id="service-name" name="name" required />
              <label className={styles.fieldLabel} htmlFor="service-description">DESCRIPTION (OPTIONAL)</label>
              <input className={styles.textInput} id="service-description" name="description" />
              <label className={styles.fieldLabel} htmlFor="service-pricing-model">PRICING MODEL</label>
              <select className={styles.selectInput} id="service-pricing-model" name="pricingModel">
                {pricingModels.map((model) => (
                  <option key={model} value={model}>{pricingModelLabels[model]}</option>
                ))}
              </select>
              <label className={styles.fieldLabel} htmlFor="service-price">PRICE (₹)</label>
              <input
                className={styles.textInput}
                id="service-price"
                inputMode="decimal"
                min={1}
                name="price"
                required
                step="0.01"
                type="number"
              />
              <button className={styles.primaryButton} type="submit">Add service</button>
            </form>

            <div className={`${styles.panelHeader} ${styles.panelHeaderSpaced}`}>
              <h2>Categories</h2><span>{catalog.categories.length} total</span>
            </div>
            <div className={styles.providerList}>
              {catalog.categories.map((category) => (
                <article className={styles.providerCard} key={category.id}>
                  <div className={styles.providerHeading}>
                    <strong>{category.name}</strong>
                    <span className={`${styles.statusPill} ${category.active ? styles.statusAssigned : styles.statusPending}`}>
                      {category.active ? "active" : "hidden"}
                    </span>
                  </div>
                  <form action={updateCategory}>
                    <input name="categoryId" type="hidden" value={category.id} />
                    <input name="active" type="hidden" value={String(!category.active)} />
                    <button className={styles.smallButton} type="submit">
                      {category.active ? "Hide category" : "Show category"}
                    </button>
                  </form>
                </article>
              ))}
            </div>
            <form action={createCategory} className={`${styles.providerForm} ${styles.sectionSpaced}`}>
              <label className={styles.fieldLabel} htmlFor="category-name">NEW CATEGORY NAME</label>
              <input className={styles.textInput} id="category-name" name="name" required />
              <button className={styles.smallButton} type="submit">Add category</button>
            </form>
          </div>
        </section>
      )}
    </>
  );
}
