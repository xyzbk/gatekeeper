import type { ReactNode } from 'react';
import { NavLink } from 'react-router';

import styles from '../styles/dashboard.module.css';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <>
      <a className={styles.skipLink} href="#main-content">
        Skip to main content
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
            <NavLink
              aria-label="Worktree reviews"
              className={({ isActive }) =>
                isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
              }
              to="/reviews/worktree"
            >
              Reviews
            </NavLink>
            <NavLink
              aria-label="Project Memory"
              className={({ isActive }) =>
                isActive ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
              }
              to="/memory"
            >
              Memory
            </NavLink>
          </nav>
          <div className={styles.sidebarFooter}>
            <span>Local workspace</span>
            <span>Durable project memory</span>
          </div>
        </aside>
        <div className={styles.workspace}>
          <header className={styles.topbar}>
            <span>Repository intelligence</span>
            <span className={styles.localLabel}>Local dashboard</span>
          </header>
          <main className={styles.main} id="main-content" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
