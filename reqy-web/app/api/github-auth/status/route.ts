import { NextRequest, NextResponse } from "next/server"

const GITHUB_USER_URL = "https://api.github.com/user"

function buildGithubHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "api-playground",
    Authorization: `Bearer ${token}`,
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("github_token")?.value
  if (!token) {
    return NextResponse.json({ connected: false })
  }

  const response = await fetch(GITHUB_USER_URL, {
    headers: buildGithubHeaders(token),
  })

  if (!response.ok) {
    const nextResponse = NextResponse.json({ connected: false })
    nextResponse.cookies.delete("github_token")
    return nextResponse
  }

  const user = await response.json()
  return NextResponse.json({ connected: true, user: { login: user.login, name: user.name, avatar_url: user.avatar_url } })
}
