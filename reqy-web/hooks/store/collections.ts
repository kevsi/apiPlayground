import type { Collection, RequestItem } from "@/hooks/request-types"
import { CommitFn, WORKSPACE_PERSONAL_ID } from "./types"

export function createCollectionsMutations(commit: CommitFn) {
  const addCollection = (
    data: Omit<Collection, "id" | "createdAt" | "updatedAt" | "requests"> & { requests?: RequestItem[] }) => {
      const id = `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      commit((prev) => {
        const wsId = prev.activeWorkspaceId ?? WORKSPACE_PERSONAL_ID
        return {
          ...prev,
          collections: [
            ...prev.collections,
            {
              ...data,
              workspaceId: wsId,
              id,
              requests: data.requests ?? [],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        }
      })
      return id
    }

  const updateCollection = (
    id: string, updates: Partial<Collection>) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
        ),
      }))
    }

  const deleteCollection = (
    id: string) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.filter((c) => c.id !== id),
      }))
    }

  const duplicateCollection = (
    id: string) => {
      commit((prev) => {
        const source = prev.collections.find((c) => c.id === id)
        if (!source) return prev
        const now = Date.now()
        const newId = `col-${now}-${Math.random().toString(36).slice(2, 6)}`
        const duplicate: Collection = {
          ...source,
          id: newId,
          name: `${source.name} (Copy)`,
          requests: source.requests.map((r) => ({
            ...r,
            id: `req-${now}-${Math.random().toString(36).slice(2, 8)}`,
            createdAt: now,
            updatedAt: now,
          })),
          folders: source.folders?.map((f) => ({
            ...f,
            id: `folder-${now}-${Math.random().toString(36).slice(2, 8)}`,
            collectionId: newId,
            createdAt: now,
            updatedAt: now,
          })),
          createdAt: now,
          updatedAt: now,
        }
        return {
          ...prev,
          collections: [...prev.collections, duplicate],
        }
      })
    }

  const reorderCollections = (
    ids: string[]) => {
      commit((prev) => {
        const reordered = ids
          .map((id) => prev.collections.find((c) => c.id === id))
          .filter(Boolean) as Collection[]
        const remaining = prev.collections.filter(
          (c) => !ids.includes(c.id)
        )
        return {
          ...prev,
          collections: [...reordered, ...remaining],
        }
      })
    }

  const addRequestToCollection = (
    collectionId: string, data: Omit<RequestItem, "id" | "createdAt" | "updatedAt">) => {
      const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === collectionId
            ? {
                ...c,
                updatedAt: Date.now(),
                requests: [
                  ...c.requests,
                  {
                    ...data,
                    id,
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  },
                ],
              }
            : c
        ),
      }))
      return id
    }

  const removeRequestFromCollection = (
    collectionId: string, requestId: string) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === collectionId
            ? {
                ...c,
                updatedAt: Date.now(),
                requests: c.requests.filter((r) => r.id !== requestId),
              }
            : c
        ),
      }))
    }

  const updateRequestInCollection = (
    collectionId: string, requestId: string, updates: Partial<RequestItem>) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === collectionId
            ? {
                ...c,
                updatedAt: Date.now(),
                requests: c.requests.map((r) =>
                  r.id === requestId
                    ? { ...r, ...updates, updatedAt: Date.now() }
                    : r
                ),
              }
            : c
        ),
      }))
    }

  const updateRequestById = (
    requestId: string, updates: Partial<RequestItem>) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) => ({
          ...c,
          updatedAt: c.requests.some((r) => r.id === requestId)
            ? Date.now()
            : c.updatedAt,
          requests: c.requests.map((r) =>
            r.id === requestId
              ? { ...r, ...updates, updatedAt: Date.now() }
              : r
          ),
        })),
      }))
    }

  return {
    addCollection,
    updateCollection,
    deleteCollection,
    duplicateCollection,
    reorderCollections,
    addRequestToCollection,
    removeRequestFromCollection,
    updateRequestInCollection,
    updateRequestById,
  }
}
