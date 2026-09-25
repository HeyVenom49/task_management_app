import type { TaskPriority } from "../../types/task";
import styles from "./PriorityPill.module.css";

const LABELS: Record<TaskPriority, string> = {
  VERY_LOW: "Very low",
  LOW: "Low",
  MODERATE: "Moderate",
  HIGH: "High",
  URGENT: "Urgent",
};

export function PriorityPill({ priority }: { priority: TaskPriority }) {
  return <span className={[styles.pill, styles[priority]].join(" ")}>{LABELS[priority]}</span>;
}
