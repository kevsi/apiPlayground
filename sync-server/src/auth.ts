import type { Context, Next } from "hono"
import { createHmac, timingSafeEqual } from "node:crypto"

interface SessionPayload {
  email: string
  name: string
  provider: string
  userId?: string
  expires: number
}

const COOKIE_NAME = "auth_session"

export function parseSessionCookie(cookieValue: string | undefined): SessionPayload | null {
  return parseSession(cookieValue)
}

function getSecret(): string {
  const s = process.env.AUTH_SIGNING_SECRET
  if (!s) throw new Error("AUTH_SIGNING_SECRET env variable not set")
  return s
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf-8")
}

function createSignature(payloadBase64: string): string {
  return createHmac("sha256", getSecret()).update(payloadBase64).digest("base64url")
}

function parseSession(cookieValue: string | undefined): SessionPayload | null {
  if (!cookieValue) return null
  const [payloadBase64, signature] = cookieValue.split(".")
  if (!payloadBase64 || !signature) return null
  const expectedSignature = createSignature(payloadBase64)
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

export interface AuthContext {
  userId: string
  email: string
  name: string
}

export async function requireAuth(c: Context, next: Next) {
  const cookieHeader = c.req.header("cookie") ?? ""
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`))
  const session = parseSession(match?.[1])
  if (!session || !session.userId) {
    return c.json({ error: "Unauthorized" }, 401)
  }
  c.set("auth", {
    userId: session.userId,
    email: session.email,
    name: session.name,
  } as AuthContext)
  await next()
}
