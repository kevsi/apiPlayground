"use client"

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export interface CollectionFolder {
  id: string
  name: string
  parentId: string | null
  collectionId: string
  order: number
  createdAt: number
  updatedAt: number
}

export interface RequestItem {
  id: string
  name: string
  method: HttpMethod
  url: string
  endpoint: string
  headers?: Record<string, string>
  body?: string
  queryParams?: Array<{ key: string; value: string }>
  folderId?: string | null
  createdAt: number
  updatedAt: number
}

export interface HistoryItem extends RequestItem {
  workspaceId?: string
  responseStatus?: number
  responseTime?: number
  responseSize?: string
  responseBody?: string | Blob
  executedAt: number
}

export interface Workspace {
  id: string
  name: string
  description?: string
  color: string
  icon: string
  createdAt: number
  updatedAt: number
}

export interface Collection {
  id: string
  name: string
  description?: string
  color: string
  icon: string
  workspaceId?: string
  requests: RequestItem[]
  folders?: CollectionFolder[]
  createdAt: number
  updatedAt: number
}

export interface EnvironmentVariable {
  key: string
  value: string
  enabled: boolean
}

export interface Environment {
  id: string
  name: string
  color: string
  workspaceId?: string
  variables: EnvironmentVariable[]
  createdAt: number
  updatedAt: number
}

export interface VariableMapping {
  id: string
  name: string
  sourceRequestId: string
  sourcePath: string
  workspaceId?: string
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface Notification {
  id: string
  title: string
  body?: string
  type?: "info" | "success" | "warning" | "error"
  event?: string
  read: boolean
  createdAt: number
}

/**
 * Internal store shape — used by use-request-store only.
 * Not exported from the index to keep the API surface clean.
 */
export interface RequestStore {
  history: HistoryItem[]
  collections: Collection[]
  environments: Environment[]
  notifications: Notification[]
  variableMappings: VariableMapping[]
  systemNotificationPermission?: string
  activeEnvironmentId: string | null
  projects: import("@/types").SavedProject[]
  selectedProjectId: string | null
  currentRequest?: import("@/lib/ai-engine").CurrentRequest | null
  lastResponse?: import("@/lib/ai-engine").LastResponse | null
  environmentVariables?: Record<string, string>
  collectionHistory?: import("@/lib/ai-engine").CurrentRequest[]
  activeCollection?: string | null
  aiAutoApply?: boolean
  aiAudit?: Array<{ id: string; actionType: string; detail?: any; result?: any; timestamp: number }>
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  notificationPreferences?: Record<string, boolean>
}
