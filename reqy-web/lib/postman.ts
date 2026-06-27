const POSTMAN_API_BASE = "https://api.postman.com"
const TIMEOUT_MS = 10000

export interface PostmanUser {
  username: string
  email?: string
}

export async function validatePostmanApiKey(apiKey: string): Promise<PostmanUser | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${POSTMAN_API_BASE}/me`, {
      headers: { "X-API-Key": apiKey },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    return {
      username: data.user?.username ?? "unknown",
      email: data.user?.email,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}
