import { NextRequest, NextResponse } from "next/server"

const GITHUB_REPOS_URL = "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,organization_member"

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
    return NextResponse.json({ connected: false, repos: [] }, { status: 401 })
  }

  const response = await fetch(GITHUB_REPOS_URL, {
    headers: buildGithubHeaders(token),
  })

  if (!response.ok) {
    const nextResponse = NextResponse.json({ connected: false, repos: [] }, { status: 401 })
    nextResponse.cookies.delete("github_token")
    return nextResponse
  }

  const repos = await response.json()
  const normalized = repos.map((repo: any) => ({
    id: repo.id,
    full_name: repo.full_name,
    name: repo.name,
    owner: { login: repo.owner?.login },
    html_url: repo.html_url,
    description: repo.description,
    default_branch: repo.default_branch,
  }))

  return NextResponse.json({ connected: true, repos: normalized })
}
