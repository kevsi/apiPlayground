import type { Workspace } from "@/hooks/request-types"
import { CommitFn, WORKSPACE_PERSONAL_ID } from "./types"

export function createWorkspacesMutations(commit: CommitFn) {
  const addWorkspace = (
    data: Omit<Workspace, "id" | "createdAt" | "updatedAt">) => {
      const now = Date.now()
      const workspace: Workspace = {
        ...data,
        id: `ws-${now}`,
        createdAt: now,
        updatedAt: now,
      }
      commit((prev) => ({
        ...prev,
        workspaces: [...prev.workspaces, workspace],
        activeWorkspaceId: workspace.id,
      }))
      return workspace.id
    }

  const updateWorkspace = (
    id: string, updates: Partial<Workspace>) => {
      commit((prev) => ({
        ...prev,
        workspaces: prev.workspaces.map((w) =>
          w.id === id ? { ...w, ...updates, updatedAt: Date.now() } : w
        ),
      }))
    }

  const deleteWorkspace = (
    id: string) => {
      commit((prev) => {
        const remaining = prev.workspaces.filter((w) => w.id !== id)
        if (remaining.length === 0) return prev
        return {
          ...prev,
          workspaces: remaining,
          activeWorkspaceId:
            prev.activeWorkspaceId === id ? remaining[0].id : prev.activeWorkspaceId,
        }
      })
    }

  const setActiveWorkspace = (
    id: string) => {
      commit((prev) => ({ ...prev, activeWorkspaceId: id }))
    }

  // ── Sync upsert mutations ────────────────────────────────────────────
  // These are called by the sync engine when applying remote changes.
  // They do not trigger another push (no storeChangeListener fires a push).
  const upsertCollectionFromSync = (data: any) => {
    commit((prev) => ({
      ...prev,
      collections: [
        ...prev.collections.filter((c: any) => c.id !== data.id),
        { ...data, updatedAt: Date.now() },
      ],
    }))
  }

  const upsertEnvironmentFromSync = (data: any) => {
    commit((prev) => ({
      ...prev,
      environments: [
        ...prev.environments.filter((e: any) => e.id !== data.id),
        { ...data, updatedAt: Date.now() },
      ],
    }))
  }

  // Folders are nested inside their parent collection (not a top-level field),
  // so we locate the owning collection via data.collectionId and update its
  // folders array in place.
  const upsertFolderFromSync = (data: any) => {
    commit((prev) => ({
      ...prev,
      collections: prev.collections.map((c: any) => {
        if (c.id !== data.collectionId) return c
        const existingFolders = c.folders ?? []
        return {
          ...c,
          folders: [
            ...existingFolders.filter((f: any) => f.id !== data.id),
            { ...data, updatedAt: Date.now() },
          ],
          updatedAt: Date.now(),
        }
      }),
    }))
  }

  return {
    addWorkspace,
    updateWorkspace,
    deleteWorkspace,
    setActiveWorkspace,
    upsertCollectionFromSync,
    upsertEnvironmentFromSync,
    upsertFolderFromSync,
  }
}
