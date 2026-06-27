// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"

const mockRouterRefresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}))

import { useAuth } from "@/hooks/use-auth"

function mockFetchOnce(response: { ok: boolean; body: unknown }) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: response.ok,
    json: () => Promise.resolve(response.body),
  } as Response)
}

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouterRefresh.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("starts in loading state, transitions to connected", async () => {
    mockFetchOnce({
      ok: true,
      body: { connected: true, user: { email: "a@b.c", name: "Alice", provider: "google" } },
    })
    const { result } = renderHook(() => useAuth())
    expect(result.current.status).toBe("loading")
    await waitFor(() => expect(result.current.status).toBe("connected"))
    expect(result.current.user).toEqual({ email: "a@b.c", name: "Alice", provider: "google" })
  })

  it("transitions to disconnected on 200 connected:false", async () => {
    mockFetchOnce({ ok: true, body: { connected: false } })
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.status).toBe("disconnected"))
    expect(result.current.user).toBeNull()
  })

  it("transitions to disconnected on network error", async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error("network"))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.status).toBe("disconnected"))
  })

  it("logout clears state and posts to /api/auth/logout", async () => {
    const logoutFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ connected: true, user: { email: "a@b.c", name: "A", provider: "local" } }),
      } as Response)
      .mockResolvedValueOnce({ ok: true })
    global.fetch = logoutFetch

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.status).toBe("connected"))

    await act(async () => { await result.current.logout() })

    expect(logoutFetch).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }))
    expect(result.current.status).toBe("disconnected")
    expect(mockRouterRefresh).toHaveBeenCalled()
  })
})
