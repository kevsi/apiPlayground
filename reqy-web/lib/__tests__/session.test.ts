import { describe, it, expect, beforeEach } from "vitest"

describe("lib/session", () => {
  beforeEach(() => {
    process.env.AUTH_SIGNING_SECRET = "a".repeat(48)
  })

  it("parseSessionCookie: returns null on undefined input", async () => {
    const { parseSessionCookie } = await import("../session")
    expect(parseSessionCookie(undefined)).toBeNull()
  })

  it("buildSessionCookie + parseSessionCookie: round-trips a valid payload", async () => {
    const { buildSessionCookie, parseSessionCookie } = await import("../session")
    const cookie = buildSessionCookie({
      email: "alice@example.com",
      name: "Alice",
      provider: "github",
      userId: "user-123",
      expires: Date.now() + 60_000,
    })
    // Cookie string format: auth_session=<payload>.<sig>; ...
    const value = cookie.split("=")[1].split(";")[0]
    const session = parseSessionCookie(value)
    expect(session).not.toBeNull()
    expect(session?.email).toBe("alice@example.com")
    expect(session?.userId).toBe("user-123")
    expect(session?.provider).toBe("github")
  })

  it("parseSessionCookie: rejects a tampered payload (signature mismatch)", async () => {
    const { buildSessionCookie, parseSessionCookie } = await import("../session")
    const cookie = buildSessionCookie({
      email: "alice@example.com",
      name: "Alice",
      provider: "github",
      expires: Date.now() + 60_000,
    })
    const value = cookie.split("=")[1].split(";")[0]
    const [payload, sig] = value.split(".")
    // Flip one character in the payload
    const tamperedPayload = (payload![0] === "A" ? "B" : "A") + payload!.slice(1)
    const tampered = `${tamperedPayload}.${sig}`
    expect(parseSessionCookie(tampered)).toBeNull()
  })

  it("parseSessionCookie: rejects expired sessions", async () => {
    const { buildSessionCookie, parseSessionCookie } = await import("../session")
    const cookie = buildSessionCookie({
      email: "alice@example.com",
      name: "Alice",
      provider: "github",
      expires: Date.now() - 1, // already expired
    })
    const value = cookie.split("=")[1].split(";")[0]
    expect(parseSessionCookie(value)).toBeNull()
  })

  it("parseSessionCookie: rejects malformed cookie (no signature)", async () => {
    const { parseSessionCookie } = await import("../session")
    expect(parseSessionCookie("just-a-payload-no-dot")).toBeNull()
  })

  it("parseSessionCookie: returns null when AUTH_SIGNING_SECRET is missing", async () => {
    delete process.env.AUTH_SIGNING_SECRET
    const { parseSessionCookie } = await import("../session")
    expect(parseSessionCookie("anything.atall")).toBeNull()
  })

  it("buildSessionCookie: sets HttpOnly + SameSite=Lax", async () => {
    const { buildSessionCookie } = await import("../session")
    const cookie = buildSessionCookie({
      email: "alice@example.com",
      name: "Alice",
      provider: "github",
      expires: Date.now() + 60_000,
    })
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/SameSite=Lax/i)
  })

  it("buildSessionCookie: adds Secure flag only in production", async () => {
    const { buildSessionCookie } = await import("../session")
    const NODE_ENV = process.env.NODE_ENV
    try {
      process.env.NODE_ENV = "development"
      const devCookie = buildSessionCookie({
        email: "a@b.c", name: "A", provider: "x", expires: Date.now() + 60_000,
      })
      expect(devCookie).not.toMatch(/;\s*Secure/i)

      process.env.NODE_ENV = "production"
      const prodCookie = buildSessionCookie({
        email: "a@b.c", name: "A", provider: "x", expires: Date.now() + 60_000,
      })
      expect(prodCookie).toMatch(/;\s*Secure/i)
    } finally {
      process.env.NODE_ENV = NODE_ENV
    }
  })
})
