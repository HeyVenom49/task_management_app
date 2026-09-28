import type { MemberRole } from "../types/project";
import type { Task, UpdateTaskInput } from "../types/task";

export type TaskEditMode = "full" | "status" | "none";

export function getTaskEditMode(
  task: Task,
  ownMembershipId: string,
  ownRole: MemberRole,
): TaskEditMode {
  const isOwner = ownRole === "OWNER";
  const isCreator = task.creatorMemberId === ownMembershipId;
  if (isOwner || isCreator) return "full";

  const isAssignee = task.assigneeMemberId === ownMembershipId;
  if (isAssignee) return "status";

  return "none";
}

export function canDeleteTask(
  task: Task,
  ownMembershipId: string,
  ownRole: MemberRole,
): boolean {
  return ownRole === "OWNER" || task.creatorMemberId === ownMembershipId;
}

/** Build a PATCH body that only includes fields this actor may send. */
export function buildTaskUpdateInput(
  mode: TaskEditMode,
  formValues: {
    title: string;
    description: string;
    priority: string;
    status: string;
    assigneeMemberId: string;
  },
  expectedUpdatedAt: string,
): UpdateTaskInput | null {
  if (mode === "none") return null;

  if (mode === "status") {
    return {
      status: formValues.status as UpdateTaskInput["status"],
      expectedUpdatedAt,
    };
  }

  return {
    title: formValues.title.trim(),
    description: formValues.description.trim() === "" ? null : formValues.description.trim(),
    priority: formValues.priority as UpdateTaskInput["priority"],
    status: formValues.status as UpdateTaskInput["status"],
    assigneeMemberId: formValues.assigneeMemberId === "" ? null : formValues.assigneeMemberId,
    expectedUpdatedAt,
  };
}
