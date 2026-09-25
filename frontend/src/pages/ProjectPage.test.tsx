import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { ApiError } from "../api/client";
import type { MemberWithUser, Project } from "../types/project";

const realAuthContext = { ...(await import("../auth/AuthContext")) };
const useAuthMock = mock(() => ({
  status: "authenticated" as const,
  user: { id: "u1", name: "Ana", email: "ana@example.com", role: "USER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z" },
  login: mock(async () => {}),
  logout: mock(async () => {}),
  clearSession: mock(() => {}),
}));
mock.module("../auth/AuthContext", () => ({ ...realAuthContext, useAuth: useAuthMock }));

const defaultProject: Project = { id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };
const ownerMembership: MemberWithUser = { id: "m1", userId: "u1", projectId: "p1", role: "OWNER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" };

// Note: mock.module snapshots the factory's returned function references at first
// resolution; reassigning an object property afterward (`projectsApiMock.getProject = mock(...)`)
// does not propagate to already-resolved static imports in Bun 1.3.14. Keeping the mock
// function identities stable and swapping behavior via `.mockImplementation()` does.
const getProjectMock = mock(async (): Promise<{ project: Project }> => ({ project: defaultProject }));
const listMembersMock = mock(async (): Promise<{ members: MemberWithUser[] }> => ({ members: [ownerMembership] }));
mock.module("../api/projects", () => ({ getProject: getProjectMock, listMembers: listMembersMock }));

const { ProjectPage } = await import("./ProjectPage");

function renderProjectPage() {
  return render(
    <MemoryRouter initialEntries={["/projects/p1/tasks"]}>
      <Routes>
        <Route path="/projects/:id" element={<ProjectPage />}>
          <Route path="tasks" element={<p>tasks tab content</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  getProjectMock.mockImplementation(async () => ({ project: defaultProject }));
  listMembersMock.mockImplementation(async () => ({ members: [ownerMembership] }));
});

describe("ProjectPage", () => {
  test("renders the project header, role badge, and tab content once loaded", async () => {
    renderProjectPage();
    await waitFor(() => expect(screen.getByText("Launch plan")).toBeInTheDocument());
    expect(screen.getByText("Owner")).toBeInTheDocument();
    expect(screen.getByText("tasks tab content")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });

  test("hides the Settings tab for a MEMBER", async () => {
    listMembersMock.mockImplementation(async () => ({
      members: [{ ...ownerMembership, role: "MEMBER" as const }],
    }));
    renderProjectPage();
    await waitFor(() => expect(screen.getByText("Launch plan")).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();
  });

  test("renders a not-found state on a 403 from getProject", async () => {
    getProjectMock.mockImplementation(async () => {
      throw new ApiError(403, "You do not have access to this project");
    });
    renderProjectPage();
    await waitFor(() => expect(screen.getByText("Project not found.")).toBeInTheDocument());
  });

  test("renders a retry-able error banner on a network/500 failure", async () => {
    getProjectMock.mockImplementation(async () => {
      throw new ApiError(500, "Something went wrong. Please try again.");
    });
    renderProjectPage();
    await waitFor(() => expect(screen.getByText("Something went wrong loading this project.")).toBeInTheDocument());
  });
});

afterAll(() => {
  mock.module("../auth/AuthContext", () => realAuthContext);
});
