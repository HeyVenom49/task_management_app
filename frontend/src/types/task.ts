export type TaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "COMPLETED";
export type TaskPriority = "VERY_LOW" | "LOW" | "MODERATE" | "HIGH" | "URGENT";

export type Task = {
  id: string;
  projectId: string;
  creatorMemberId: string;
  assigneeMemberId: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
};

export type CreateTaskInput = {
  title: string;
  description?: string | null;
  priority: TaskPriority;
  status?: TaskStatus;
  assigneeMemberId?: string | null;
};

export type UpdateTaskInput = Partial<CreateTaskInput>;
