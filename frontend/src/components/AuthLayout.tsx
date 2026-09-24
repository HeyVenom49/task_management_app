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
      <div className={styles.wordmark}>docket</div>
      <div className={styles.card}>
        <h1 className={styles.title}>{title}</h1>
        {children}
      </div>
      {helper && <p className={styles.helper}>{helper}</p>}
    </div>
  );
}
