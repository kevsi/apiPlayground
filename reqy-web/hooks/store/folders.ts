"use client"

import type { CollectionFolder, RequestItem, Collection } from "@/hooks/request-types"
import type { CommitFn } from "./types"

export function createFoldersMutations(commit: CommitFn) {
  const addFolder = (
    collectionId: string, name: string, parentId: string | null = null) => {
      const newFolder: CollectionFolder = {
        id: `folder-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        name,
        parentId,
        collectionId,
        order: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === collectionId
            ? { ...c, folders: [...(c.folders ?? []), newFolder], updatedAt: Date.now() }
            : c
        ),
      }))
      return newFolder.id
    }

  const renameFolder = (
    collectionId: string, folderId: string, name: string) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === collectionId
            ? {
                ...c,
                folders: (c.folders ?? []).map((f) =>
                  f.id === folderId ? { ...f, name, updatedAt: Date.now() } : f
                ),
                updatedAt: Date.now(),
              }
            : c
        ),
      }))
    }

  const deleteFolder = (
    collectionId: string, folderId: string) => {
      commit((prev) => {
        const collectDescendants = (parentId: string): string[] => {
          const col = prev.collections.find((c) => c.id === collectionId)
          if (!col) return []
          return (col.folders ?? [])
            .filter((f) => f.parentId === parentId)
            .flatMap((f) => [f.id, ...collectDescendants(f.id)])
        }
        const toDelete = new Set([folderId, ...collectDescendants(folderId)])

        return {
          ...prev,
          collections: prev.collections.map((c) =>
            c.id === collectionId
              ? {
                  ...c,
                  requests: c.requests.map((r) =>
                    toDelete.has(r.folderId ?? "") ? { ...r, folderId: undefined } : r
                  ),
                  folders: (c.folders ?? []).filter((f) => !toDelete.has(f.id)),
                  updatedAt: Date.now(),
                }
              : c
          ),
        }
      })
    }

  const moveRequestToFolder = (
    collectionId: string, requestId: string, folderId: string | null) => {
      const now = Date.now()
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) =>
          c.id === collectionId
            ? {
                ...c,
                requests: c.requests.map((r) =>
                  r.id === requestId ? { ...r, folderId, updatedAt: now } : r
                ),
                updatedAt: now,
              }
            : c
        ),
      }))
    }

  const moveFolder = (
    collectionId: string, folderId: string, newParentId: string | null) => {
      commit((prev) => {
        const isCircular = (targetParentId: string | null, childId: string): boolean => {
          if (!targetParentId) return false
          if (targetParentId === childId) return true
          const col = prev.collections.find((c) => c.id === collectionId)
          const parent = col?.folders?.find((f) => f.id === targetParentId)
          return parent ? isCircular(parent.parentId, childId) : false
        }
        if (isCircular(newParentId, folderId)) return prev

        return {
          ...prev,
          collections: prev.collections.map((c) =>
            c.id === collectionId
              ? {
                  ...c,
                  folders: (c.folders ?? []).map((f) =>
                    f.id === folderId ? { ...f, parentId: newParentId, updatedAt: Date.now() } : f
                  ),
                  updatedAt: Date.now(),
                }
              : c
          ),
        }
      })
    }

  const reorderRequestsInCollection = (
    collectionId: string, folderId: string | null, orderedRequestIds: string[]) => {
      commit((prev) => ({
        ...prev,
        collections: prev.collections.map((c) => {
          if (c.id !== collectionId) return c
          const requestsInLevel = c.requests.filter((r) => r.folderId === folderId)
          const requestsNotInLevel = c.requests.filter((r) => r.folderId !== folderId)
          const requestMap = new Map(requestsInLevel.map((r) => [r.id, r]))
          const reordered = orderedRequestIds
            .map((id) => requestMap.get(id))
            .filter(Boolean) as RequestItem[]
          const remaining = requestsInLevel.filter(
            (r) => !orderedRequestIds.includes(r.id)
          )
          return {
            ...c,
            requests: [...reordered, ...remaining, ...requestsNotInLevel],
            updatedAt: Date.now(),
          }
        }),
      }))
    }

  const reorderFolders = (
    collectionId: string, parentFolderId: string | null, orderedFolderIds: string[]) => {
      commit((prev) => {
        const collection = prev.collections.find((c) => c.id === collectionId)
        if (!collection) return prev

        const folders = collection.folders ?? []
        const foldersInLevel = folders.filter((f) => f.parentId === parentFolderId)
        const foldersNotInLevel = folders.filter((f) => f.parentId !== parentFolderId)
        const folderMap = new Map(foldersInLevel.map((f) => [f.id, f]))
        const reordered = orderedFolderIds
          .map((id) => folderMap.get(id))
          .filter(Boolean) as CollectionFolder[]
        const remaining = foldersInLevel.filter(
          (f) => !orderedFolderIds.includes(f.id)
        )

        return {
          ...prev,
          collections: prev.collections.map((c) =>
            c.id === collectionId
              ? {
                  ...c,
                  folders: [...reordered, ...remaining, ...foldersNotInLevel],
                  updatedAt: Date.now(),
                }
              : c
          ),
        }
      })
    }

  const getFoldersForCollection = (
    collectionId: string, collections: Collection[]): CollectionFolder[] => {
      const col = collections.find((c) => c.id === collectionId)
      return col?.folders ?? []
    }

  return {
    addFolder,
    renameFolder,
    deleteFolder,
    moveRequestToFolder,
    moveFolder,
    reorderRequestsInCollection,
    reorderFolders,
    getFoldersForCollection,
  }
}
