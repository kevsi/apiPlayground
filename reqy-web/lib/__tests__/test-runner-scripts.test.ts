import { describe, it, expect } from "vitest"
import { runScript } from "@/lib/test-runner/scripts"
import type { RunnerContext } from "@/lib/test-runner/types"

const baseCtx: RunnerContext = {
  environment: { baseUrl: "https://api.example.com" },
  iterationData: { userId: "42" },
  iterationIndex: 0,
  log: () => {},
}

describe("runScript", () => {
  it("reads environment variables", async () => {
    const out = await runScript("pm.environment.get('baseUrl')", baseCtx, { phase: "pre" })
    expect(out.error).toBeUndefined()
    expect(out.result).toBe("https://api.example.com")
  })

  it("sets environment variables", async () => {
    const ctx: RunnerContext = { ...baseCtx, environment: { ...baseCtx.environment } }
    await runScript("pm.environment.set('token', 'abc123')", ctx, { phase: "pre" })
    expect(ctx.environment.token).toBe("abc123")
  })

  it("captures console.log output", async () => {
    const logs: string[] = []
    const ctx: RunnerContext = { ...baseCtx, log: (m) => logs.push(m) }
    await runScript("console.log('hello')", ctx, { phase: "pre" })
    expect(logs).toContain("hello")
  })

  it("denies require access", async () => {
    const out = await runScript("require('fs')", baseCtx, { phase: "pre" })
    expect(out.error).toBeDefined()
  })

  it("denies process.exit", async () => {
    const out = await runScript("process.exit(1)", baseCtx, { phase: "pre" })
    expect(out.error).toBeDefined()
  })

  it("returns error on syntax error", async () => {
    const out = await runScript("this is not valid javascript", baseCtx, { phase: "pre" })
    expect(out.error).toBeDefined()
  })

  it("times out on infinite loop", async () => {
    const out = await runScript("while (true) {}", baseCtx, { phase: "pre", timeoutMs: 200 })
    expect(out.error).toBeDefined()
  })

  it("exposes iterationData in pre phase", async () => {
    const out = await runScript("pm.iterationData.get('userId')", baseCtx, { phase: "pre" })
    expect(out.result).toBe("42")
  })

  it("exposes pm.expect().to.equal() and throws on mismatch", async () => {
    const pass = await runScript("pm.expect(5).to.equal(5)", baseCtx, { phase: "post" })
    expect(pass.error).toBeUndefined()
    const fail = await runScript("pm.expect(5).to.equal(6)", baseCtx, { phase: "post" })
    expect(fail.error).toBeDefined()
  })
})
