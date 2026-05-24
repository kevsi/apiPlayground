import { NextRequest, NextResponse } from "next/server"

const TOKEN_URL = "https://github.com/login/oauth/access_token"
const CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID
const CLIENT_SECRET = process.env.GITHUB_OAUTH_CLIENT_SECRET

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const savedState = request.cookies.get("github_oauth_state")?.value

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json({ message: "GITHUB_OAUTH_CLIENT_ID ou GITHUB_OAUTH_CLIENT_SECRET manquant" }, { status: 500 })
  }

  if (!code || !state || !savedState || state !== savedState) {
    const errorRedirect = new URL("/settings#integrations", request.url)
    errorRedirect.searchParams.set("github_auth_error", "Impossible de valider l'état GitHub")
    return NextResponse.redirect(errorRedirect)
  }

  const origin = new URL(request.url).origin
  const redirectUri = `${origin}/api/github-auth/callback`

  const tokenResponse = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
      state,
    }),
  })

  const tokenData = await tokenResponse.json()
  const accessToken = tokenData.access_token

  if (!accessToken) {
    const errorRedirect = new URL("/settings#integrations", request.url)
    errorRedirect.searchParams.set("github_auth_error", tokenData.error_description || "Impossible d'obtenir le token GitHub")
    return NextResponse.redirect(errorRedirect)
  }

  const response = NextResponse.redirect(new URL("/settings#integrations", request.url))
  response.cookies.set("github_token", accessToken, {
    httpOnly: true,
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
  })
  response.cookies.delete("github_oauth_state")

  return response
}
