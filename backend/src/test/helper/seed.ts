import { registerVerifiedUser } from "./auth";
import { api, authHeader } from "./http";

export async function seedAliceBobProjects() {
  const alice = await registerVerifiedUser({
    name: "Alice",
    email: "alice@example.com",
    password: "password123",
  });

  const bob = await registerVerifiedUser({
    name: "Bob",
    email: "bob@example.com",
    password: "password123",
  });

  const projectA = await api()
    .post("/api/v1/projects")
    .set(authHeader(alice.accessToken))
    .send({ info: "Project A" });

  const projectB = await api()
    .post("/api/v1/projects")
    .set(authHeader(bob.accessToken))
    .send({ info: "Project B" });

  return {
    alice,
    bob,
    projectA: projectA.body.project as { id: string },
    projectB: projectB.body.project as { id: string },
    membershipA: projectA.body.membership as { id: string },
    membershipB: projectB.body.membership as { id: string },
  };
}
