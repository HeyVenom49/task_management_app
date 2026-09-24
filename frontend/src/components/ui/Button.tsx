import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "./Spinner";
import styles from "./Button.module.css";

type ButtonVariant = "primary" | "secondary" | "text";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  isLoading?: boolean;
};

export function Button({
  variant = "primary",
  isLoading = false,
  disabled,
  children,
  className,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      className={[styles.button, styles[variant], className].filter(Boolean).join(" ")}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
    >
      <span className={styles.label}>{children}</span>
      {isLoading && (
        <span className={styles.spinnerSlot}>
          <Spinner label="" />
        </span>
      )}
    </button>
  );
}
