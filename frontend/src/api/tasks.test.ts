import { afterEach, describe, expect, mock, test } from "bun:test";
import * as tasksApi from "./tasks";

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

const sampleTask = {
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

describe("tasks API layer", () => {
  test("listTasks GETs /projects/:id/tasks", async () => {
    const fetchMock = mock(async (url: string) => {
      expect(url).toContain("/projects/p1/tasks");
      return jsonResponse(200, { tasks: [sampleTask] });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await tasksApi.listTasks("p1");
    expect(result.tasks).toHaveLength(1);
  });

  test("createTask POSTs the input body", async () => {
    const fetchMock = mock(async (url: string, init: RequestInit) => {
      expect(url).toContain("/projects/p1/tasks");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({
        title: "Write the plan",
        description: null,
        priority: "MODERATE",
        status: "NOT_STARTED",
        assigneeMemberId: null,
      });
      return jsonResponse(201, { task: sampleTask });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await tasksApi.createTask("p1", {
      title: "Write the plan",
      description: null,
      priority: "MODERATE",
      status: "NOT_STARTED",
      assigneeMemberId: null,
    });
    expect(result.task.id).toBe("t1");
  });

  test("updateTask PATCHes /projects/:id/tasks/:taskId", async () => {
    const fetchMock = mock(async (url: string, init: RequestInit) => {
      expect(url).toContain("/projects/p1/tasks/t1");
      expect(init.method).toBe("PATCH");
      return jsonResponse(200, { task: { ...sampleTask, status: "IN_PROGRESS" } });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await tasksApi.updateTask("p1", "t1", { status: "IN_PROGRESS" });
    expect(result.task.status).toBe("IN_PROGRESS");
  });

  test("deleteTask DELETEs /projects/:id/tasks/:taskId", async () => {
    const fetchMock = mock(async (url: string, init: RequestInit) => {
      expect(url).toContain("/projects/p1/tasks/t1");
      expect(init.method).toBe("DELETE");
      return jsonResponse(200, { message: "Task deleted" });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await tasksApi.deleteTask("p1", "t1");
    expect(result.message).toBe("Task deleted");
  });
});
