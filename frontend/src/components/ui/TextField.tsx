import { useId, useState } from "react";
import type { InputHTMLAttributes } from "react";
import styles from "./TextField.module.css";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
};

export function TextField({ label, error, id, type = "text", className, ...rest }: TextFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && revealed ? "text" : type;

  return (
    <div className={[styles.field, className].filter(Boolean).join(" ")}>
      <label htmlFor={fieldId} className={styles.label}>
        {label}
      </label>
      <div className={styles.inputWrap}>
        <input
          {...rest}
          id={fieldId}
          type={inputType}
          className={[styles.input, error ? styles.inputError : ""].filter(Boolean).join(" ")}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
        />
        {isPassword && (
          <button
            type="button"
            className={styles.toggle}
            onClick={() => setRevealed((prev) => !prev)}
            aria-pressed={revealed}
            aria-label={revealed ? "Hide password" : "Show password"}
          >
            <EyeIcon revealed={revealed} />
          </button>
        )}
      </div>
      <p id={errorId} role="alert" className={styles.error} data-visible={Boolean(error)}>
        {error}
      </p>
    </div>
  );
}

function EyeIcon({ revealed }: { revealed: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      {revealed ? (
        <path
          d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5Zm7 2.2A2.2 2.2 0 1 0 8 5.8a2.2 2.2 0 0 0 0 4.4Z"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      ) : (
        <path
          d="M1 1l14 14M6.2 6.4A2.2 2.2 0 0 0 9.7 9.8M3.5 3.7C2 4.8 1 8 1 8s2.5 5 7 5c1.2 0 2.2-.3 3.1-.8M12.7 11c1.4-1.1 2.3-3 2.3-3s-2.5-5-7-5c-.7 0-1.3.1-1.9.2"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      )}
    </svg>
  );
}
