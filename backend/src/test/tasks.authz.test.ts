import { beforeEach, describe, test, expect } from "bun:test";
import { resetDb } from "./helper/db";
import { registerVerifiedUser } from "./helper/auth";
import { api, authHeader } from "./helper/http";

describe("task update authorization", () => {
  beforeEach(async () => {
    await resetDb();
  });

  test("assignee status-only; mixed PATCH rejected; other member blocked", async () => {
    const owner = await registerVerifiedUser({
      name: "Owner",
      email: "owner@example.com",
      password: "password123",
    });
    const assignee = await registerVerifiedUser({
      name: "Assignee",
      email: "assignee@example.com",
      password: "password123",
    });
    const other = await registerVerifiedUser({
      name: "Other",
      email: "other@example.com",
      password: "password123",
    });

    const projectRes = await api()
      .post("/api/v1/projects")
      .set(authHeader(owner.accessToken))
      .send({ info: "Authz project" });
    const projectId = projectRes.body.project.id as string;

    await api()
      .post(`/api/v1/projects/${projectId}/members`)
      .set(authHeader(owner.accessToken))
      .send({ email: "assignee@example.com" });
    await api()
      .post(`/api/v1/projects/${projectId}/members`)
      .set(authHeader(owner.accessToken))
      .send({ email: "other@example.com" });

    const members = await api()
      .get(`/api/v1/projects/${projectId}/members`)
      .set(authHeader(owner.accessToken));
    const assigneeMember = members.body.members.find(
      (m: { email: string }) => m.email === "assignee@example.com",
    );

    const taskRes = await api()
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set(authHeader(owner.accessToken))
      .send({
        title: "Owned by owner",
        priority: "MODERATE",
        assigneeMemberId: assigneeMember.id,
      });
    const taskId = taskRes.body.task.id as string;

    const ok = await api()
      .patch(`/api/v1/projects/${projectId}/tasks/${taskId}`)
      .set(authHeader(assignee.accessToken))
      .send({ status: "IN_PROGRESS" });
    expect(ok.status).toBe(200);

    const mixed = await api()
      .patch(`/api/v1/projects/${projectId}/tasks/${taskId}`)
      .set(authHeader(assignee.accessToken))
      .send({ status: "COMPLETED", priority: "URGENT" });
    expect(mixed.status).toBe(403);

    const blocked = await api()
      .patch(`/api/v1/projects/${projectId}/tasks/${taskId}`)
      .set(authHeader(other.accessToken))
      .send({ status: "COMPLETED" });
    expect(blocked.status).toBe(403);

    const ownerPatch = await api()
      .patch(`/api/v1/projects/${projectId}/tasks/${taskId}`)
      .set(authHeader(owner.accessToken))
      .send({ title: "Renamed", priority: "HIGH" });
    expect(ownerPatch.status).toBe(200);
  });
});
