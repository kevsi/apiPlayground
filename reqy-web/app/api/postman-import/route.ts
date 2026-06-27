import { NextRequest, NextResponse } from "next/server"
import { formatZodError, postmanImportBodySchema, postmanImportResponseSchema } from "@/lib/import-schemas"
import { postmanFetch } from "@/lib/postman-api"

export async function POST(request: NextRequest) {
  const bodyResult = postmanImportBodySchema.safeParse(await request.json())
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
      { status: 401 }
    )
  }

  if (!collectionId) {
    return NextResponse.json(
      { message: "ID collection requis" },
      { status: 400 }
    )
  }

  try {
    const response = await postmanFetch(apiKey, `/collections/${collectionId}`)

    if (!response.ok) {
      return NextResponse.json(
        { message: "Collection Postman non trouvée" },
        { status: response.status }
      )
    }

    const data = await response.json()
    const collection = data.collection

    // Extract routes from Postman collection items
    const routes: any[] = []

    function extractRequests(items: any[], parentPath = "") {
      if (!items) return

      for (const item of items) {
        if (item.item) {
          // Folder
          const folderName = item.name || "Folder"
          extractRequests(item.item, parentPath ? `${parentPath}/${folderName}` : folderName)
        } else if (item.request) {
          // Request
          const method = item.request.method || "GET"
          const url = typeof item.request.url === "string" 
            ? item.request.url 
            : item.request.url?.raw || ""
          
          // Extract path from URL (remove domain)
          let path = url
          try {
            const urlObj = new URL(url)
            path = urlObj.pathname || "/"
          } catch {
            // If not a valid URL, use as is
            if (!url.startsWith("/")) {
              path = "/" + url
            }
          }

          routes.push({
            method: method.toUpperCase(),
            path: path,
            name: item.name || method,
            description: item.request.description || "",
            sourceFile: `postman:${item.name}`,
          })
        }
      }
    }

    extractRequests(collection.item || [])

    const payload = {
      name: collection.info?.name || "Postman Collection",
      framework: "postman",
      language: "postman",
      routes,
      metadata: {
        collectionId,
        description: collection.info?.description || "",
      },
    }

    const validated = postmanImportResponseSchema.safeParse(payload)
    if (!validated.success) {
      return NextResponse.json(
        { message: "Réponse Postman invalide", details: formatZodError(validated.error) },
        { status: 502 },
      )
    }

    return NextResponse.json(validated.data)
  } catch (error) {
    console.error("Postman import error:", error)
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Erreur lors de l'import de la collection",
      },
      { status: 500 }
    )
  }
}
