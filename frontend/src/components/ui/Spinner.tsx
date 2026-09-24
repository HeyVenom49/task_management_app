import styles from "./Spinner.module.css";

type SpinnerProps = {
  label?: string;
  fullPage?: boolean;
  className?: string;
};

export function Spinner({ label = "Loading", fullPage = false, className }: SpinnerProps) {
  const spinner = (
    <span
      className={[styles.spinner, className].filter(Boolean).join(" ")}
      role="status"
      aria-label={label}
    />
  );
  if (!fullPage) return spinner;
  return <div className={styles.fullPage}>{spinner}</div>;
}
