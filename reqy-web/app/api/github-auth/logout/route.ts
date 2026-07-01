export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete("github_token")
  return response
}
