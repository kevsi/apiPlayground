// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useAccent, HEX_REGEX, ACCENT_PRESETS } from "@/hooks/use-accent"
import { persistence } from "@/lib/persistence"

describe("use-accent", () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.style.removeProperty("--primary")
    // Reset persistence singleton's in-memory cache (persistence keeps its
    // own cache that survives localStorage.clear(), causing state to leak
    // between tests).
    ;(persistence as unknown as { cache: Map<string, unknown> }).cache.clear()
  })

  it("starts with null accent", () => {
    const { result } = renderHook(() => useAccent())
    expect(result.current.accent).toBeNull()
  })

  it("setAccent with valid hex applies CSS variable and persists", () => {
    const { result } = renderHook(() => useAccent())
    act(() => result.current.setAccent("#8B5CF6"))
    expect(result.current.accent).toBe("#8B5CF6")
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#8B5CF6")
    expect(localStorage.getItem("reqly-accent")).toBe("#8B5CF6")
  })

  it("setAccent with invalid hex is a no-op", () => {
    const { result } = renderHook(() => useAccent())
    act(() => result.current.setAccent("red"))
    expect(result.current.accent).toBeNull()
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("")
  })

  it("setAccent(null) clears override and storage", () => {
    const { result } = renderHook(() => useAccent())
    act(() => result.current.setAccent("#8B5CF6"))
    act(() => result.current.setAccent(null))
    expect(result.current.accent).toBeNull()
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("")
    expect(localStorage.getItem("reqly-accent")).toBeNull()
  })

  it("isPreset detects preset colors (case-insensitive)", () => {
    const { result } = renderHook(() => useAccent())
    expect(result.current.isPreset(ACCENT_PRESETS[0].hex)).toBe(true)
    expect(result.current.isPreset("#abcDEF")).toBe(false)
  })

  it("HEX_REGEX accepts only 6-char hex with #", () => {
    expect(HEX_REGEX.test("#FFF")).toBe(false)
    expect(HEX_REGEX.test("8B5CF6")).toBe(false)
    expect(HEX_REGEX.test("#8B5CF6")).toBe(true)
    expect(HEX_REGEX.test("#8b5cf6")).toBe(true)
  })
})
