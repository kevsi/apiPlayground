import { createHmac, timingSafeEqual } from "node:crypto"

export interface SessionPayload {
  email: string
  name: string
  provider: string
  userId?: string
  expires: number
}

export const SESSION_COOKIE_NAME = "auth_session"

function getSecret(): string {
  const s = process.env.AUTH_SIGNING_SECRET
  if (!s || s.length < 32) {
    // Throwing here would crash middleware on every request. Log once and
    // treat as "no session" so the user is redirected to /login instead of
    // the app exploding. The build-time guard in next.config.mjs catches
    // missing secrets before deployment.
    // eslint-disable-next-line no-console
    console.warn("[session] AUTH_SIGNING_SECRET missing or too short; rejecting all sessions")
    return ""
  }
  return s
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf-8")
}

function createSignature(payloadBase64: string): string {
  const secret = getSecret()
  if (!secret) return ""
  return createHmac("sha256", secret).update(payloadBase64).digest("base64url")
}

export function parseSessionCookie(cookieValue: string | undefined): SessionPayload | null {
  if (!cookieValue) return null
  const secret = getSecret()
  if (!secret) return null

  const [payloadBase64, signature] = cookieValue.split(".")
  if (!payloadBase64 || !signature) return null

  const expectedSignature = createSignature(payloadBase64)
  if (!expectedSignature) return null

  const sigBuf = Buffer.from(signature, "utf-8")
  const expBuf = Buffer.from(expectedSignature, "utf-8")
  if (sigBuf.length !== expBuf.length) return null
  if (!timingSafeEqual(sigBuf, expBuf)) return null

  try {
    const payload = JSON.parse(decodeBase64Url(payloadBase64)) as SessionPayload
    if (payload.expires < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function buildSessionCookie(payload: SessionPayload): string {
  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url")
  const sig = createSignature(payloadBase64)
  const maxAge = Math.max(0, Math.floor((payload.expires - Date.now()) / 1000))
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  return `${SESSION_COOKIE_NAME}=${payloadBase64}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
}
