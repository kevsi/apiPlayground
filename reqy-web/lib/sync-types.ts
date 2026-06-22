/**
 * Core types for the cloud sync engine.
 */

import type { Collection, Environment, HistoryItem, VariableMapping, Workspace, SavedProject } from "@/lib/types"
import type { MockRoute, MockServer } from "@/lib/mock-types"

export type SyncItemType =
  | "collection"
  | "environment"
  | "history"
  | "variableMapping"
  | "project"
  | "workspace"
  | "mockRoute"
  | "mockServer"

export interface SyncPayload {
  itemType: SyncItemType
  itemId: string
  workspaceId?: string
  data: unknown
  updatedAt: number
  deleted?: boolean
}

export interface SyncItem {
  id: string
  user_id: string
  item_type: SyncItemType
  item_id: string
  workspace_id?: string
  payload: SyncPayload
  updated_at: string // ISO 8601 from Supabase
  deleted: boolean
}

export interface SyncMetadata {
  user_id: string
  device_id: string
  last_sync_at: string // ISO 8601
}

export type SyncState = "idle" | "syncing" | "synced" | "error" | "offline"

export interface ConflictItem {
  id: string
  itemType: SyncItemType
  itemId: string
  localPayload: SyncPayload
  remotePayload: SyncPayload
  timestamp: number
}

export interface SyncQueueItem {
  id: string
  payload: SyncPayload
  attempts: number
  createdAt: number
}
