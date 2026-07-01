export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { provider, apiKey } = body

    if (provider === "opencode-zen") {
      const res = await fetch("https://opencode.ai/zen/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) {
        return NextResponse.json({ error: `HTTP ${res.status}` }, { status: res.status })
      }
      const data = await res.json()
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: "Unsupported provider" }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
