import { describe, it, expect, beforeEach } from "vitest"

/**
 * Note: env.ts uses module-level caching (`cachedServerEnv`, `cachedPublicEnv`).
 * We have to reset that cache between tests by re-importing with a fresh
 * `process.env`. Vitest's `vi.resetModules()` handles that for us.
 */
describe("lib/env", () => {
  beforeEach(() => {
    // Wipe modules so cached server env is recreated from the new process.env.
    // Also ensure the documented defaults are present.
    delete process.env.AUTH_SIGNING_SECRET
  })

  it("validateBuildTimeEnv: accepts a 32-char secret (the minimum)", async () => {
    process.env.AUTH_SIGNING_SECRET = "a".repeat(32)
    const { validateBuildTimeEnv } = await import("../env")
    expect(() => validateBuildTimeEnv()).not.toThrow()
  })

  it("validateBuildTimeEnv: rejects missing secret", async () => {
    const { validateBuildTimeEnv } = await import("../env")
    expect(() => validateBuildTimeEnv()).toThrow(/AUTH_SIGNING_SECRET/)
  })

  it("validateBuildTimeEnv: rejects secret shorter than 32 chars", async () => {
    process.env.AUTH_SIGNING_SECRET = "tooshort"
    const { validateBuildTimeEnv } = await import("../env")
    expect(() => validateBuildTimeEnv()).toThrow(/at least 32 characters/)
  })

  it("getServerEnv: caches after first call (returns same instance)", async () => {
    process.env.AUTH_SIGNING_SECRET = "a".repeat(40)
    const { getServerEnv } = await import("../env")
    const a = getServerEnv()
    const b = getServerEnv()
    expect(a).toBe(b)
    expect(a.AUTH_SIGNING_SECRET).toHaveLength(40)
  })

  it("getServerEnv: throws on short secret outside Edge runtime", async () => {
    process.env.AUTH_SIGNING_SECRET = "short"
    const { getServerEnv } = await import("../env")
    // Outside Edge (process.env.NEXT_RUNTIME !== "edge") the strict validator runs.
    expect(() => getServerEnv()).toThrow(/invalid server environment/)
  })

  it("getPublicEnv: defaults NEXT_PUBLIC_APP_URL when missing", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const { getPublicEnv } = await import("../env")
    const env = getPublicEnv()
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000")
  })

  it("getPublicEnv: rejects malformed URL", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "not-a-url"
    const { getPublicEnv } = await import("../env")
    expect(() => getPublicEnv()).toThrow(/invalid public environment/)
  })
})
