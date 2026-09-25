import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { Member, Project } from "../types/project";

const realAuthContext = { ...(await import("../auth/AuthContext")) };
const useAuthMock = mock(() => ({
  status: "authenticated" as const,
  user: { id: "u1", name: "Ana", email: "ana@example.com", role: "USER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z" },
  login: mock(async () => {}),
  logout: mock(async () => {}),
  clearSession: mock(() => {}),
}));
mock.module("../auth/AuthContext", () => ({ ...realAuthContext, useAuth: useAuthMock }));

// Note: mock.module snapshots the factory's returned function references at first
// resolution; reassigning an object property afterward (`projectsApiMock.listProjects = mock(...)`)
// does not propagate to already-resolved static imports in Bun 1.3.14. Keeping the mock
// function identities stable and swapping behavior via `.mockImplementation()` does. See
// ProjectPage.test.tsx for the same pattern.
const listProjectsMock = mock(async (): Promise<{ projects: Project[] }> => ({ projects: [] }));
const createProjectMock = mock(
  async (): Promise<{ project: Project; membership: Member }> => ({
    project: { id: "p0", creatorId: "u1", info: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    membership: { id: "m0", userId: "u1", projectId: "p0", role: "OWNER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  }),
);
mock.module("../api/projects", () => ({ listProjects: listProjectsMock, createProject: createProjectMock }));

const { DashboardPage } = await import("./DashboardPage");

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  listProjectsMock.mockImplementation(async () => ({ projects: [] }));
  createProjectMock.mockImplementation(async () => ({
    project: { id: "p0", creatorId: "u1", info: "", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    membership: { id: "m0", userId: "u1", projectId: "p0", role: "OWNER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
  }));
});

describe("DashboardPage", () => {
  test("shows an honest empty state when the user has no projects", async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText("You don't have any projects yet.")).toBeInTheDocument());
  });

  test("lists projects and marks the ones the user created", async () => {
    listProjectsMock.mockImplementation(async () => ({
      projects: [
        { id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        { id: "p2", creatorId: "u2", info: "Someone else's project", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      ],
    }));
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Launch plan")).toBeInTheDocument());
    expect(screen.getByText("Created by you")).toBeInTheDocument();
    expect(screen.getByText("Shared with you")).toBeInTheDocument();
  });

  test("creating a project adds it to the list", async () => {
    createProjectMock.mockImplementation(async () => ({
      project: { id: "p3", creatorId: "u1", info: "Brand new project", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      membership: { id: "m1", userId: "u1", projectId: "p3", role: "OWNER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    }));
    renderDashboard();
    await waitFor(() => expect(screen.getByText("You don't have any projects yet.")).toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "New project" }));
    fireEvent.change(screen.getByLabelText("What's this project about?"), { target: { value: "Brand new project" } });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => expect(screen.getByText("Brand new project")).toBeInTheDocument());
  });
});

afterAll(() => {
  mock.module("../auth/AuthContext", () => realAuthContext);
});
