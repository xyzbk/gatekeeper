import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

import styles from '../styles/dashboard.module.css';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <>
      <a className={styles.skipLink} href="#repository-overview">
        Skip to repository overview
      </a>
      <div className={styles.appShell}>
        <aside className={styles.sidebar}>
          <div className={styles.brand}>Gatekeeper</div>
          <nav aria-label="Primary navigation" className={styles.navigation}>
            <NavLink
              aria-label="Repository overview"
              className={({ isActive }) =>
                isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
              }
              end
              to="/"
            >
              Overview
            </NavLink>
            <span aria-disabled="true" className={styles.navUnavailable}>
              Reviews
              <span>Unavailable</span>
            </span>
            <span aria-disabled="true" className={styles.navUnavailable}>
              Memory
              <span>Unavailable</span>
            </span>
          </nav>
          <div className={styles.sidebarFooter}>
            <span>Local workspace</span>
            <span>Read-only foundation</span>
          </div>
        </aside>
        <div className={styles.workspace}>
          <header className={styles.topbar}>
            <span>Repository intelligence</span>
            <span className={styles.localLabel}>Local dashboard</span>
          </header>
          <main className={styles.main} id="repository-overview" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
