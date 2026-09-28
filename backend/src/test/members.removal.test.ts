import { beforeEach, describe, expect, test } from "bun:test";
import { resetDb } from "./helper/db";
import { registerVerifiedUser } from "./helper/auth";
import { api, authHeader } from "./helper/http";

describe("member removal", () => {
  beforeEach(async () => {
    await resetDb();
  });

  test("cannot remove member assigned to open task -> 409; ok after complete", async () => {
    const owner = await registerVerifiedUser({
      name: "Owner",
      email: "owner-rm@example.com",
      password: "password123",
    });
    const bob = await registerVerifiedUser({
      name: "Bob",
      email: "bob-rm@example.com",
      password: "password123",
    });

    const project = await api()
      .post("/api/v1/projects")
      .set(authHeader(owner.accessToken))
      .send({ info: "Removal project" });
    const projectId = project.body.project.id as string;

    await api()
      .post(`/api/v1/projects/${projectId}/members`)
      .set(authHeader(owner.accessToken))
      .send({ email: "bob-rm@example.com" });

    const members = await api()
      .get(`/api/v1/projects/${projectId}/members`)
      .set(authHeader(owner.accessToken));
    const bobMember = members.body.members.find(
      (m: { email: string }) => m.email === "bob-rm@example.com",
    );
    expect(bobMember).toBeTruthy();

    const task = await api()
      .post(`/api/v1/projects/${projectId}/tasks`)
      .set(authHeader(owner.accessToken))
      .send({
        title: "Bob work",
        priority: "MODERATE",
        assigneeMemberId: bobMember.id,
        status: "IN_PROGRESS",
      });
    expect(task.status).toBe(201);
    const taskId = task.body.task.id as string;

    const blocked = await api()
      .delete(`/api/v1/projects/${projectId}/members/${bobMember.id}`)
      .set(authHeader(owner.accessToken));
    expect(blocked.status).toBe(409);

    const completed = await api()
      .patch(`/api/v1/projects/${projectId}/tasks/${taskId}`)
      .set(authHeader(owner.accessToken))
      .send({
        status: "COMPLETED",
        expectedUpdatedAt: task.body.task.updatedAt,
      });
    expect(completed.status).toBe(200);

    const removed = await api()
      .delete(`/api/v1/projects/${projectId}/members/${bobMember.id}`)
      .set(authHeader(owner.accessToken));
    expect(removed.status).toBe(200);
  });

  test("parallel remove vs assign -> never inactive with open assignment", async () => {
    const owner = await registerVerifiedUser({
      name: "OwnerRace",
      email: "owner-race@example.com",
      password: "password123",
    });
    await registerVerifiedUser({
      name: "BobRace",
      email: "bob-race@example.com",
      password: "password123",
    });

    const project = await api()
      .post("/api/v1/projects")
      .set(authHeader(owner.accessToken))
      .send({ info: "Remove assign race" });
    const projectId = project.body.project.id as string;

    await api()
      .post(`/api/v1/projects/${projectId}/members`)
      .set(authHeader(owner.accessToken))
      .send({ email: "bob-race@example.com" });

    const members = await api()
      .get(`/api/v1/projects/${projectId}/members`)
      .set(authHeader(owner.accessToken));
    const bobMember = members.body.members.find(
      (m: { email: string }) => m.email === "bob-race@example.com",
    );
    expect(bobMember).toBeTruthy();

    await Promise.all([
      api()
        .delete(`/api/v1/projects/${projectId}/members/${bobMember.id}`)
        .set(authHeader(owner.accessToken)),
      api()
        .post(`/api/v1/projects/${projectId}/tasks`)
        .set(authHeader(owner.accessToken))
        .send({
          title: "Race task",
          priority: "MODERATE",
          assigneeMemberId: bobMember.id,
          status: "IN_PROGRESS",
        }),
    ]);

    const afterMembers = await api()
      .get(`/api/v1/projects/${projectId}/members`)
      .set(authHeader(owner.accessToken));
    expect(afterMembers.status).toBe(200);

    // list endpoint returns ACTIVE only — missing Bob means removed
    const bobStillActive = (
      afterMembers.body.members as Array<{ id: string }>
    ).some((m) => m.id === bobMember.id);

    const tasks = await api()
      .get(`/api/v1/projects/${projectId}/tasks`)
      .set(authHeader(owner.accessToken));
    expect(tasks.status).toBe(200);

    const openOnBob = (
      tasks.body.tasks as Array<{
        assigneeMemberId: string | null;
        status: string;
      }>
    ).filter(
      (t) =>
        t.assigneeMemberId === bobMember.id && t.status !== "COMPLETED",
    );

    if (!bobStillActive) {
      expect(openOnBob).toHaveLength(0);
    }
  });
});
