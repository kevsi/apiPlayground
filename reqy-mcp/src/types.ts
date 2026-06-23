export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "HEAD"
  | "OPTIONS"
  | "GRAPHQL"

export interface QueryParam {
  key: string
  value: string
}

export interface RequestItem {
  id: string
  name: string
  method: HttpMethod
  url: string
  endpoint: string
  headers?: Record<string, string>
  body?: string
  bodyType?: "json" | "form-data" | "x-www-form" | "raw" | "binary"
  authType?: "none" | "bearer" | "basic" | "api-key" | "oauth2"
  authToken?: string
  queryParams?: QueryParam[]
  folderId?: string | null
  createdAt: number
  updatedAt: number
}

export interface CollectionFolder {
  id: string
  name: string
  parentId: string | null
  collectionId: string
  order: number
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
  id?: string
  name: string
  color?: string
  variables: EnvironmentVariable[]
  createdAt?: number
  updatedAt?: number
}

export interface ExportBundle {
  version?: string
  exportedAt?: string
  collections: Collection[]
  environments: Environment[]
}

export interface RunResult {
  name: string
  method: HttpMethod
  url: string
  status: number
  statusText: string
  durationMs: number
  size: number
  passed: boolean
  error?: string
  body?: string
}

export interface RunnerOptions {
  envName?: string
  timeoutMs: number
}
