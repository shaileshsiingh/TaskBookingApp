"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "../page.module.css";

const navItems = [
  { href: "/bookings", label: "Bookings" },
  { href: "/providers", label: "Providers" },
  { href: "/services", label: "Services" },
  { href: "/users", label: "Users" },
  { href: "/disputes", label: "Disputes" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <span className={styles.brandMark}>T</span>
        <span>Task Platform</span>
      </div>
      <nav className={styles.navigation} aria-label="Main navigation">
        {navItems.map((item) => {
          const active = pathname?.startsWith(item.href) ?? false;
          return (
            <Link
              key={item.href}
              className={`${styles.navItem} ${active ? styles.active : ""}`}
              href={item.href}
            >
              <span className={styles.navDot} />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className={styles.sidebarFooter}>LIVE OPERATIONS</div>
    </aside>
  );
}
