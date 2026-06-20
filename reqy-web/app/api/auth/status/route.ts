import { NextRequest, NextResponse } from "next/server"
import { getSessionFromRequest } from "../session"

export async function GET(request: NextRequest) {
  const session = getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ connected: false })
  }

  return NextResponse.json({ connected: true, user: { email: session.email, name: session.name, provider: session.provider } })
}
