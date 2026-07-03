import { NextRequest, NextResponse } from "next/server"
import type { MockRoute } from "@/lib/mock-types"
import { convertMockRoutesToEnvironment } from "@/lib/mockoon/adapter"
import { startMockoonSidecar, stopMockoonSidecar } from "@/lib/mockoon/sidecar"

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { routes: MockRoute[]; port?: number }
    const routes = body.routes ?? []
    const port = body.port ?? 3001

    await stopMockoonSidecar()

    const environment = convertMockRoutesToEnvironment(routes, {
      name: "reqy-mock-environment",
      port,
    })

    const state = await startMockoonSidecar(environment)

    return NextResponse.json({ ok: true, baseUrl: state.baseUrl, pid: state.pid })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
