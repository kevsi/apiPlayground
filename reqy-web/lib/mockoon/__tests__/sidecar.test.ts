import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  startMockoonSidecar,
  stopMockoonSidecar,
  isMockoonSidecarRunning,
} from "@/lib/mockoon/sidecar"
import type { MockoonEnvironment } from "@/lib/mockoon/types"

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}))

import { spawn } from "node:child_process"

function createFakeProcess(pid: number): ReturnType<typeof spawn> {
  const fake = {
    pid,
    exitCode: null,
    kill: vi.fn(),
    stderr: { on: vi.fn() },
    on: vi.fn((event: string, cb: () => void) => {
      if (event === "spawn") setTimeout(cb, 0)
    }),
  } as unknown as ReturnType<typeof spawn>
  return fake
}

describe("startMockoonSidecar", () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  afterEach(async () => {
    await stopMockoonSidecar()
  })

  it("starts and returns state", async () => {
    const fake = createFakeProcess(1234)
    vi.mocked(spawn).mockReturnValue(fake)

    const env: MockoonEnvironment = {
      uuid: "env-1",
      name: "test",
      port: 9002,
      hostname: "127.0.0.1",
      routes: [],
    }

    const state = await startMockoonSidecar(env)
    expect(state.baseUrl).toBe("http://127.0.0.1:9002")
    expect(state.pid).toBe(1234)
    expect(isMockoonSidecarRunning()).toBe(true)
  })
})
