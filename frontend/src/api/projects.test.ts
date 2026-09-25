import { afterEach, describe, expect, mock, test } from "bun:test";
import * as projectsApi from "./projects";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("projects API layer", () => {
  test("listProjects returns the projects array", async () => {
    globalThis.fetch = mock(async () =>
      jsonResponse(200, {
        projects: [{ id: "p1", creatorId: "u1", info: "Launch plan", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" }],
      }),
    ) as unknown as typeof fetch;

    const result = await projectsApi.listProjects();
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]?.info).toBe("Launch plan");
  });

  test("createProject POSTs info and returns project + membership", async () => {
    const fetchMock = mock(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(init.body as string)).toEqual({ info: "New project" });
      return jsonResponse(201, {
        project: { id: "p1", creatorId: "u1", info: "New project", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
        membership: { id: "m1", userId: "u1", projectId: "p1", role: "OWNER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await projectsApi.createProject("New project");
    expect(result.membership.role).toBe("OWNER");
  });

  test("addMember POSTs the email to /projects/:id/members", async () => {
    const fetchMock = mock(async (url: string, init: RequestInit) => {
      expect(url).toContain("/projects/p1/members");
      expect(JSON.parse(init.body as string)).toEqual({ email: "bo@example.com" });
      return jsonResponse(201, {
        member: { id: "m2", userId: "u2", projectId: "p1", role: "MEMBER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
      });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await projectsApi.addMember("p1", "bo@example.com");
    expect(result.member.role).toBe("MEMBER");
  });

  test("removeMember DELETEs /projects/:id/members/:memberId", async () => {
    const fetchMock = mock(async (url: string, init: RequestInit) => {
      expect(url).toContain("/projects/p1/members/m2");
      expect(init.method).toBe("DELETE");
      return jsonResponse(200, { message: "Member removed" });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await projectsApi.removeMember("p1", "m2");
    expect(result.message).toBe("Member removed");
  });
});
