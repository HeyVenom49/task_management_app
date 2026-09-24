import { apiFetch, setAccessToken } from "./client";
import type {
  ChangePasswordInput,
  LoginInput,
  LoginResponse,
  MeResponse,
  MessageResponse,
  RefreshResponse,
  RegisterInput,
  RegisterResponse,
} from "../types/auth";

export function register(input: RegisterInput): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>("/auth/register", { method: "POST", body: input });
}

export async function login(input: LoginInput): Promise<LoginResponse> {
  const result = await apiFetch<LoginResponse>("/auth/login", { method: "POST", body: input });
  setAccessToken(result.accessToken);
  return result;
}

export function me(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/auth/me");
}

export async function refresh(): Promise<RefreshResponse> {
  const result = await apiFetch<RefreshResponse>("/auth/refresh", { method: "POST" });
  setAccessToken(result.accessToken);
  return result;
}

export async function logout(): Promise<MessageResponse> {
  const result = await apiFetch<MessageResponse>("/auth/logout", { method: "POST" });
  setAccessToken(null);
  return result;
}

export function verifyEmail(token: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>(`/auth/verify-email?token=${encodeURIComponent(token)}`);
}

export function resendVerification(email: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>("/auth/resend-verification", { method: "POST", body: { email } });
}

export async function changePassword(input: ChangePasswordInput): Promise<MessageResponse> {
  const result = await apiFetch<MessageResponse>("/auth/change-password", { method: "POST", body: input });
  setAccessToken(null);
  return result;
}

export function forgotPassword(email: string): Promise<MessageResponse> {
  return apiFetch<MessageResponse>("/auth/forgot-password", { method: "POST", body: { email } });
}

export async function resetPassword(token: string, newPassword: string): Promise<MessageResponse> {
  const result = await apiFetch<MessageResponse>("/auth/reset-password", {
    method: "POST",
    body: { token, newPassword },
  });
  setAccessToken(null);
  return result;
}
