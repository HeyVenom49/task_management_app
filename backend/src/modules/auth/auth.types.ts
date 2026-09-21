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
