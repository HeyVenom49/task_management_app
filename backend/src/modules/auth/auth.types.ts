export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
};

export type RegisterResult = {
  user: PublicUser;
};

export type CreateUserInput = {
  name: string;
  email: string;
  passwordHash: string;
};

export type UserAuthRow = {
  id: string;
  name: string;
  email: string;
  hashPassword: string;
  role: "USER" | "ADMIN";
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
};

export type CreateVerificationTokenInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

export type VerificationTokenRecord = {
  id: string;
  userId: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

export type CreateSessionInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};

export type SessionRecord = {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
};

export type CreateOpaqueTokenInput = {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
};
