import { useId, useState } from "react";
import { useForm } from "../hooks/useForm";
import { TextField } from "./ui/TextField";
import { TextArea } from "./ui/TextArea";
import { Button } from "./ui/Button";
import { FormBanner } from "./ui/FormBanner";
import { ApiError } from "../api/client";
import { createTask, deleteTask, updateTask } from "../api/tasks";
import type { MemberRole, MemberWithUser } from "../types/project";
import type { CreateTaskInput, Task, TaskPriority, TaskStatus } from "../types/task";
import styles from "./TaskDrawer.module.css";

type TaskDrawerProps = {
  projectId: string;
  members: MemberWithUser[];
  ownMembershipId: string;
  ownRole: MemberRole;
  task: Task | null;
  onClose: () => void;
  onCreated: (task: Task) => void;
  onUpdated: (task: Task) => void;
  onDeleted: (taskId: string) => void;
};

type TaskFormValues = {
  title: string;
  description: string;
  priority: string;
  status: string;
  assigneeMemberId: string;
};

export function TaskDrawer({
  projectId,
  members,
  ownMembershipId,
  ownRole,
  task,
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
}: TaskDrawerProps) {
  const titleId = useId();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { values, errors, formError, isSubmitting, handleChange, handleBlur, handleSubmit } =
    useForm<TaskFormValues>({
      initialValues: {
        title: task?.title ?? "",
        description: task?.description ?? "",
        priority: task?.priority ?? "MODERATE",
        status: task?.status ?? "NOT_STARTED",
        assigneeMemberId: task?.assigneeMemberId ?? "",
      },
      validators: {
        title: (value) =>
          value.trim().length === 0
            ? "Title is required"
            : value.length > 200
              ? "Title must be 200 characters or fewer"
              : undefined,
        description: (value) => (value.length > 500 ? "Description must be 500 characters or fewer" : undefined),
      },
      async onSubmit(formValues) {
        const input: CreateTaskInput = {
          title: formValues.title.trim(),
          description: formValues.description.trim() === "" ? null : formValues.description.trim(),
          priority: formValues.priority as TaskPriority,
          status: formValues.status as TaskStatus,
          assigneeMemberId: formValues.assigneeMemberId === "" ? null : formValues.assigneeMemberId,
        };
        if (task) {
          const result = await updateTask(projectId, task.id, input);
          onUpdated(result.task);
        } else {
          const result = await createTask(projectId, input);
          onCreated(result.task);
        }
      },
    });

  async function handleDelete(): Promise<void> {
    if (!task) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteTask(projectId, task.id);
      onDeleted(task.id);
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setIsDeleting(false);
    }
  }

  const canDelete = task !== null && (ownRole === "OWNER" || task.creatorMemberId === ownMembershipId);

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <aside
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <div>
            <h2 id={titleId} className={styles.heading}>
              {task ? "Edit task" : "New task"}
            </h2>
            <p className={styles.subheading}>
              {task ? "Update the details, then save." : "Name it, set priority, assign someone."}
            </p>
          </div>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className={styles.body}>
          {(formError || deleteError) && <FormBanner variant="error">{formError ?? deleteError}</FormBanner>}
          <form id="task-drawer-form" onSubmit={handleSubmit} className={styles.form}>
            <TextField
              label="Title"
              value={values.title}
              error={errors.title}
              onChange={(event) => handleChange("title", event.target.value)}
              onBlur={() => handleBlur("title")}
            />
            <TextArea
              label="Description"
              value={values.description}
              error={errors.description}
              onChange={(event) => handleChange("description", event.target.value)}
              onBlur={() => handleBlur("description")}
            />
            <div className={styles.meta}>
              <p className={styles.metaTitle}>Details</p>
              <div className={styles.row}>
                <div className={styles.field}>
                  <label htmlFor="task-priority" className={styles.label}>
                    Priority
                  </label>
                  <select
                    id="task-priority"
                    className={styles.select}
                    value={values.priority}
                    onChange={(event) => handleChange("priority", event.target.value)}
                  >
                    <option value="VERY_LOW">Very low</option>
                    <option value="LOW">Low</option>
                    <option value="MODERATE">Moderate</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
                <div className={styles.field}>
                  <label htmlFor="task-status" className={styles.label}>
                    Status
                  </label>
                  <select
                    id="task-status"
                    className={styles.select}
                    value={values.status}
                    onChange={(event) => handleChange("status", event.target.value)}
                  >
                    <option value="NOT_STARTED">Not started</option>
                    <option value="IN_PROGRESS">In progress</option>
                    <option value="BLOCKED">Blocked</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>
              </div>
              <div className={styles.field}>
                <label htmlFor="task-assignee" className={styles.label}>
                  Assignee
                </label>
                <select
                  id="task-assignee"
                  className={styles.select}
                  value={values.assigneeMemberId}
                  onChange={(event) => handleChange("assigneeMemberId", event.target.value)}
                >
                  <option value="">Unassigned</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </form>
        </div>

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting || isDeleting}>
            Cancel
          </Button>
          {canDelete && (
            <Button
              type="button"
              variant="secondary"
              isLoading={isDeleting}
              disabled={isSubmitting}
              onClick={() => void handleDelete()}
            >
              Delete
            </Button>
          )}
          <Button
            type="submit"
            form="task-drawer-form"
            variant="primary"
            isLoading={isSubmitting}
            disabled={isDeleting}
          >
            {task ? "Save changes" : "Create task"}
          </Button>
        </div>
      </aside>
    </div>
  );
}
