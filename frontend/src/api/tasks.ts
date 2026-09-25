import { apiFetch } from "./client";
import type { CreateTaskInput, Task, UpdateTaskInput } from "../types/task";
import type { MessageResponse } from "../types/auth";

export function listTasks(projectId: string): Promise<{ tasks: Task[] }> {
  return apiFetch<{ tasks: Task[] }>(`/projects/${projectId}/tasks`);
}

export function createTask(projectId: string, input: CreateTaskInput): Promise<{ task: Task }> {
  return apiFetch<{ task: Task }>(`/projects/${projectId}/tasks`, {
    method: "POST",
    body: input,
  });
}

export function updateTask(
  projectId: string,
  taskId: string,
  input: UpdateTaskInput,
): Promise<{ task: Task }> {
  return apiFetch<{ task: Task }>(`/projects/${projectId}/tasks/${taskId}`, {
    method: "PATCH",
    body: input,
  });
}

export function deleteTask(projectId: string, taskId: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>(`/projects/${projectId}/tasks/${taskId}`, {
    method: "DELETE",
  });
}
