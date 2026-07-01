import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { ResponseTimeline } from "@/components/response-timeline"

describe("ResponseTimeline", () => {
  it("renders nothing when totalMs is 0", () => {
    const { container } = render(
      <ResponseTimeline timings={{ totalMs: 0 }} />
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders nothing when all timings are 0", () => {
    const { container } = render(
      <ResponseTimeline timings={{ dnsMs: 0, connectMs: 0, ttfbMs: 0, totalMs: 100 }} />
    )
    expect(container.firstChild).toBeNull()
  })

  it("renders DNS, TTFB and total labels", () => {
    render(
      <ResponseTimeline timings={{ dnsMs: 10, ttfbMs: 100, totalMs: 200 }} />
    )
    expect(screen.getByText("DNS")).toBeTruthy()
    expect(screen.getByText("TTFB")).toBeTruthy()
    expect(screen.getByText("Total")).toBeTruthy()
  })

  it("shows timing values in ms", () => {
    render(
      <ResponseTimeline timings={{ dnsMs: 12, ttfbMs: 142, totalMs: 234 }} />
    )
    expect(screen.getByText("12")).toBeTruthy()
    expect(screen.getByText("142")).toBeTruthy()
    expect(screen.getByText("234")).toBeTruthy()
  })

  it("hides DNS label when dnsMs is 0", () => {
    render(
      <ResponseTimeline timings={{ dnsMs: 0, ttfbMs: 100, totalMs: 200 }} />
    )
    expect(screen.queryByText("DNS")).toBeNull()
  })

  it("shows Connect label when connectMs > 0", () => {
    render(
      <ResponseTimeline timings={{ connectMs: 25, ttfbMs: 100, totalMs: 200 }} />
    )
    expect(screen.getByText("Connect")).toBeTruthy()
  })

  it("shows warning icon for dominant segment (>50%)", () => {
    render(
      <ResponseTimeline timings={{ dnsMs: 200, ttfbMs: 50, totalMs: 250 }} />
    )
    // DNS takes 200/250 = 80% > 50%, should show warning
    const dnsLabel = screen.getByText("DNS")
    expect(dnsLabel.parentElement?.querySelector("svg")).toBeTruthy()
  })

  it("does not show warning for non-dominant segments", () => {
    render(
      <ResponseTimeline timings={{ dnsMs: 30, ttfbMs: 100, totalMs: 200 }} />
    )
    // DNS takes 30/200 = 15% < 50%, no warning
    const dnsLabel = screen.getByText("DNS")
    expect(dnsLabel.parentElement?.querySelector("svg")).toBeNull()
  })

  it("renders Transfer segment when remaining time exists", () => {
    render(
      <ResponseTimeline timings={{ dnsMs: 10, ttfbMs: 100, totalMs: 200 }} />
    )
    expect(screen.getByText("Transfer")).toBeTruthy()
  })

  it("handles only ttfbMs without connectMs", () => {
    render(
      <ResponseTimeline timings={{ ttfbMs: 150, totalMs: 200 }} />
    )
    expect(screen.getByText("TTFB")).toBeTruthy()
    expect(screen.getByText("Transfer")).toBeTruthy()
    expect(screen.queryByText("Connect")).toBeNull()
  })

  it("renders multiple segments with correct proportions", () => {
    const { container } = render(
      <ResponseTimeline timings={{ dnsMs: 25, ttfbMs: 175, totalMs: 250 }} />
    )
    // Check that the bar exists with segments
    const segments = container.querySelectorAll(".h-2.rounded-full > div")
    expect(segments.length).toBeGreaterThanOrEqual(2)
  })
})