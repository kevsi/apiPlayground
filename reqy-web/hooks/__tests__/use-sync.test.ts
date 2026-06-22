/**
 * Unit tests for the sync hook.
 *
 * These are lightweight smoke tests because the hook depends on browser APIs
 * (BroadcastChannel, localStorage, fetch, navigator.onLine) and the global store.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { renderHook, waitFor } from "@testing-library/react"
import { useSync } from "@/hooks/use-sync"

describe("useSync", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ connected: false }) })) as typeof fetch)
  })

  it("should initialise with idle state when not authenticated", async () => {
    const { result } = renderHook(() => useSync())
    expect(result.current.state).toBeOneOf(["idle", "synced"])
    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(false)
    })
  })

  it("should expose isEnabled toggle", async () => {
    const { result } = renderHook(() => useSync())
    expect(typeof result.current.setEnabled).toBe("function")
    expect(typeof result.current.forceSync).toBe("function")
  })
})
