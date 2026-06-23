"use client"
import { create } from "zustand"

export interface ConflictRecord {
  entityType: "collection" | "environment" | "folder"
  entityId: string
  localUpdatedAt: number
  remoteUpdatedAt: number
  resolution: "local-wins" | "remote-wins"
}

export interface SyncState {
  enabled: boolean
  workspaceId: string | null
  serverUrl: string
  lastSyncAt: number | null
  syncing: boolean
  syncError: string | null
  conflicts: ConflictRecord[]
  setEnabled: (enabled: boolean) => void
  setWorkspace: (workspaceId: string | null) => void
  setServerUrl: (url: string) => void
  setSyncing: (syncing: boolean) => void
  setSyncError: (error: string | null) => void
  setLastSyncAt: (timestamp: number) => void
  addConflict: (conflict: ConflictRecord) => void
  clearConflicts: () => void
}

export const useSyncState = create<SyncState>((set) => ({
  enabled: false,
  workspaceId: null,
  serverUrl: "",
  lastSyncAt: null,
  syncing: false,
  syncError: null,
  conflicts: [],
  setEnabled: (enabled) => set({ enabled }),
  setWorkspace: (workspaceId) => set({ workspaceId }),
  setServerUrl: (serverUrl) => set({ serverUrl }),
  setSyncing: (syncing) => set({ syncing }),
  setSyncError: (syncError) => set({ syncError }),
  setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
  addConflict: (conflict) => set((s) => ({ conflicts: [...s.conflicts, conflict] })),
  clearConflicts: () => set({ conflicts: [] }),
}))
