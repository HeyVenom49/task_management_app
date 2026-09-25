import type { TaskStatus } from "../../types/task";
import styles from "./StatusPill.module.css";

const LABELS: Record<TaskStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
};

export function StatusPill({ status }: { status: TaskStatus }) {
  return <span className={[styles.pill, styles[status]].join(" ")}>{LABELS[status]}</span>;
}
