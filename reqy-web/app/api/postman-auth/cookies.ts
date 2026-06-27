const COOKIE_NAME = "postman_api_key"
const DURATION_S = 30 * 24 * 60 * 60

export function buildApiKeyCookie(value: string) {
  return {
    name: COOKIE_NAME,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: DURATION_S,
  }
}

export function buildClearApiKeyCookie() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  }
}

export function getApiKeyFromRequest(request: { cookies: { get(name: string): { value: string } | undefined } }): string | null {
  return request.cookies.get(COOKIE_NAME)?.value ?? null
}
