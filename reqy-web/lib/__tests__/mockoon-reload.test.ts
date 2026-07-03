import { describe, it, expect, vi, beforeEach } from "vitest"
import { POST } from "@/app/api/mockoon/reload/route"
import type { MockRoute } from "@/lib/mock-types"

vi.mock("@/lib/mockoon/sidecar", () => ({
  startMockoonSidecar: vi.fn().mockResolvedValue({
    baseUrl: "http://127.0.0.1:9003",
    pid: 42,
    dataPath: "/tmp/mockoon.json",
  }),
  stopMockoonSidecar: vi.fn().mockResolvedValue(undefined),
}))

import { startMockoonSidecar } from "@/lib/mockoon/sidecar"

function makeRequest(routes: MockRoute[], port = 9003) {
  return new Request("http://localhost/api/mockoon/reload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ routes, port }),
  })
}

describe("POST /api/mockoon/reload", () => {
  beforeEach(() => {
    vi.mocked(startMockoonSidecar).mockClear()
  })

  it("starts the sidecar and returns baseUrl", async () => {
    const routes: MockRoute[] = [
      {
        id: "r1",
        name: "Ping",
        method: "GET",
        pathPattern: "/ping",
        responseStatus: 200,
        responseHeaders: { "content-type": "application/json" },
        responseBody: "{ \"ok\": true }",
        contentType: "application/json",
        delay: 0,
        enabled: true,
        createdAt: 0,
        updatedAt: 0,
      },
    ]

    const response = await POST(makeRequest(routes) as any)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.ok).toBe(true)
    expect(json.baseUrl).toBe("http://127.0.0.1:9003")
    expect(startMockoonSidecar).toHaveBeenCalled()
  })
})
