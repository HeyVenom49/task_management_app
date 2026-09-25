import { apiFetch } from "./client";
import type { Member, MemberWithUser, Project } from "../types/project";
import type { MessageResponse } from "../types/auth";

export function listProjects(): Promise<{ projects: Project[] }> {
  return apiFetch<{ projects: Project[] }>("/projects");
}

export function createProject(info: string): Promise<{ project: Project; membership: Member }> {
  return apiFetch<{ project: Project; membership: Member }>("/projects", {
    method: "POST",
    body: { info },
  });
}

export function getProject(id: string): Promise<{ project: Project }> {
  return apiFetch<{ project: Project }>(`/projects/${id}`);
}

export function updateProject(id: string, info: string): Promise<{ project: Project }> {
  return apiFetch<{ project: Project }>(`/projects/${id}`, {
    method: "PATCH",
    body: { info },
  });
}

export function deleteProject(id: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>(`/projects/${id}`, { method: "DELETE" });
}

export function listMembers(projectId: string): Promise<{ members: MemberWithUser[] }> {
  return apiFetch<{ members: MemberWithUser[] }>(`/projects/${projectId}/members`);
}

export function addMember(projectId: string, email: string): Promise<{ member: Member }> {
  return apiFetch<{ member: Member }>(`/projects/${projectId}/members`, {
    method: "POST",
    body: { email },
  });
}

export function removeMember(projectId: string, memberId: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>(`/projects/${projectId}/members/${memberId}`, {
    method: "DELETE",
  });
}
