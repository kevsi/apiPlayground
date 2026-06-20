import { NextRequest, NextResponse } from "next/server"
import { buildSessionCookie, createSessionCookieValue } from "../../session"

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const USERINFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo?alt=json"
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const savedState = request.cookies.get("google_oauth_state")?.value

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json({ message: "GOOGLE_OAUTH_CLIENT_ID ou GOOGLE_OAUTH_CLIENT_SECRET manquant" }, { status: 500 })
  }

  if (!code || !state || !savedState || state !== savedState) {
    const errorRedirect = new URL("/settings#account", request.url)
    errorRedirect.searchParams.set("auth_error", "Impossible de valider l'état Google")
    return NextResponse.redirect(errorRedirect)
  }

  const origin = new URL(request.url).origin
  const redirectUri = `${origin}/api/auth/google/callback`

  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  })

  const tokenData = await tokenResponse.json()
  const accessToken = tokenData.access_token

  if (!accessToken) {
    const errorRedirect = new URL("/settings#account", request.url)
    errorRedirect.searchParams.set("auth_error", tokenData.error_description || "Impossible d'obtenir le token Google")
    return NextResponse.redirect(errorRedirect)
  }

  const userResponse = await fetch(USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!userResponse.ok) {
    const errorRedirect = new URL("/settings#account", request.url)
    errorRedirect.searchParams.set("auth_error", "Impossible de récupérer les informations Google")
    return NextResponse.redirect(errorRedirect)
  }

  const userData = await userResponse.json()
  const email = userData.email || ""
  const name = userData.name || email.split("@")[0] || "Utilisateur"

  const cookieValue = createSessionCookieValue({ email, name, provider: "google" })
  const response = NextResponse.redirect(new URL("/settings#account", request.url))
  response.cookies.set(buildSessionCookie(cookieValue))
  response.cookies.delete("google_oauth_state")

  return response
}
