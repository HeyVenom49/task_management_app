export type UserRole = "USER" | "ADMIN";
export type UserStatus = "ACTIVE" | "INACTIVE";

export type PublicUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type RegisterResponse = { user: PublicUser };
export type LoginResponse = { user: PublicUser; accessToken: string };
export type MeResponse = { user: PublicUser };
export type RefreshResponse = { accessToken: string };
export type MessageResponse = { message: string };
