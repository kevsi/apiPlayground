export { PostmanApiError } from "./postman-api"
import { postmanFetchJson, PostmanApiError } from "./postman-api"

export interface PostmanUser {
  username: string
  email?: string
}

export async function validatePostmanApiKey(apiKey: string): Promise<PostmanUser> {
  try {
    const data = await postmanFetchJson<any>(apiKey, "/me")
    return {
      username: data.user?.username ?? data.username ?? "unknown",
      email: data.user?.email ?? data.email,
    }
  } catch (err) {
    if (err instanceof PostmanApiError) {
      if (err.status === 429) {
        throw new PostmanApiError(
          429,
          "Limite de requêtes Postman atteinte, réessayez plus tard"
        )
      }
      throw err
    }
    if (err instanceof Error && err.name === "AbortError") {
      throw new PostmanApiError(0, "Timeout : Postman n'a pas répondu en 10s")
    }
    throw new PostmanApiError(0, "Erreur réseau, réessayez")
  }
}
