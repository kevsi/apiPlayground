import { NextRequest, NextResponse } from "next/server"
import { buildClearSessionCookie } from "../session"

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(buildClearSessionCookie())
  return response
}
