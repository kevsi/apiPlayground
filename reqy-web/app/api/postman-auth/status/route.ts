export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server"
import { getApiKeyFromRequest } from "../cookies"

export async function GET(request: NextRequest) {
  const apiKey = getApiKeyFromRequest(request)
  if (!apiKey) {
    return NextResponse.json({ connected: false })
  }
  // V1: on ne re-valide pas à chaque appel (perf).
  // La re-validation se fait au prochain save.
  return NextResponse.json({
    connected: true,
    user: { username: "postman-user" },
  })
}
