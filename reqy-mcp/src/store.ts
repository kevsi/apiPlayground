import type { Collection, ExportBundle } from "./types.js"

export class CollectionStore {
  private collections: Collection[] = []

  loadFromBundle(bundle: ExportBundle): void {
    this.collections = bundle.collections ?? []
  }

  loadFromCollections(collections: Collection[]): void {
    this.collections = collections ?? []
  }

  getCollections(): Collection[] {
    return this.collections
  }

  getCollection(id: string): Collection | undefined {
    return this.collections.find((c) => c.id === id)
  }

  findRequestById(requestId: string): { request: Collection["requests"][number]; collection: Collection } | undefined {
    for (const collection of this.collections) {
      const request = collection.requests.find((r) => r.id === requestId)
      if (request) {
        return { request, collection }
      }
    }
    return undefined
  }

  addRequest(collectionId: string, request: Collection["requests"][number]): void {
    const collection = this.getCollection(collectionId)
    if (!collection) {
      throw new Error(`Collection not found: ${collectionId}`)
    }
    collection.requests.push(request)
    collection.updatedAt = Date.now()
  }

  searchRequests(query: string): Array<{ request: Collection["requests"][number]; collectionId: string; collectionName: string }> {
    const lower = query.toLowerCase()
    const results: Array<{ request: Collection["requests"][number]; collectionId: string; collectionName: string }> = []

    for (const collection of this.collections) {
      for (const request of collection.requests) {
        const text = `${request.name} ${request.url} ${request.method}`.toLowerCase()
        if (text.includes(lower)) {
          results.push({
            request,
            collectionId: collection.id,
            collectionName: collection.name,
          })
        }
      }
    }

    return results
  }
}
