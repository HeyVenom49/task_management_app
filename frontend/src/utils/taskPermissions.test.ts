import { describe, expect, test } from "bun:test";
import type { Task } from "../types/task";
import { buildTaskUpdateInput, canDeleteTask, getTaskEditMode } from "./taskPermissions";

const task: Task = {
  id: "t1",
  projectId: "p1",
  creatorMemberId: "m-creator",
  assigneeMemberId: "m-assignee",
  title: "Plan",
  description: null,
  priority: "MODERATE",
  status: "NOT_STARTED",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

describe("getTaskEditMode", () => {
  test("OWNER gets full edit even when not creator/assignee", () => {
    expect(getTaskEditMode(task, "m-other", "OWNER")).toBe("full");
  });

  test("creator gets full edit", () => {
    expect(getTaskEditMode(task, "m-creator", "MEMBER")).toBe("full");
  });

  test("assignee gets status-only", () => {
    expect(getTaskEditMode(task, "m-assignee", "MEMBER")).toBe("status");
  });

  test("other member gets none", () => {
    expect(getTaskEditMode(task, "m-other", "MEMBER")).toBe("none");
  });
});

describe("canDeleteTask", () => {
  test("owner or creator can delete", () => {
    expect(canDeleteTask(task, "m-other", "OWNER")).toBe(true);
    expect(canDeleteTask(task, "m-creator", "MEMBER")).toBe(true);
    expect(canDeleteTask(task, "m-assignee", "MEMBER")).toBe(false);
  });
});

describe("buildTaskUpdateInput", () => {
  const form = {
    title: " Renamed ",
    description: "",
    priority: "HIGH",
    status: "COMPLETED",
    assigneeMemberId: "m-assignee",
  };

  test("status mode only includes status", () => {
    expect(buildTaskUpdateInput("status", form)).toEqual({ status: "COMPLETED" });
  });

  test("full mode includes all fields", () => {
    expect(buildTaskUpdateInput("full", form)).toEqual({
      title: "Renamed",
      description: null,
      priority: "HIGH",
      status: "COMPLETED",
      assigneeMemberId: "m-assignee",
    });
  });

  test("none returns null", () => {
    expect(buildTaskUpdateInput("none", form)).toBeNull();
  });
});
