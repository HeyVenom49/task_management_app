export type FieldErrors = Record<string, string[] | undefined>;

export class ApiError extends Error {
  status: number;
  fieldErrors?: FieldErrors;

  constructor(status: number, message: string, fieldErrors?: FieldErrors) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1";
const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";
const NO_RETRY_PATHS = ["/auth/login", "/auth/register", "/auth/refresh"];

let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

type ApiFetchOptions = {
  method?: string;
  body?: unknown;
};

type ErrorBody = {
  message?: string;
  errors?: FieldErrors;
};

async function rawRequest<T>(path: string, options: ApiFetchOptions, token: string | null): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, GENERIC_ERROR_MESSAGE);
  }

  const text = await response.text();
  const data = (text ? JSON.parse(text) : {}) as ErrorBody & Record<string, unknown>;

  if (!response.ok) {
    const message = response.status >= 500 ? GENERIC_ERROR_MESSAGE : (data.message ?? GENERIC_ERROR_MESSAGE);
    throw new ApiError(response.status, message, data.errors);
  }

  return data as T;
}

let refreshInFlight: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  refreshInFlight = (async () => {
    try {
      const data = await rawRequest<{ accessToken: string }>("/auth/refresh", { method: "POST" }, null);
      accessToken = data.accessToken;
      return true;
    } catch {
      accessToken = null;
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, options, accessToken);
  } catch (err) {
    const canRetry =
      err instanceof ApiError &&
      err.status === 401 &&
      accessToken !== null &&
      !NO_RETRY_PATHS.includes(path);

    if (!canRetry) {
      throw err;
    }

    const refreshed = await refreshAccessToken();
    if (!refreshed) {
      onSessionExpired?.();
      throw err;
    }
    return rawRequest<T>(path, options, accessToken);
  }
}
