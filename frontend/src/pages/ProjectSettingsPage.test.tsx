import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { ApiError } from "../api/client";
import type { ProjectOutletContext } from "./ProjectPage";

// Note: mock.module snapshots the factory's returned function references at first
// resolution; reassigning an object property afterward (`projectsApiMock.updateProject = mock(...)`)
// does not propagate to this page's already-resolved static import of ../api/projects in Bun
// 1.3.14. Keeping the mock function identities stable and swapping behavior via
// `.mockImplementation()` does. See ProjectMembersPage.test.tsx for the same pattern.
const updateProjectMock = mock(async () => ({ project: {} }));
const deleteProjectMock = mock(async () => ({ message: "Project deleted" }));

mock.module("../api/projects", () => ({
  updateProject: updateProjectMock,
  deleteProject: deleteProjectMock,
}));

const { ProjectSettingsPage } = await import("./ProjectSettingsPage");

const owner = { id: "m1", userId: "u1", projectId: "p1", role: "OWNER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" };
const member = { id: "m2", userId: "u2", projectId: "p1", role: "MEMBER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Bo", email: "bo@example.com" };
const project = { id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" };

function renderSettingsPage(context: ProjectOutletContext) {
  return render(
    <MemoryRouter initialEntries={["/projects/p1/settings"]}>
      <Routes>
        <Route path="/projects/:id" element={<Outlet context={context} />}>
          <Route path="settings" element={<ProjectSettingsPage />} />
          <Route path="tasks" element={<p>tasks tab</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  updateProjectMock.mockImplementation(async () => ({ project: {} }));
  deleteProjectMock.mockImplementation(async () => ({ message: "Project deleted" }));
});

describe("ProjectSettingsPage", () => {
  test("redirects a MEMBER to the tasks tab instead of showing the form", async () => {
    renderSettingsPage({ project, members: [owner, member], membership: member, refreshMembers: mock(async () => {}) });
    await waitFor(() => expect(screen.getByText("tasks tab")).toBeInTheDocument());
  });

  test("an OWNER can submit the info form", async () => {
    renderSettingsPage({ project, members: [owner], membership: owner, refreshMembers: mock(async () => {}) });
    fireEvent.change(screen.getByLabelText("Project info"), { target: { value: "Updated plan" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(updateProjectMock).toHaveBeenCalledWith("p1", "Updated plan"));
  });

  test("confirming delete calls deleteProject", async () => {
    renderSettingsPage({ project, members: [owner], membership: owner, refreshMembers: mock(async () => {}) });
    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleteProjectMock).toHaveBeenCalledWith("p1"));
  });

  test("shows the backend's message when delete fails, visibly inside the still-open confirm dialog", async () => {
    deleteProjectMock.mockImplementation(async () => {
      throw new ApiError(500, "Something went wrong while deleting the project");
    });
    renderSettingsPage({ project, members: [owner], membership: owner, refreshMembers: mock(async () => {}) });

    fireEvent.click(screen.getByRole("button", { name: "Delete project" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    // The error must render *inside* the still-open dialog (where it's actually visible to the
    // user, above the overlay) rather than in the page's background flow, where ConfirmDialog's
    // fixed, full-viewport overlay would cover it.
    await waitFor(() =>
      expect(within(dialog).getByText(/Something went wrong while deleting the project/)).toBeInTheDocument(),
    );
    expect(screen.getByRole("alertdialog")).toBe(dialog);
  });
});
