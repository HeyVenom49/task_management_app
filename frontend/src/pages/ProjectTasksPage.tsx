import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router";
import type { ProjectOutletContext } from "./ProjectPage";
import { listTasks } from "../api/tasks";
import { TaskRow } from "../components/TaskRow";
import { TaskDrawer } from "../components/TaskDrawer";
import { Button } from "../components/ui/Button";
import { Spinner } from "../components/ui/Spinner";
import { FormBanner } from "../components/ui/FormBanner";
import type { Task, TaskPriority, TaskStatus } from "../types/task";
import styles from "./ProjectTasksPage.module.css";

type LoadState = "loading" | "loaded" | "error";

type FetchResult = { ok: true; tasks: Task[] } | { ok: false };

// Plain helper with no setState calls, so it can be invoked from inside the effect
// below via an inline `.then()` without tripping the set-state-in-effect lint rule
// (which flags calling a function that itself synchronously calls setState from
// within an effect body). See ProjectPage.tsx for the same pattern.
async function fetchTasksData(projectId: string): Promise<FetchResult> {
  try {
    const result = await listTasks(projectId);
    return { ok: true, tasks: result.tasks };
  } catch {
    return { ok: false };
  }
}

export function ProjectTasksPage() {
  const { project, members, membership } = useOutletContext<ProjectOutletContext>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "">("");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "">("");
  const [isCreating, setIsCreating] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTasksData(project.id).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setTasks(result.tasks);
        setState("loaded");
      } else {
        setState("error");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  function retry(): void {
    setState("loading");
    fetchTasksData(project.id).then((result) => {
      if (result.ok) {
        setTasks(result.tasks);
        setState("loaded");
      } else {
        setState("error");
      }
    });
  }

  const assigneeNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of members) map.set(member.id, member.name);
    return map;
  }, [members]);

  const filteredTasks = tasks.filter(
    (task) =>
      (statusFilter === "" || task.status === statusFilter) &&
      (priorityFilter === "" || task.priority === priorityFilter),
  );

  const drawerTask = isCreating ? null : editingTask;
  const isDrawerOpen = isCreating || editingTask !== null;

  function closeDrawer(): void {
    setIsCreating(false);
    setEditingTask(null);
  }

  if (state === "loading") {
    return <Spinner label="Loading tasks" />;
  }

  if (state === "error") {
    return (
      <div>
        <FormBanner variant="error">Something went wrong loading tasks.</FormBanner>
        <Button variant="secondary" onClick={retry}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <select
          aria-label="Filter by status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as TaskStatus | "")}
        >
          <option value="">All statuses</option>
          <option value="NOT_STARTED">Not started</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="BLOCKED">Blocked</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <select
          aria-label="Filter by priority"
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value as TaskPriority | "")}
        >
          <option value="">All priorities</option>
          <option value="VERY_LOW">Very low</option>
          <option value="LOW">Low</option>
          <option value="MODERATE">Moderate</option>
          <option value="HIGH">High</option>
          <option value="URGENT">Urgent</option>
        </select>
        <Button variant="primary" onClick={() => setIsCreating(true)}>
          New task
        </Button>
      </div>

      {tasks.length === 0 ? (
        <p className={styles.empty}>No tasks yet — create the first one to get started.</p>
      ) : filteredTasks.length === 0 ? (
        <p className={styles.empty}>No tasks match these filters.</p>
      ) : (
        <div className={styles.list}>
          {filteredTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              assigneeName={task.assigneeMemberId ? (assigneeNames.get(task.assigneeMemberId) ?? null) : null}
              onClick={() => setEditingTask(task)}
            />
          ))}
        </div>
      )}

      {isDrawerOpen && (
        <TaskDrawer
          projectId={project.id}
          members={members}
          ownMembershipId={membership.id}
          ownRole={membership.role}
          task={drawerTask}
          onClose={closeDrawer}
          onCreated={(task) => {
            setTasks((prev) => [task, ...prev]);
            closeDrawer();
          }}
          onUpdated={(task) => {
            setTasks((prev) => prev.map((existing) => (existing.id === task.id ? task : existing)));
            closeDrawer();
          }}
          onDeleted={(taskId) => {
            setTasks((prev) => prev.filter((existing) => existing.id !== taskId));
            closeDrawer();
          }}
        />
      )}
    </div>
  );
}
