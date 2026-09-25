import { AppShell } from "../components/AppShell";
import { useAuth } from "../auth/AuthContext";
import styles from "./DashboardPage.module.css";

export function DashboardPage() {
  const { user } = useAuth();

  return (
    <AppShell>
      <h1 className={styles.heading}>Welcome, {user?.name}</h1>
      <div className={styles.empty}>
        <p>Projects aren't available yet.</p>
        <p className={styles.detail}>
          This is where your projects and tasks will show up once that part of Docket is built.
        </p>
      </div>
    </AppShell>
  );
}
