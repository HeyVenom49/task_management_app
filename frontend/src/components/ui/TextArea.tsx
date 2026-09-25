import { useId } from "react";
import type { TextareaHTMLAttributes } from "react";
import styles from "./TextArea.module.css";

type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  error?: string;
};

export function TextArea({ label, error, id, ...rest }: TextAreaProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;

  return (
    <div className={styles.field}>
      <label htmlFor={fieldId} className={styles.label}>
        {label}
      </label>
      <textarea
        {...rest}
        id={fieldId}
        className={[styles.textarea, error ? styles.textareaError : ""].filter(Boolean).join(" ")}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      <p id={errorId} role="alert" className={styles.error} data-visible={Boolean(error)}>
        {error}
      </p>
    </div>
  );
}
