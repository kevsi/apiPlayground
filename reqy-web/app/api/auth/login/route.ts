import { NextRequest, NextResponse } from "next/server"
import { buildSessionCookie, createSessionCookieValue } from "../session"
import { supabase } from "../../../lib/supabase-server"

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : ""
  const password = typeof body.password === "string" ? body.password : ""

  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ message: "Email invalide" }, { status: 400 })
  }

  if (!password || password.length < 8) {
    return NextResponse.json({ message: "Mot de passe invalide (au moins 8 caractères)" }, { status: 400 })
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.session || !data.user) {
    return NextResponse.json({
      message: error?.message || "Impossible de se connecter avec ces identifiants",
    }, { status: 400 })
  }

  const cookieValue = createSessionCookieValue({
    email: data.user.email ?? email,
    name: data.user.user_metadata?.full_name || email.split("@")[0],
    provider: "local",
    userId: data.user.id,
    supabaseAccessToken: data.session.access_token,
    supabaseRefreshToken: data.session.refresh_token,
    supabaseExpiresAt: data.session.expires_at ? data.session.expires_at * 1000 : undefined,
  })

  const response = NextResponse.json({
    connected: true,
    user: {
      email: data.user.email ?? email,
      name: data.user.user_metadata?.full_name || email.split("@")[0],
      provider: "local",
    },
  })

  response.cookies.set(buildSessionCookie(cookieValue))
  return response
}
