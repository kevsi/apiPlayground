export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from "next/server"
import { postmanFetchJson, PostmanApiError } from "@/lib/postman"

async function fetchCollectionDetails(apiKey: string, collectionId: string) {
  try {
    return await postmanFetchJson<any>(apiKey, `/collections/${collectionId}`)
  } catch {
    return null
  }
}

function countCollectionItems(collection: any): number {
  if (!collection) return 0
  const countItems = (items: any[]): number => {
    if (!Array.isArray(items)) return 0
    return items.reduce((total, item) => {
      if (item.request) return total + 1
      if (item.item) return total + countItems(item.item)
      return total
    }, 0)
  }
  if (Array.isArray(collection.item)) {
    return countItems(collection.item)
  }
  if (collection.summary?.totalRequests != null) return collection.summary.totalRequests
  if (collection.summary?.requestCount != null) return collection.summary.requestCount
  if (collection.requestCount != null) return collection.requestCount
  if (collection.totalRequests != null) return collection.totalRequests
  return 0
}

export async function GET(request: NextRequest) {
  const apiKey = request.cookies.get("postman_api_key")?.value
  if (!apiKey) {
    return NextResponse.json({ message: "Non connecté à Postman" }, { status: 401 })
  }

  try {
    const data = await postmanFetchJson<any>(apiKey, "/collections")
    const collections = await Promise.all(
      (data.collections || []).map(async (col: any) => {
        const id = col.uid || col.id
        let count = countCollectionItems(col)
        if (count === 0 && id) {
          const detailData = await fetchCollectionDetails(apiKey, id)
          count = countCollectionItems(detailData?.collection)
        }
        return { id, name: col.name, requests: count, items: count }
      })
    )
    return NextResponse.json({ collections })
  } catch (error) {
    const status = error instanceof PostmanApiError ? error.status : 500
    const message = error instanceof Error ? error.message : "Erreur lors de la récupération des collections"
    return NextResponse.json({ message }, { status })
  }
}
