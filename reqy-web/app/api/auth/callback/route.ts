import { NextRequest, NextResponse } from "next/server"
import { createSessionCookieValue, buildSessionCookie } from "../session"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const TOKEN_URL = SUPABASE_URL ? `${SUPABASE_URL}/auth/v1/token` : ""

export async function GET(request: NextRequest) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ message: "Supabase non configuré correctement" }, { status: 500 })
  }

  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const savedState = request.cookies.get("supabase_oauth_state")?.value

  if (!code || !state || !savedState || state !== savedState) {
    const errorRedirect = new URL("/settings#account", request.url)
    errorRedirect.searchParams.set("auth_error", "Impossible de valider l'état OAuth")
    return NextResponse.redirect(errorRedirect)
  }

  const origin = new URL(request.url).origin
  const redirectTo = `${origin}/api/auth/callback`

  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      apikey: SUPABASE_ANON_KEY,
      Authorization: SERVICE_ROLE_KEY ? `Bearer ${SERVICE_ROLE_KEY}` : `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_to: redirectTo,
    }),
  })

  const tokenData = await tokenResponse.json()

  if (!tokenResponse.ok || !tokenData.access_token) {
    const errorRedirect = new URL("/settings#account", request.url)
    errorRedirect.searchParams.set("auth_error", tokenData.error_description || tokenData.error || "Impossible d'échanger le code OAuth")
    return NextResponse.redirect(errorRedirect)
  }

  const user = tokenData.user || {}
  const email = user.email || ""
  const name = user.user_metadata?.full_name || email.split("@")[0] || "Utilisateur"
  const provider = user.app_metadata?.provider || url.searchParams.get("provider") || "google"

  const cookieValue = createSessionCookieValue({
    email,
    name,
    provider: provider as "google" | "github" | "local",
    userId: user.id,
    supabaseAccessToken: tokenData.access_token,
    supabaseRefreshToken: tokenData.refresh_token,
    supabaseExpiresAt: tokenData.expires_in ? Date.now() + tokenData.expires_in * 1000 : undefined,
  })

  const response = NextResponse.redirect(new URL("/settings#account", request.url))
  response.cookies.set(buildSessionCookie(cookieValue))
  response.cookies.delete("supabase_oauth_state")
  return response
}
