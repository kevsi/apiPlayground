/**
 * Merge strategies for cloud sync conflict resolution.
 */

import type { Collection, Environment, HistoryItem, VariableMapping, Workspace, SavedProject, CollectionFolder, RequestItem } from "@/lib/types"
import type { MockRoute, MockServer } from "@/lib/mock-types"
import type { SyncPayload, SyncItemType } from "./sync-types"

// ── Helper: safe version of T ────────────────────────────────────────

function safeParse<T>(data: unknown, fallback: T): T {
  return typeof data === "object" && data !== null ? (data as T) : fallback
}

// ── Last-write-wins ──────────────────────────────────────────────────

export function lastWriteWins(local: SyncPayload, remote: SyncPayload): SyncPayload {
  return local.updatedAt >= remote.updatedAt ? local : remote
}

// ── Tie-breaker: device id hash ─────────────────────────────────────

export function tieBreaker(local: SyncPayload, remote: SyncPayload, deviceId: string): SyncPayload {
  const hash = (str: string) => str.split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  const localHash = hash(local.itemId + (local.updatedAt))
  const remoteHash = hash(remote.itemId + (remote.updatedAt))
  const deviceHash = hash(deviceId)
  return (localHash ^ deviceHash) > (remoteHash ^ deviceHash) ? local : remote
}

// ── Collection merge: union of requests, no auto-delete ─────────────

export function mergeCollections(local: SyncPayload, remote: SyncPayload): SyncPayload {
  const localCol = safeParse<Collection>(local.data, { id: local.itemId, name: "", requests: [], color: "slate", icon: "folder", createdAt: local.updatedAt, updatedAt: local.updatedAt })
  const remoteCol = safeParse<Collection>(remote.data, { id: remote.itemId, name: "", requests: [], color: "slate", icon: "folder", createdAt: remote.updatedAt, updatedAt: remote.updatedAt })

  const requestMap = new Map<string, RequestItem>()

  for (const req of localCol.requests) {
    requestMap.set(req.id, req)
  }

  for (const req of remoteCol.requests) {
    const existing = requestMap.get(req.id)
    if (!existing) {
      requestMap.set(req.id, req)
    } else if (req.updatedAt > existing.updatedAt) {
      requestMap.set(req.id, req)
    }
  }

  const folderMap = new Map<string, CollectionFolder>()
  const localFolders = localCol.folders || []
  const remoteFolders = remoteCol.folders || []

  for (const folder of localFolders) {
    folderMap.set(folder.id, folder)
  }

  for (const folder of remoteFolders) {
    const existing = folderMap.get(folder.id)
    if (!existing) {
      folderMap.set(folder.id, folder)
    } else if (folder.updatedAt > existing.updatedAt) {
      folderMap.set(folder.id, folder)
    }
  }

  const merged: Collection = {
    id: localCol.id,
    name: remoteCol.updatedAt > localCol.updatedAt ? remoteCol.name : localCol.name,
    description: remoteCol.updatedAt > localCol.updatedAt ? remoteCol.description : localCol.description,
    color: remoteCol.updatedAt > localCol.updatedAt ? remoteCol.color : localCol.color,
    icon: remoteCol.updatedAt > localCol.updatedAt ? remoteCol.icon : localCol.icon,
    workspaceId: remoteCol.workspaceId ?? localCol.workspaceId,
    requests: Array.from(requestMap.values()).sort((a, b) => a.createdAt - b.createdAt),
    folders: Array.from(folderMap.values()).sort((a, b) => a.order - b.order),
    createdAt: Math.min(localCol.createdAt, remoteCol.createdAt),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  }

  return {
    itemType: "collection",
    itemId: merged.id,
    workspaceId: merged.workspaceId,
    data: merged as unknown,
    updatedAt: merged.updatedAt,
  }
}

// ── Environment merge: last-write per variable ──────────────────────

export function mergeEnvironments(local: SyncPayload, remote: SyncPayload): SyncPayload {
  const localEnv = safeParse<Environment>(local.data, { id: local.itemId, name: "", variables: [], color: "slate", createdAt: local.updatedAt, updatedAt: local.updatedAt })
  const remoteEnv = safeParse<Environment>(remote.data, { id: remote.itemId, name: "", variables: [], color: "slate", createdAt: remote.updatedAt, updatedAt: remote.updatedAt })

  const varMap = new Map<string, { key: string; value: string; enabled: boolean }>()

  for (const v of localEnv.variables) {
    varMap.set(v.key, v)
  }

  for (const v of remoteEnv.variables) {
    const existing = varMap.get(v.key)
    if (!existing) {
      varMap.set(v.key, v)
    } else {
      // Prefer remote if env was updated later; otherwise keep existing
      varMap.set(v.key, remoteEnv.updatedAt > localEnv.updatedAt ? v : existing)
    }
  }

  const merged: Environment = {
    ...localEnv,
    name: remoteEnv.updatedAt > localEnv.updatedAt ? remoteEnv.name : localEnv.name,
    color: remoteEnv.updatedAt > localEnv.updatedAt ? remoteEnv.color : localEnv.color,
    workspaceId: remoteEnv.workspaceId ?? localEnv.workspaceId,
    variables: Array.from(varMap.values()),
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  }

  return {
    itemType: "environment",
    itemId: merged.id,
    workspaceId: merged.workspaceId,
    data: merged as unknown,
    updatedAt: merged.updatedAt,
  }
}

// ── History: append-only ────────────────────────────────────────────

export function mergeHistory(local: SyncPayload, remote: SyncPayload): SyncPayload {
  const localHist = safeParse<HistoryItem[]>(local.data, [])
  const remoteHist = safeParse<HistoryItem[]>(remote.data, [])

  const seen = new Set<string>()
  const merged: HistoryItem[] = []

  for (const item of localHist) {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      merged.push(item)
    }
  }

  for (const item of remoteHist) {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      merged.push(item)
    }
  }

  return {
    itemType: "history",
    itemId: local.itemId,
    workspaceId: local.workspaceId ?? remote.workspaceId,
    data: merged as unknown,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  }
}

// ── Workspace / Project / VariableMapping / MockServer / MockRoute: LWW ──

export function mergeGeneric(local: SyncPayload, remote: SyncPayload): SyncPayload {
  return lastWriteWins(local, remote)
}

// ── Dispatcher: pick the right strategy ─────────────────────────────

export function mergePayloads(local: SyncPayload, remote: SyncPayload, deviceId: string): {
  winner: SyncPayload
  needsManualResolution: boolean
} {
  if (local.updatedAt === remote.updatedAt) {
    // True conflict — use tie-breaker heuristic
    const winner = tieBreaker(local, remote, deviceId)
    const needsManual = local.itemType === "collection"
    return { winner, needsManualResolution: needsManual }
  }

  const later = local.updatedAt > remote.updatedAt ? local : remote
  const earlier = local.updatedAt > remote.updatedAt ? remote : local

  switch (local.itemType) {
    case "collection":
      return { winner: mergeCollections(local, remote), needsManualResolution: false }
    case "environment":
      return { winner: mergeEnvironments(local, remote), needsManualResolution: false }
    case "history":
      return { winner: mergeHistory(local, remote), needsManualResolution: false }
    case "workspace":
    case "project":
    case "variableMapping":
    case "mockRoute":
    case "mockServer":
      return { winner: later, needsManualResolution: false }
    default:
      return { winner: later, needsManualResolution: false }
  }
}
