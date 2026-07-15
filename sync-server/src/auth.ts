import type { Context, Next } from "hono";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Escape all regex-special characters in a string so it can be safely
 * interpolated into a `new RegExp(...)` pattern.
 */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface SessionPayload {
  email: string;
  name: string;
  provider: string;
  userId?: string;
  expires: number;
}

const COOKIE_NAME = "auth_session";

export function parseSessionCookie(cookieValue: string | undefined): SessionPayload | null {
  return parseSession(cookieValue);
}

const DEV_SECRET_PLACEHOLDER = "replace_me_with_a_random_64_char_hex_string";

function isDevMode(): boolean {
  return process.env.NODE_ENV !== "production" || getSecretRaw() === DEV_SECRET_PLACEHOLDER;
}

function getSecretRaw(): string {
  return process.env.AUTH_SIGNING_SECRET || "";
}

function getSecret(): string {
  const s = getSecretRaw();
  if (!s) throw new Error("AUTH_SIGNING_SECRET env variable not set");
  return s;
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf-8");
}

function createSignature(payloadBase64: string): string {
  return createHmac("sha256", getSecret()).update(payloadBase64).digest("base64url");
}

/**
 * Build a signed session token (`<base64url(payload)>.<hmac>`). The same string
 * is used both as the `auth_session` cookie value and as a `Bearer` token, so
 * clients (web, desktop/Tauri) can present it either way.
 */
export function createSessionToken(payload: SessionPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${createSignature(encoded)}`;
}

function parseSession(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) return null;
  const expectedSignature = createSignature(payloadBase64);
  const sigBuf = Buffer.from(signature, "utf-8");
  const expBuf = Buffer.from(expectedSignature, "utf-8");
  if (sigBuf.length !== expBuf.length) return null;
  if (!timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const payload = JSON.parse(decodeBase64Url(payloadBase64)) as SessionPayload;
    if (payload.expires < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export interface AuthContext {
  userId: string;
  email: string;
  name: string;
}

export async function requireAuth(c: Context, next: Next) {
  const cookieHeader = c.req.header("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`${escapeRegex(COOKIE_NAME)}=([^;]+)`));
  // Accept either the session cookie OR an `Authorization: Bearer <token>`
  // (same signed format) so desktop/Tauri clients can authenticate without cookies.
  let token = match?.[1];
  if (!token) {
    const authHeader = c.req.header("authorization");
    if (authHeader?.startsWith("Bearer ")) token = authHeader.slice(7).trim();
  }

  let session: SessionPayload | null = null;
  try {
    session = parseSession(token);
  } catch {
    // AUTH_SIGNING_SECRET may not be set in dev — that's fine
  }

  if (session?.userId) {
    c.set("auth", {
      userId: session.userId,
      email: session.email,
      name: session.name,
    } as AuthContext);
    return next();
  }

  // Dev mode: create a mock session when no valid auth cookie exists.
  // This lets the workspace pages work without setting up OAuth providers.
  if (isDevMode()) {
    c.set("auth", {
      userId: "dev-user-1",
      email: "dev@reqly.local",
      name: "Developer",
    } as AuthContext);
    return next();
  }

  return c.json({ error: "Unauthorized" }, 401);
}
