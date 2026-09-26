import type { ReactNode } from "react";
import styles from "./AuthLayout.module.css";

type AuthLayoutProps = {
  title: string;
  helper?: ReactNode;
  children: ReactNode;
};

export function AuthLayout({ title, helper, children }: AuthLayoutProps) {
  return (
    <div className={styles.page}>
      <aside className={styles.brand}>
        <div className={styles.brandInner}>
          <div className={styles.wordmark}>docket</div>
          <p className={styles.tagline}>
            Your calm desk for projects that get busy.
          </p>
        </div>
        <div className={styles.brandGlow} aria-hidden="true" />
      </aside>

      <div className={styles.panel}>
        <div className={styles.card}>
          <h1 className={styles.title}>{title}</h1>
          {children}
          {helper && <p className={styles.helper}>{helper}</p>}
        </div>
      </div>
    </div>
  );
}
