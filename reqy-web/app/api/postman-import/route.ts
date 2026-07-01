export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server"
import {
  formatZodError,
  postmanImportBodySchema,
  postmanImportResponseSchema,
} from "@/lib/import-schemas"
import { postmanFetchJson, PostmanApiError, extractPostmanCollection } from "@/lib/postman"

/**
 * Legacy Postman import endpoint.
 *
 * Kept for the older `components/import-postman-modal.tsx` flow which expects
 * a flat `routes[]` shape. Internally we now share the same extraction logic
 * as `/api/postman-import/save` so behaviour stays consistent across both
 * modals (body modes, auth, folder traversal, disabled params).
 *
 * The response also includes the modern `folders` + `requests` arrays for any
 * future caller that prefers the rich shape. The Zod schema only validates
 * the legacy fields and lets the extra ones pass through.
 */
export async function POST(request: NextRequest) {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ message: "Body JSON invalide" }, { status: 400 })
  }

  const bodyResult = postmanImportBodySchema.safeParse(raw)
  if (!bodyResult.success) {
    return NextResponse.json(
      { message: formatZodError(bodyResult.error) },
      { status: 400 },
    )
  }
  const { collectionId } = bodyResult.data
  const apiKey = request.cookies.get("postman_api_key")?.value

  if (!apiKey) {
    return NextResponse.json(
      { message: "Non connecté à Postman" },
      { status: 401 },
    )
  }

  try {
    const data = await postmanFetchJson<any>(apiKey, `/collections/${collectionId}`)
    const collection = data.collection
    const { folders, requests } = extractPostmanCollection(collection?.item ?? [])

    // Map the rich extracted requests down to the legacy flat `routes` shape.
    // The legacy modal expects only method/path/name/description/sourceFile,
    // so we strip the domain off full URLs to mirror the original behaviour.
    const routes = requests.map((r) => ({
      method: r.method,
      path: stripDomain(r.url),
      name: r.name,
      description: "",
      sourceFile: `postman:${r.name}`,
    }))

    const payload = {
      name: collection?.info?.name ?? "Postman Collection",
      framework: "postman",
      language: "postman",
      routes,
      metadata: {
        collectionId,
        description: collection?.info?.description ?? "",
      },
      // Modern (rich) shape — not part of the Zod schema but accepted as
      // additional properties by default.
      folders,
      requests,
    }

    const validated = postmanImportResponseSchema.safeParse(payload)
    if (!validated.success) {
      return NextResponse.json(
        {
          message: "Réponse Postman invalide",
          details: formatZodError(validated.error),
        },
        { status: 502 },
      )
    }

    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof PostmanApiError) {
      return NextResponse.json({ message: error.message }, { status: error.status === 401 ? 401 : 400 })
    }
    console.error("Postman import error:", error)
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Erreur lors de l'import de la collection",
      },
      { status: 500 },
    )
  }
}

function stripDomain(rawUrl: string): string {
  if (!rawUrl) return "/"
  try {
    return new URL(rawUrl).pathname || "/"
  } catch {
    return rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`
  }
}
