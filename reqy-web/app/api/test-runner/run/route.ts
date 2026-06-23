import { NextRequest, NextResponse } from "next/server"
import { runCollection } from "@/lib/test-runner/runner"
import { toJUnitXml } from "@/lib/test-runner/junit-export"
import { loadJsonDataset, loadCsvDataset } from "@/lib/test-runner/data-driven"
import type { Collection } from "@/hooks/request-types"

interface RunBody {
  collection: Collection
  environment?: Record<string, string>
  dataset?: { format: "json" | "csv"; content: string }
}

export async function POST(req: NextRequest) {
  let body: RunBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  if (!body.collection) {
    return NextResponse.json({ error: "Missing collection" }, { status: 400 })
  }

  const executor = async (r: { method: string; url: string; headers: Record<string, string>; body?: unknown }) => {
    const started = Date.now()
    const res = await fetch(r.url, {
      method: r.method,
      headers: r.headers,
      body: r.body as BodyInit | undefined,
    })
    const text = await res.text()
    let parsed: unknown
    try { parsed = JSON.parse(text) } catch { parsed = text }
    return {
      statusCode: res.status,
      responseTimeMs: Date.now() - started,
      body: parsed,
      headers: Object.fromEntries(res.headers.entries()),
    }
  }

  let iterations
  if (body.dataset) {
    const rows = body.dataset.format === "json"
      ? loadJsonDataset(body.dataset.content)
      : loadCsvDataset(body.dataset.content)
    iterations = rows.map((row, i) => ({
      environment: body.environment ?? {},
      iterationData: row,
      iterationIndex: i,
      log: () => {},
    }))
  }

  const report = await runCollection(
    body.collection,
    { environment: body.environment ?? {}, iterationData: {}, iterationIndex: 0, log: () => {} },
    { executor, iterations }
  )

  const url = new URL(req.url)
  if (url.searchParams.get("format") === "junit") {
    return new NextResponse(toJUnitXml(report), {
      status: 200,
      headers: { "content-type": "application/xml" },
    })
  }
  return NextResponse.json(report)
}
