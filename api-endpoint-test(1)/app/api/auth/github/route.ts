import { NextRequest, NextResponse } from "next/server"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

export async function GET(request: NextRequest) {
  if (!SUPABASE_URL) {
    return NextResponse.json({ message: "NEXT_PUBLIC_SUPABASE_URL manquant" }, { status: 500 })
  }

  const origin = new URL(request.url).origin
  const redirectTo = `${origin}/api/auth/callback`
  const state = crypto.randomUUID()

  const url = new URL(`${SUPABASE_URL}/auth/v1/authorize`)
  url.searchParams.set("provider", "github")
  url.searchParams.set("redirect_to", redirectTo)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", "openid email profile")
  url.searchParams.set("state", state)

  const response = NextResponse.redirect(url)
  response.cookies.set("supabase_oauth_state", state, {
    httpOnly: true,
    path: "/",
    maxAge: 300,
    sameSite: "lax",
  })

  return response
}
