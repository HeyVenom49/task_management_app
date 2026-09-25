import { useId } from "react";
import { Button } from "./Button";
import styles from "./ConfirmDialog.module.css";

type ConfirmDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  isConfirming = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();

  return (
    <div className={styles.overlay} role="presentation" onClick={onCancel}>
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>
        <p className={styles.description}>{description}</p>
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onCancel} disabled={isConfirming}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onConfirm} isLoading={isConfirming}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
