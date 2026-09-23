import { jwtVerify, SignJWT } from "jose";
import env from "../../config/env";

export type AccessTokenPayload = {
  sub: string;
  email: string;
};

export async function signAccessToken(payload: AccessTokenPayload) {
  const secret = new TextEncoder().encode(env.jwtSecret);
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(env.jwtExpiresIn)
    .sign(secret);
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenPayload> {
  const secret = new TextEncoder().encode(env.jwtSecret);
  const { payload } = await jwtVerify(token, secret);

  if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
    throw new Error("Invalid token payload");
  }
  return { sub: payload.sub, email: payload.email };
}
