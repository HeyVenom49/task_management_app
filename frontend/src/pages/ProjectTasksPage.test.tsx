import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import type { ProjectOutletContext } from "./ProjectPage";
import type { Task } from "../types/task";

// Note: mock.module snapshots the factory's returned function references at first
// resolution; reassigning an object property afterward (`tasksApiMock.listTasks = mock(...)`)
// does not propagate to already-resolved static imports in Bun 1.3.14 (this page's static
// import of ../api/tasks, and TaskDrawer's, which is rendered as a child here). Keeping the
// mock function identities stable and swapping behavior via `.mockImplementation()` does.
const listTasksMock = mock(async (): Promise<{ tasks: Task[] }> => ({ tasks: [] }));
const createTaskMock = mock(async () => ({ task: {} }));
const updateTaskMock = mock(async () => ({ task: {} }));
const deleteTaskMock = mock(async () => ({ message: "Task deleted" }));

mock.module("../api/tasks", () => ({
  listTasks: listTasksMock,
  createTask: createTaskMock,
  updateTask: updateTaskMock,
  deleteTask: deleteTaskMock,
}));

const { ProjectTasksPage } = await import("./ProjectTasksPage");

const baseContext: ProjectOutletContext = {
  project: { id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  members: [
    { id: "m1", userId: "u1", projectId: "p1", role: "OWNER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" },
  ],
  membership: { id: "m1", userId: "u1", projectId: "p1", role: "OWNER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" },
  refreshMembers: mock(async () => {}),
  refreshProject: mock(async () => {}),
};

function renderTasksPage(context: ProjectOutletContext = baseContext) {
  return render(
    <MemoryRouter initialEntries={["/projects/p1/tasks"]}>
      <Routes>
        <Route path="/projects/:id" element={<Outlet context={context} />}>
          <Route path="tasks" element={<ProjectTasksPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  listTasksMock.mockImplementation(async () => ({ tasks: [] }));
  createTaskMock.mockImplementation(async () => ({ task: {} }));
  updateTaskMock.mockImplementation(async () => ({ task: {} }));
  deleteTaskMock.mockImplementation(async () => ({ message: "Task deleted" }));
});

describe("ProjectTasksPage", () => {
  test("shows the empty state when there are no tasks", async () => {
    renderTasksPage();
    await waitFor(() => expect(screen.getByText(/No tasks yet/)).toBeInTheDocument());
  });

  test("lists fetched tasks and resolves the assignee name from members", async () => {
    listTasksMock.mockImplementation(async () => ({
      tasks: [
        { id: "t1", projectId: "p1", creatorMemberId: "m1", assigneeMemberId: "m1", title: "Write the plan", description: null, priority: "MODERATE", status: "NOT_STARTED", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      ],
    }));
    renderTasksPage();
    await waitFor(() => expect(screen.getByText("Write the plan")).toBeInTheDocument());
    expect(screen.getByText("Ana")).toBeInTheDocument();
  });

  test("clicking 'New task' opens the drawer in create mode", async () => {
    renderTasksPage();
    await waitFor(() => expect(screen.getByText(/No tasks yet/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "New task" }));
    expect(screen.getByText("New task", { selector: "h2" })).toBeInTheDocument();
  });
});
