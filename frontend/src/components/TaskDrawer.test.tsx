import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "../api/client";
import type { MemberWithUser } from "../types/project";
import type { Task } from "../types/task";

const createTaskMock = mock(async () => ({ task: {} }));
const updateTaskMock = mock(async () => ({ task: {} }));
const deleteTaskMock = mock(async () => ({ message: "Task deleted" }));

mock.module("../api/tasks", () => ({
  createTask: createTaskMock,
  updateTask: updateTaskMock,
  deleteTask: deleteTaskMock,
}));

const { TaskDrawer } = await import("./TaskDrawer");

const members: MemberWithUser[] = [
  { id: "m1", userId: "u1", projectId: "p1", role: "OWNER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" },
  { id: "m2", userId: "u2", projectId: "p1", role: "MEMBER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Bo", email: "bo@example.com" },
];

const existingTask: Task = {
  id: "t1",
  projectId: "p1",
  creatorMemberId: "m1",
  assigneeMemberId: null,
  title: "Write the plan",
  description: null,
  priority: "MODERATE",
  status: "NOT_STARTED",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

afterEach(() => {
  createTaskMock.mockReset();
  updateTaskMock.mockReset();
  deleteTaskMock.mockReset();
  createTaskMock.mockImplementation(async () => ({ task: {} }));
  updateTaskMock.mockImplementation(async () => ({ task: {} }));
  deleteTaskMock.mockImplementation(async () => ({ message: "Task deleted" }));
});

describe("TaskDrawer", () => {
  test("create mode: submitting calls createTask and onCreated", async () => {
    createTaskMock.mockImplementation(async () => ({ task: { ...existingTask, id: "t2", title: "New task" } }));
    const onCreated = mock(() => {});

    render(
      <TaskDrawer
        projectId="p1"
        members={members}
        ownMembershipId="m1"
        ownRole="OWNER"
        task={null}
        onClose={() => {}}
        onCreated={onCreated}
        onUpdated={() => {}}
        onDeleted={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "New task" } });
    fireEvent.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(createTaskMock).toHaveBeenCalledTimes(1));
    expect(onCreated).toHaveBeenCalledWith(expect.objectContaining({ title: "New task" }));
  });

  test("edit mode: shows Delete only when the viewer is the creator or an OWNER", () => {
    const { rerender } = render(
      <TaskDrawer
        projectId="p1"
        members={members}
        ownMembershipId="m2"
        ownRole="MEMBER"
        task={existingTask}
        onClose={() => {}}
        onCreated={() => {}}
        onUpdated={() => {}}
        onDeleted={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();

    rerender(
      <TaskDrawer
        projectId="p1"
        members={members}
        ownMembershipId="m1"
        ownRole="OWNER"
        task={existingTask}
        onClose={() => {}}
        onCreated={() => {}}
        onUpdated={() => {}}
        onDeleted={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  test("shows the backend's 'Invalid assignee' message on submit failure", async () => {
    updateTaskMock.mockImplementation(async () => {
      throw new ApiError(400, "Invalid assignee");
    });

    render(
      <TaskDrawer
        projectId="p1"
        members={members}
        ownMembershipId="m1"
        ownRole="OWNER"
        task={existingTask}
        onClose={() => {}}
        onCreated={() => {}}
        onUpdated={() => {}}
        onDeleted={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("Invalid assignee")).toBeInTheDocument());
  });
});
