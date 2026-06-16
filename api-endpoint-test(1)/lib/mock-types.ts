/**
 * Shared mock route types — single source of truth.
 * Keep in sync with src-tauri/src/mock_types.rs (serde camelCase mirrors this).
 */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

export interface MockRouteRateLimit {
  enabled: boolean
  maxRequests: number
  windowSeconds: number
}

export interface MockRouteVariant {
  id: string
  name: string
  weight: number
  responseStatus: number
  responseHeaders: Record<string, string>
  responseBody: string
  contentType: string
  delay: number
}

export interface MockRoute {
  id: string
  name: string
  method: HttpMethod
  pathPattern: string
  responseStatus: number
  responseHeaders: Record<string, string>
  responseBody: string
  contentType: string
  delay: number
  enabled: boolean
  workspaceId?: string
  collectionId?: string
  collectionName?: string
  rateLimit?: MockRouteRateLimit
  variants?: MockRouteVariant[]
  matchQueryParams?: Record<string, string>
  matchHeaders?: Record<string, string>
  createdAt: number
  updatedAt: number
}
