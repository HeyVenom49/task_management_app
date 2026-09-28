import { beforeEach, describe, expect, test } from "bun:test";
import { resetDb } from "./helper/db";
import { api, authHeader } from "./helper/http";
import { registerVerifiedUser } from "./helper/auth";

describe("concurrency", () => {
  beforeEach(async () => {
    await resetDb();
  });

  test("parallel duplicate register -> one success, one conflict", async () => {
    const body = {
      name: "Dup",
      email: "dup@example.com",
      password: "password123",
    };

    const [a, b] = await Promise.all([
      api().post("/api/v1/auth/register").send(body),
      api().post("/api/v1/auth/register").send(body),
    ]);

    const statues = [a.status, b.status].sort();

    expect(statues).toEqual([201, 409]);
  });

  test("parallel refresh with same token -> at most one success", async () => {
    const reg = await api().post("/api/v1/auth/register").send({
      name: "Refresh",
      email: "refresh@example.com",
      password: "password123",
    });

    const { default: sql } = await import("../db/client");
    await sql`
        UPDATE users SET status = 'ACTIVE', email_verified_at = NOW()
        WHERE email = 'refresh@example.com'
    `;

    const login = await api()
      .post("/api/v1/auth/login")
      .set("X-Client", "mobile")
      .send({
        email: "refresh@example.com",
        password: "password123",
      });

    const refreshToken = login.body.refreshToken as string;
    expect(refreshToken).toBeTruthy();

    const [r1, r2] = await Promise.all([
      api()
        .post("/api/v1/auth/refresh")
        .set("X-Client", "mobile")
        .send({ refreshToken }),
      api()
        .post("/api/v1/auth/refresh")
        .set("X-Client", "mobile")
        .send({ refreshToken }),
    ]);

    const oks = [r1.status, r2.status].filter((s) => s === 200);
    expect(oks.length).toBe(1);
    expect([r1.status, r2.status].includes(401)).toBe(true);
  });

  test("parallel transferOwnership to two members -> one owner left active", async () => {
    const owner = await registerVerifiedUser({
      name: "Owner",
      email: "owner@example.com",
      password: "password123",
    });
    const m1 = await registerVerifiedUser({
      name: "Mem1",
      email: "m1@example.com",
      password: "password123",
    });
    const m2 = await registerVerifiedUser({
      name: "Mem2",
      email: "m2@example.com",
      password: "password123",
    });

    const project = await api()
      .post("/api/v1/projects")
      .set(authHeader(owner.accessToken))
      .send({ info: "Race project" });
    const projectId = project.body.project.id as string;

    await api()
      .post(`/api/v1/projects/${projectId}/members`)
      .set(authHeader(owner.accessToken))
      .send({ email: "m1@example.com" });
    await api()
      .post(`/api/v1/projects/${projectId}/members`)
      .set(authHeader(owner.accessToken))
      .send({ email: "m2@example.com" });

    const members = await api()
      .get(`/api/v1/projects/${projectId}/members`)
      .set(authHeader(owner.accessToken));

    const id1 = members.body.members.find(
      (m: { email: string }) => m.email === "m1@example.com",
    ).id;
    const id2 = members.body.members.find(
      (m: { email: string }) => m.email === "m2@example.com",
    ).id;

    const ownerMemberId = project.body.membership.id as string;

    const [t1, t2] = await Promise.all([
      api()
        .post(`/api/v1/projects/${projectId}/transfer-ownership`)
        .set(authHeader(owner.accessToken))
        .send({ newOwnerMemberId: id1 }),
      api()
        .post(`/api/v1/projects/${projectId}/transfer-ownership`)
        .set(authHeader(owner.accessToken))
        .send({ newOwnerMemberId: id2 }),
    ]);

    expect([t1.status, t2.status].includes(200)).toBe(true);

    const winnerToken = t1.status === 200 ? m1.accessToken : m2.accessToken;

    const after = await api()
      .get(`/api/v1/projects/${projectId}/members`)
      .set(authHeader(winnerToken));

    expect(after.status).toBe(200);

    const list = after.body.members as Array<{
      id: string;
      role: string;
      status: string;
    }>;

    const owners = list.filter(
      (m) => m.role === "OWNER" && m.status === "ACTIVE",
    );

    expect(owners).toHaveLength(1);
    expect([id1, id2]).toContain(owners[0]!.id);

    const oldOwner = list.find((m) => m.id === ownerMemberId);
    expect(oldOwner?.role).toBe("MEMBER");
  });

  test("transfer then former owner transfer again -> 403 and still one owner", async () => {
    const owner = await registerVerifiedUser({
      name: "Owner2",
      email: "owner2@example.com",
      password: "password123",
    });
    const m1 = await registerVerifiedUser({
      name: "MemA",
      email: "mema@example.com",
      password: "password123",
    });
    const m2 = await registerVerifiedUser({
      name: "MemB",
      email: "memb@example.com",
      password: "password123",
    });

    const project = await api()
      .post("/api/v1/projects")
      .set(authHeader(owner.accessToken))
      .send({ info: "Transfer edge project" });
    const projectId = project.body.project.id as string;

    await api()
      .post(`/api/v1/projects/${projectId}/members`)
      .set(authHeader(owner.accessToken))
      .send({ email: "mema@example.com" });
    await api()
      .post(`/api/v1/projects/${projectId}/members`)
      .set(authHeader(owner.accessToken))
      .send({ email: "memb@example.com" });

    const members = await api()
      .get(`/api/v1/projects/${projectId}/members`)
      .set(authHeader(owner.accessToken));

    const id1 = members.body.members.find(
      (m: { email: string }) => m.email === "mema@example.com",
    ).id;
    const id2 = members.body.members.find(
      (m: { email: string }) => m.email === "memb@example.com",
    ).id;

    const first = await api()
      .post(`/api/v1/projects/${projectId}/transfer-ownership`)
      .set(authHeader(owner.accessToken))
      .send({ newOwnerMemberId: id1 });

    expect(first.status).toBe(200);

    const second = await api()
      .post(`/api/v1/projects/${projectId}/transfer-ownership`)
      .set(authHeader(owner.accessToken))
      .send({ newOwnerMemberId: id2 });

    expect(second.status).toBe(403);

    const after = await api()
      .get(`/api/v1/projects/${projectId}/members`)
      .set(authHeader(m1.accessToken));

    expect(after.status).toBe(200);

    const owners = (
      after.body.members as Array<{ id: string; role: string; status: string }>
    ).filter((m) => m.role === "OWNER" && m.status === "ACTIVE");

    expect(owners).toHaveLength(1);
    expect(owners[0]!.id).toBe(id1);
  });
});
