import { createHmac, timingSafeEqual } from "crypto"

export interface AuthSessionPayload {
  email: string
  name: string
  provider: "local" | "google" | "github"
  userId?: string
  supabaseAccessToken?: string
  supabaseRefreshToken?: string
  supabaseExpiresAt?: number
  expires: number
}

const COOKIE_NAME = "auth_session"
const getSecret = () => {
  const s = process.env.AUTH_SIGNING_SECRET
  if (!s) throw new Error("AUTH_SIGNING_SECRET environment variable is not set")
  return s
}
const SECRET = getSecret()
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url")
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8")
}

function createSignature(payloadBase64: string) {
  return createHmac("sha256", SECRET).update(payloadBase64).digest("base64url")
}

export function createSessionCookieValue(payload: Omit<AuthSessionPayload, "expires">) {
  const sessionPayload: AuthSessionPayload = {
    ...payload,
    expires: Date.now() + SESSION_DURATION_MS,
  }
  const payloadJson = JSON.stringify(sessionPayload)
  const payloadBase64 = encodeBase64Url(payloadJson)
  const signature = createSignature(payloadBase64)
  return `${payloadBase64}.${signature}`
}

export function parseSessionCookie(cookieValue: string | undefined): AuthSessionPayload | null {
  if (!cookieValue) return null
  const [payloadBase64, signature] = cookieValue.split(".")
  if (!payloadBase64 || !signature) return null

  const expectedSignature = createSignature(payloadBase64)
  const signatureBuffer = Buffer.from(signature, "utf8")
  const expectedBuffer = Buffer.from(expectedSignature, "utf8")

  if (signatureBuffer.length !== expectedBuffer.length) return null
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return null

  try {
    const payloadJson = decodeBase64Url(payloadBase64)
    const payload = JSON.parse(payloadJson) as AuthSessionPayload
    if (payload.expires < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export function getSessionFromRequest(request: Request | { cookies: { get(name: string): { value: string } | undefined } }) {
  if (!("cookies" in request)) return null
  const cookie = request.cookies.get(COOKIE_NAME)?.value
  return parseSessionCookie(cookie)
}

export function buildSessionCookie(value: string) {
  return {
    name: COOKIE_NAME,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_DURATION_MS / 1000,
  }
}

export function buildClearSessionCookie() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  }
}
