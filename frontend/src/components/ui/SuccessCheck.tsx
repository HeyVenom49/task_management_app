import styles from "./SuccessCheck.module.css";

export function SuccessCheck() {
  return (
    <svg
      className={styles.check}
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      role="presentation"
      aria-hidden="true"
    >
      <circle cx="20" cy="20" r="18" stroke="var(--success)" strokeWidth="2" className={styles.circle} />
      <path
        d="M12 20.5l5.5 5.5L28 14.5"
        stroke="var(--success)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={styles.tick}
      />
    </svg>
  );
}
