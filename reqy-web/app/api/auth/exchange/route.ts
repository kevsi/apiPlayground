import { NextRequest, NextResponse } from "next/server"
import { createSessionCookieValue, buildSessionCookie } from "../session"
import { getSupabaseClient } from "../../../lib/supabase-server"

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      email,
      name,
      provider,
      userId,
      accessToken,
      refreshToken,
      expiresAt,
    } = body

    if (!accessToken || !userId) {
      return NextResponse.json(
        { error: "Token ou userId manquant" },
        { status: 400 }
      )
    }

    // Vérifier que le token est valide auprès de Supabase
    const supabase = getSupabaseClient()
    const { data: { user }, error } = await supabase.auth.getUser(accessToken)

    if (error || !user) {
      return NextResponse.json(
        { error: "Token invalide" },
        { status: 401 }
      )
    }

    const userEmail = user.email ?? email ?? ""
    const userName = user.user_metadata?.full_name ?? name ?? userEmail.split("@")[0] ?? "Utilisateur"
    const userProvider = user.app_metadata?.provider ?? provider ?? "local"

    const cookieValue = createSessionCookieValue({
      email: userEmail,
      name: userName,
      provider: userProvider as "google" | "github" | "local",
      userId: user.id,
      supabaseAccessToken: accessToken,
      supabaseRefreshToken: refreshToken,
      supabaseExpiresAt: expiresAt ? Number(expiresAt) * 1000 : undefined,
    })

    const response = NextResponse.json({ success: true })
    response.cookies.set(buildSessionCookie(cookieValue))
    return response
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Erreur interne" },
      { status: 500 }
    )
  }
}
