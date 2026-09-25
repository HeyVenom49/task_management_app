import { describe, expect, test } from "bun:test";
import { findOwnMembership } from "./membership";
import type { MemberWithUser } from "../types/project";

const members: MemberWithUser[] = [
  { id: "m1", userId: "u1", projectId: "p1", role: "OWNER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Ana", email: "ana@example.com" },
  { id: "m2", userId: "u2", projectId: "p1", role: "MEMBER", status: "ACTIVE", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", name: "Bo", email: "bo@example.com" },
];

describe("findOwnMembership", () => {
  test("returns the member row matching the given userId", () => {
    expect(findOwnMembership(members, "u2")?.id).toBe("m2");
  });

  test("returns null when the userId has no membership in the list", () => {
    expect(findOwnMembership(members, "u9")).toBeNull();
  });
});
