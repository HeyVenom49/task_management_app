import type { ReactNode } from "react";
import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { Button } from "./ui/Button";
import styles from "./AppShell.module.css";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className={styles.shell}>
      <header className={styles.topBar}>
        <Link to="/" className={styles.wordmark}>
          docket
        </Link>
        <nav className={styles.nav}>
          <Link to="/settings/security">Security</Link>
          <span className={styles.user}>{user?.email}</span>
          <Button variant="secondary" onClick={() => void logout()}>
            Log out
          </Button>
        </nav>
      </header>
      <main className={styles.content}>{children}</main>
    </div>
  );
}
