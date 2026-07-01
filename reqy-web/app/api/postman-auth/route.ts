export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server"
import { validatePostmanApiKey, PostmanApiError } from "@/lib/postman"
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

  try {
    const user = await validatePostmanApiKey(apiKey)
    const response = NextResponse.json({ connected: true, user })
    response.cookies.set(buildApiKeyCookie(apiKey))
    return response
  } catch (err) {
    if (err instanceof PostmanApiError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    return NextResponse.json({ error: "Erreur inattendue" }, { status: 500 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(buildClearApiKeyCookie())
  return response
}
