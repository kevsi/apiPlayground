import { getPublicEnv } from "@/lib/env";

/**
 * Client-side auth API.
 *
 * Talks directly to the sync backend's `/api/auth/*` routes (same host the
 * rest of the app reaches via `NEXT_PUBLIC_SYNC_URL`). On success, `signup`
 * and `login` return a session token; callers are expected to persist it and
 * send it back as a `Bearer` token (the sync backend's `requireAuth` accepts
 * either the session cookie or a Bearer token).
 */

const AUTH_PATH = "/api/auth";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthResult {
  user: AuthUser;
  token: string;
}

function authBaseUrl(): string {
  return (getPublicEnv().NEXT_PUBLIC_SYNC_URL || "").replace(/\/$/, "");
}

async function postJson(
  path: string,
  body: unknown,
  token?: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${authBaseUrl()}${AUTH_PATH}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
    credentials: "include",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((data?.error as string) || `Auth request failed: ${res.status}`);
  }
  return data;
}

export async function authSignup(
  email: string,
  password: string,
  name?: string,
): Promise<AuthResult> {
  const data = await postJson("/signup", { email, password, name });
  return { user: data.user as AuthUser, token: data.token as string };
}

export async function authLogin(email: string, password: string): Promise<AuthResult> {
  const data = await postJson("/login", { email, password });
  return { user: data.user as AuthUser, token: data.token as string };
}

export async function authLogout(token: string): Promise<void> {
  await postJson("/logout", {}, token);
}

export async function authMe(token: string): Promise<AuthUser> {
  const res = await fetch(`${authBaseUrl()}${AUTH_PATH}/me`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (!res.ok) {
    throw new Error(`Not authenticated: ${res.status}`);
  }
  return (await res.json()) as AuthUser;
}
