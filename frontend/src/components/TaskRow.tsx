import { StatusPill } from "./ui/StatusPill";
import { PriorityPill } from "./ui/PriorityPill";
import type { Task } from "../types/task";
import styles from "./TaskRow.module.css";

type TaskRowProps = {
  task: Task;
  assigneeName: string | null;
  onClick: () => void;
};

export function TaskRow({ task, assigneeName, onClick }: TaskRowProps) {
  return (
    <button type="button" className={styles.row} onClick={onClick}>
      <StatusPill status={task.status} />
      <span className={styles.title}>{task.title}</span>
      <PriorityPill priority={task.priority} />
      <span className={styles.assignee}>{assigneeName ?? "Unassigned"}</span>
      <span className={styles.updatedAt}>{new Date(task.updatedAt).toLocaleDateString()}</span>
    </button>
  );
}
