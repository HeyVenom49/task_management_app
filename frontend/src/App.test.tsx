import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { render, screen, waitFor } from "@testing-library/react";
import { setAccessToken } from "./api/client";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  setAccessToken(null);
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("App routing", () => {
  test("redirects an unauthenticated visitor at / to the login page", async () => {
    globalThis.fetch = mock(async () => jsonResponse(401, { message: "Unauthorized" })) as unknown as typeof fetch;
    const { default: App } = await import("./App");

    render(<App />);
    await waitFor(() => expect(screen.getByText("Sign in")).toBeInTheDocument());
  });

  test("renders NotFoundPage for an unknown route", async () => {
    window.history.pushState({}, "", "/does-not-exist");
    globalThis.fetch = mock(async () => jsonResponse(401, { message: "Unauthorized" })) as unknown as typeof fetch;
    const { default: App } = await import("./App");

    render(<App />);
    await waitFor(() => expect(screen.getByText("Page not found")).toBeInTheDocument());
  });

  test("index-redirects /projects/:id to the tasks tab and renders the empty state", async () => {
    window.history.pushState({}, "", "/projects/11111111-1111-1111-1111-111111111111");
    const responses = [
      jsonResponse(200, { accessToken: "abc123" }), // boot refresh
      jsonResponse(200, {
        user: { id: "u1", name: "Ana", email: "ana@example.com", role: "USER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z" },
      }), // me
      jsonResponse(200, {
        project: { id: "11111111-1111-1111-1111-111111111111", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      }), // getProject
      jsonResponse(200, {
        members: [
          { id: "m1", userId: "u1", projectId: "11111111-1111-1111-1111-111111111111", role: "OWNER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" },
        ],
      }), // listMembers
      jsonResponse(200, { tasks: [] }), // listTasks (ProjectTasksPage)
    ];
    globalThis.fetch = mock(async () => responses.shift()!) as unknown as typeof fetch;
    const { default: App } = await import("./App");

    render(<App />);
    await waitFor(() => expect(screen.getByText(/No tasks yet/)).toBeInTheDocument());
    expect(window.location.pathname).toBe("/projects/11111111-1111-1111-1111-111111111111/tasks");
  });
});
