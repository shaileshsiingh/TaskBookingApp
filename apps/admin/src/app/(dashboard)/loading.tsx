import styles from "../page.module.css";

export default function DashboardLoading() {
  return (
    <>
      <header className={styles.skeletonHeader}>
        <div>
          <div className={`${styles.skeletonBlock} ${styles.skeletonEyebrow}`} />
          <div className={`${styles.skeletonBlock} ${styles.skeletonTitle}`} />
        </div>
        <div className={`${styles.skeletonBlock} ${styles.skeletonPill}`} />
      </header>

      <div className={styles.skeletonMetrics}>
        {[0, 1, 2, 3].map((index) => (
          <div className={`${styles.skeletonBlock} ${styles.skeletonMetricCard}`} key={index} />
        ))}
      </div>

      <div className={`${styles.skeletonBlock} ${styles.skeletonPanel}`} />
    </>
  );
}
