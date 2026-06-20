import { NextRequest, NextResponse } from "next/server"

const POSTMAN_API_BASE = "https://api.getpostman.com"

async function fetchCollectionDetails(apiKey: string, collectionId: string) {
  const response = await fetch(`${POSTMAN_API_BASE}/collections/${collectionId}`, {
    headers: {
      "X-Api-Key": apiKey,
    },
  })

  if (!response.ok) return null
  return response.json().catch(() => null)
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
    const nestedCount = countItems(collection.item)
    if (nestedCount > 0) return nestedCount
    return collection.item.length
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
    return NextResponse.json(
      { message: "Non connecté à Postman" },
      { status: 401 }
    )
  }

  try {
    const response = await fetch(`${POSTMAN_API_BASE}/collections`, {
      headers: {
        "X-Api-Key": apiKey,
      },
    })

    if (!response.ok) {
      return NextResponse.json(
        { message: "Erreur lors de la récupération des collections Postman" },
        { status: response.status }
      )
    }

    const data = await response.json()
    const collections = await Promise.all(
      (data.collections || []).map(async (col: any) => {
        const id = col.uid || col.id
        let count = countCollectionItems(col)

        if (count === 0 && id) {
          const detailData = await fetchCollectionDetails(apiKey, id)
          count = countCollectionItems(detailData?.collection)
        }

        return {
          id,
          name: col.name,
          requests: count,
          items: count,
        }
      })
    )

    return NextResponse.json({ collections })
  } catch (error) {
    return NextResponse.json(
      { message: "Erreur lors de la récupération des collections" },
      { status: 500 }
    )
  }
}
