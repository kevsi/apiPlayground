// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useAnimations } from "@/hooks/use-animations"

describe("useAnimations", () => {
  beforeEach(() => {
    document.body.removeAttribute("data-animations")
    localStorage.clear()
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: false,
      media: q,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  })

  it("starts enabled by default", () => {
    const { result } = renderHook(() => useAnimations())
    expect(result.current.enabled).toBe(true)
  })

  it("starts disabled when prefers-reduced-motion is set", () => {
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: q.includes("reduce"),
      media: q,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    const { result } = renderHook(() => useAnimations())
    expect(result.current.enabled).toBe(false)
  })

  it("toggle() flips state and applies body attribute", () => {
    const { result } = renderHook(() => useAnimations())
    act(() => result.current.toggle())
    expect(result.current.enabled).toBe(false)
    expect(document.body.getAttribute("data-animations")).toBe("off")
    act(() => result.current.toggle())
    expect(result.current.enabled).toBe(true)
    expect(document.body.getAttribute("data-animations")).toBeNull()
  })

  it("setEnabled(true) removes body attribute", () => {
    document.body.setAttribute("data-animations", "off")
    const { result } = renderHook(() => useAnimations())
    act(() => result.current.setEnabled(true))
    expect(document.body.getAttribute("data-animations")).toBeNull()
  })
})
