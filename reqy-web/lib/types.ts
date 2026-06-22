export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS"

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
  bodyType?: "json" | "form-data" | "x-www-form" | "raw" | "binary"
  authType?: "none" | "bearer" | "basic" | "api-key" | "oauth2"
  authToken?: string
  queryParams?: Array<{ key: string; value: string }>
  folderId?: string | null
  assertions?: RequestTestAssertion[]
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

export type AssertionType = "status" | "bodyContains" | "headerExists" | "jsonPath"

export interface RequestTestAssertion {
  id: string
  type: AssertionType
  target: string
  expected?: string
  enabled: boolean
}

export interface TestResult {
  assertionId: string
  type: AssertionType
  target: string
  expected?: string
  passed: boolean
  message: string
}

export type AIProvider = "anthropic" | "openai" | "openrouter" | "gemini" | "deepseek" | "ollama"
export type AnalysisMode = "static" | "ai"

export interface SavedProject {
  id: string
  name: string
  framework: string
  language?: string
  folderPath: string
  port?: number
  routes: import("@/lib/detect-shared").DetectedRoute[]
  analyzedAt: string
  mode: AnalysisMode
  workspaceId?: string
}

export interface GithubConfig {
  token?: string
}

export interface OllamaConfig {
  host?: string
  port?: number
  model?: string
}
