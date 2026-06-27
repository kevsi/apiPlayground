const POSTMAN_API_BASE = "https://api.postman.com"
const TIMEOUT_MS = 10000

export interface PostmanUser {
  username: string
  email?: string
}

export class PostmanApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = "PostmanApiError"
  }
}

export async function validatePostmanApiKey(apiKey: string): Promise<PostmanUser> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${POSTMAN_API_BASE}/me`, {
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/vnd.api.v10+json",
        "User-Agent": "Reqly/1.0",
      },
      signal: controller.signal,
    })

    if (res.ok) {
      const data = await res.json()
      const username = data.user?.username ?? data.username ?? "unknown"
      const email = data.user?.email ?? data.email
      return { username, email }
    }

    // Non-OK: extract Postman's error message if available
    let bodyText = ""
    try {
      const body = await res.json()
      bodyText = body?.message ?? body?.error?.message ?? body?.error ?? ""
    } catch {
      bodyText = ""
    }

    if (res.status === 401 || res.status === 403) {
      throw new PostmanApiError(res.status, bodyText || "Clé API invalide, expirée ou révoquée")
    }
    if (res.status === 429) {
      throw new PostmanApiError(res.status, "Limite de requêtes Postman atteinte, réessayez plus tard")
    }
    throw new PostmanApiError(res.status, bodyText || `Erreur Postman (HTTP ${res.status})`)
  } catch (err) {
    if (err instanceof PostmanApiError) throw err
    if (err instanceof Error && err.name === "AbortError") {
      throw new PostmanApiError(0, "Timeout : Postman n'a pas répondu en 10s")
    }
    throw new PostmanApiError(0, "Erreur réseau, réessayez")
  } finally {
    clearTimeout(timeoutId)
  }
}
