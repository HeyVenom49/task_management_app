import { describe, beforeEach, test, expect } from "bun:test";
import { resetDb } from "./helper/db";
import { seedAliceBobProjects } from "./helper/seed";
import { api, authHeader } from "./helper/http";

describe("task/project IDOR", () => {
  beforeEach(async () => {
    await resetDb();
  });

  test("Alice cannot GET Bob's project", async () => {
    const { alice, projectB } = await seedAliceBobProjects();

    const res = await api()
      .get(`/api/v1/projects/${projectB.id}`)
      .set(authHeader(alice.accessToken));

    expect(res.status).toBe(403);
  });

  test("Alice cannot list Bob's project", async () => {
    const { alice, bob, projectA, projectB } = await seedAliceBobProjects();

    await api()
      .post(`/api/v1/projects/${projectB.id}/tasks`)
      .set(authHeader(bob.accessToken))
      .send({ title: "Bob task", priority: "MODERATE" });

    const res = await api()
      .get(`/api/v1/projects/${projectB.id}/tasks`)
      .set(authHeader(alice.accessToken));

    expect(res.status).toBe(403);
  });

  test("Alice cannot access Bob's taskId under Project A", async () => {
    const { alice, bob, projectA, projectB } = await seedAliceBobProjects();

    const created = await api()
      .post(`/api/v1/projects/${projectB.id}/tasks`)
      .set(authHeader(bob.accessToken))
      .send({ title: "Secret", priority: "HIGH" });

    const bobTaskId = created.body.task.id as string;

    const getRes = await api()
      .get(`/api/v1/projects/${projectA.id}/tasks/${bobTaskId}`)
      .set(authHeader(alice.accessToken));

    expect(getRes.status).toBe(404);

    const patchRes = await api()
      .patch(`/api/v1/projects/${projectA.id}/tasks/${bobTaskId}`)
      .set(authHeader(alice.accessToken))
      .send({ title: "Hacked" });

    expect(patchRes.status).toBe(404);
  });
});
