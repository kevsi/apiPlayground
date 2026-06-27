const POSTMAN_API_BASE = "https://api.postman.com"
const TIMEOUT_MS = 10000

export class PostmanApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = "PostmanApiError"
  }
}

export async function postmanFetch(
  apiKey: string,
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(`${POSTMAN_API_BASE}${path}`, {
      ...options,
      headers: {
        "X-API-Key": apiKey,
        Accept: "application/vnd.api.v10+json",
        "User-Agent": "Reqly/1.0",
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function postmanFetchJson<T = unknown>(
  apiKey: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await postmanFetch(apiKey, path, options)
  if (!res.ok) {
    let msg = ""
    try {
      const body = await res.json()
      msg = body?.error?.message ?? body?.message ?? ""
    } catch {
      /* body not JSON */
    }
    throw new PostmanApiError(res.status, msg || `Erreur Postman (HTTP ${res.status})`)
  }
  return res.json()
}
