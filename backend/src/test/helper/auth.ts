import { log } from "node:util";
import sql from "../../db/client";
import { loginLimiter } from "../../shared/auth/rate-limit";
import { api } from "./http";

export async function registerVerifiedUser(input: {
  name: string;
  email: string;
  password: string;
}) {
  const reg = await api().post("/api/v1/auth/register").send(input);
  if (reg.status !== 201 && reg.status !== 200) {
    throw new Error(
      `register failed: ${reg.status} ${JSON.stringify(reg.body)}`,
    );
  }

  await sql`
    UPDATE users
    SET status = 'ACTIVE', email_verified_at = NOW()
    WHERE email = ${input.email.toLowerCase()}
  `;

  const login = await api().post("/api/v1/auth/login").send({
    email: input.email,
    password: input.password,
  });

  if (login.status !== 200) {
    throw new Error(
      `login failed: ${login.status} ${JSON.stringify(login.body)}`,
    );
  }

  return {
    user: login.body.user as { id: string; email: string },
    accessToken: login.body.accessToken as string,
  };
}
