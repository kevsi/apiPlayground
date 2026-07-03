import { spawn, ChildProcess } from "node:child_process"
import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { MockoonEnvironment } from "./types"
import { environmentToJson } from "./adapter"

export interface MockoonSidecarState {
  baseUrl: string
  pid: number
  dataPath: string
}

let currentProcess: ChildProcess | null = null
let currentState: MockoonSidecarState | null = null

export function getMockoonSidecarState(): MockoonSidecarState | null {
  return currentState
}

export function isMockoonSidecarRunning(): boolean {
  return currentProcess !== null && currentProcess.exitCode === null
}

export async function startMockoonSidecar(
  environment: MockoonEnvironment,
): Promise<MockoonSidecarState> {
  if (isMockoonSidecarRunning()) {
    await stopMockoonSidecar()
  }

  const tmpDir = await mkdtemp(join(tmpdir(), "reqy-mockoon-"))
  const dataPath = join(tmpDir, "environment.json")
  await writeFile(dataPath, environmentToJson(environment), "utf-8")

  return new Promise((resolve, reject) => {
    const proc = spawn("npx", ["@mockoon/cli", "start", "-d", dataPath], {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, MOCKOON_PORT: String(environment.port) },
    })

    let stderrBuffer = ""
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuffer += chunk.toString()
    })

    const timeout = setTimeout(() => {
      proc.kill()
      reject(new Error(`Mockoon CLI failed to start within 5s. stderr: ${stderrBuffer.trim() || "(none)"}`))
    }, 5000)

    proc.on("error", (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    proc.on("spawn", () => {
      clearTimeout(timeout)
      currentProcess = proc
      currentState = {
        baseUrl: `http://${environment.hostname}:${environment.port}`,
        pid: proc.pid ?? 0,
        dataPath,
      }
      resolve(currentState)
    })
  })
}

export async function stopMockoonSidecar(): Promise<void> {
  if (!currentProcess) return
  currentProcess.kill("SIGTERM")
  await new Promise<void>((resolve) => {
    currentProcess?.on("exit", () => resolve())
    setTimeout(() => {
      currentProcess?.kill("SIGKILL")
      resolve()
    }, 2000)
  })
  currentProcess = null
  currentState = null
}
