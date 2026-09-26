import { afterEach, describe, expect, mock, test } from "bun:test";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router";
import { ApiError } from "../api/client";
import type { ProjectOutletContext } from "./ProjectPage";

// Note: mock.module snapshots the factory's returned function references at first
// resolution; reassigning an object property afterward (`projectsApiMock.addMember = mock(...)`)
// does not propagate to this page's already-resolved static import of ../api/projects in Bun
// 1.3.14. Keeping the mock function identities stable and swapping behavior via
// `.mockImplementation()` does. See ProjectTasksPage.test.tsx for the same pattern.
const addMemberMock = mock(async () => ({ member: {} }));
const removeMemberMock = mock(async () => ({ message: "Member removed" }));

mock.module("../api/projects", () => ({
  addMember: addMemberMock,
  removeMember: removeMemberMock,
}));

const { ProjectMembersPage } = await import("./ProjectMembersPage");

const owner = { id: "m1", userId: "u1", projectId: "p1", role: "OWNER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" };
const member = { id: "m2", userId: "u2", projectId: "p1", role: "MEMBER" as const, status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Bo", email: "bo@example.com" };

function renderMembersPage(context: ProjectOutletContext) {
  return render(
    <MemoryRouter initialEntries={["/projects/p1/members"]}>
      <Routes>
        <Route path="/projects/:id" element={<Outlet context={context} />}>
          <Route path="members" element={<ProjectMembersPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  addMemberMock.mockImplementation(async () => ({ member: {} }));
  removeMemberMock.mockImplementation(async () => ({ message: "Member removed" }));
});

describe("ProjectMembersPage", () => {
  test("owner sees the invite form and a Remove action on other members, not on themselves", async () => {
    const refreshMembers = mock(async () => {});
    renderMembersPage({
      project: { id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      members: [owner, member],
      membership: owner,
      refreshMembers,
      refreshProject: mock(async () => {}),
    });

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    const removeButtons = screen.getAllByRole("button", { name: "Remove" });
    expect(removeButtons).toHaveLength(1); // only Bo's row, not Ana's (the viewer)
  });

  test("member sees no invite form and no Remove actions", async () => {
    renderMembersPage({
      project: { id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      members: [owner, member],
      membership: member,
      refreshMembers: mock(async () => {}),
      refreshProject: mock(async () => {}),
    });

    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });

  test("shows the backend's message when inviting an unverified/unknown email", async () => {
    addMemberMock.mockImplementation(async () => {
      throw new ApiError(400, "User not found or not verified");
    });
    renderMembersPage({
      project: { id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      members: [owner],
      membership: owner,
      refreshMembers: mock(async () => {}),
      refreshProject: mock(async () => {}),
    });

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "unknown@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Invite" }));

    await waitFor(() => expect(screen.getByText("User not found or not verified")).toBeInTheDocument());
  });

  test("shows the backend's message when removing the last owner, visibly inside the still-open confirm dialog", async () => {
    removeMemberMock.mockImplementation(async () => {
      throw new ApiError(400, "Cannot remove the last owner");
    });
    renderMembersPage({
      project: { id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      members: [owner, member],
      membership: owner,
      refreshMembers: mock(async () => {}),
      refreshProject: mock(async () => {}),
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove" }));

    // The error must render *inside* the still-open dialog (where it's actually visible to the
    // user, above the overlay) rather than in the page's background flow, where ConfirmDialog's
    // fixed, full-viewport overlay would cover it.
    await waitFor(() => expect(within(dialog).getByText(/Cannot remove the last owner/)).toBeInTheDocument());
    expect(screen.getByRole("alertdialog")).toBe(dialog);
  });
});
