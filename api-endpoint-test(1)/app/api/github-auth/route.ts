import { NextRequest, NextResponse } from "next/server"

const GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
const CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID

export async function GET(request: NextRequest) {
  if (!CLIENT_ID) {
    return NextResponse.json({ message: "GITHUB_OAUTH_CLIENT_ID manquant" }, { status: 500 })
  }

  const origin = new URL(request.url).origin
  const redirectUri = `${origin}/api/github-auth/callback`
  const state = crypto.randomUUID()

  const githubUrl = new URL(GITHUB_AUTH_URL)
  githubUrl.searchParams.set("client_id", CLIENT_ID)
  githubUrl.searchParams.set("redirect_uri", redirectUri)
  githubUrl.searchParams.set("scope", "repo read:user")
  githubUrl.searchParams.set("state", state)
  githubUrl.searchParams.set("allow_signup", "false")

  const response = NextResponse.redirect(githubUrl)
  response.cookies.set("github_oauth_state", state, {
    httpOnly: true,
    path: "/",
    maxAge: 300,
    sameSite: "lax",
  })

  return response
}
