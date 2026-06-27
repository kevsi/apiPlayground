import { NextRequest, NextResponse } from "next/server"
import { validatePostmanApiKey } from "@/lib/postman"
import { buildApiKeyCookie, buildClearApiKeyCookie } from "./cookies"

const API_KEY_REGEX = /^PMAK-[A-Za-z0-9_-]+$/

export async function POST(request: NextRequest) {
  let body: { apiKey?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 })
  }

  const apiKey = body.apiKey?.trim()
  if (!apiKey || !API_KEY_REGEX.test(apiKey)) {
    return NextResponse.json(
      { error: "Clé API invalide (doit commencer par PMAK-)" },
      { status: 400 }
    )
  }

  const user = await validatePostmanApiKey(apiKey)
  if (!user) {
    return NextResponse.json(
      { error: "Clé API rejetée par Postman (invalide, expirée ou révoquée)" },
      { status: 400 }
    )
  }

  const response = NextResponse.json({ connected: true, user })
  response.cookies.set(buildApiKeyCookie(apiKey))
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(buildClearApiKeyCookie())
  return response
}
