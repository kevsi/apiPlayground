import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { validatePostmanApiKey } from "@/lib/postman"

describe("validatePostmanApiKey", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function mockFetchOnce(response: { ok: boolean; body: unknown }) {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: response.ok,
      json: () => Promise.resolve(response.body),
    } as Response)
  }

  it("returns user on 200 with valid user data", async () => {
    mockFetchOnce({
      ok: true,
      body: { user: { username: "alice", email: "alice@example.com" } },
    })
    const user = await validatePostmanApiKey("PMAK-test")
    expect(user).toEqual({ username: "alice", email: "alice@example.com" })
  })

  it("returns null on 401", async () => {
    mockFetchOnce({ ok: false, body: { error: "Invalid API Key" } })
    const user = await validatePostmanApiKey("PMAK-bad")
    expect(user).toBeNull()
  })

  it("returns null on network error", async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error("network"))
    const user = await validatePostmanApiKey("PMAK-test")
    expect(user).toBeNull()
  })

  it("passes an AbortSignal to fetch (timeout support)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: { username: "x" } }),
    } as Response)
    global.fetch = fetchMock
    await validatePostmanApiKey("PMAK-test")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.postman.com/me",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    )
  })

  it("uses X-API-Key header", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: { username: "x" } }),
    } as Response)
    global.fetch = fetchMock
    await validatePostmanApiKey("PMAK-my-key")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.postman.com/me",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-API-Key": "PMAK-my-key" }),
      })
    )
  })
})
