import { z } from "zod"
import type { SyncItemType } from "./sync-types"

export const SyncItemTypeEnum = z.enum([
  "collection",
  "environment",
  "history",
  "variableMapping",
  "project",
  "workspace",
  "mockRoute",
  "mockServer",
])

export const SyncPayloadSchema = z.object({
  itemType: SyncItemTypeEnum,
  itemId: z.string().min(1),
  workspaceId: z.string().optional(),
  data: z.unknown(),
  updatedAt: z.number().positive(),
  deleted: z.boolean().optional().default(false),
})

export const SyncPushBodySchema = z.object({
  items: z.array(SyncPayloadSchema).min(1).max(500),
  deviceId: z.string().min(1),
})

export const SyncPullQuerySchema = z.object({
  since: z.coerce.number().optional(),
  workspaceId: z.string().optional(),
})

export const SyncResolveBodySchema = z.object({
  itemId: z.string().min(1),
  itemType: SyncItemTypeEnum,
  resolution: z.enum(["local", "remote", "merged"]),
  mergedData: z.unknown().optional(),
  deviceId: z.string().min(1),
})

// ── Collection request sub-schema (lightweight validation for merge) ──

export const RequestItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
  url: z.string(),
  endpoint: z.string(),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  bodyType: z.enum(["json", "form-data", "x-www-form", "raw", "binary"]).optional(),
  authType: z.enum(["none", "bearer", "basic", "api-key", "oauth2"]).optional(),
  authToken: z.string().optional(),
  queryParams: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  folderId: z.string().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const CollectionFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  collectionId: z.string(),
  order: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const CollectionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  color: z.string(),
  icon: z.string(),
  workspaceId: z.string().optional(),
  requests: z.array(RequestItemSchema),
  folders: z.array(CollectionFolderSchema).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const EnvironmentVariableSchema = z.object({
  key: z.string(),
  value: z.string(),
  enabled: z.boolean(),
})

export const EnvironmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  workspaceId: z.string().optional(),
  variables: z.array(EnvironmentVariableSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const HistoryItemSchema = RequestItemSchema.extend({
  workspaceId: z.string().optional(),
  responseStatus: z.number().optional(),
  responseTime: z.number().optional(),
  responseSize: z.string().optional(),
  responseBody: z.string().optional(),
  executedAt: z.number(),
})

export const VariableMappingSchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceRequestId: z.string(),
  sourcePath: z.string(),
  workspaceId: z.string().optional(),
  enabled: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const WorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  color: z.string(),
  icon: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const SavedProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  framework: z.string(),
  language: z.string().optional(),
  folderPath: z.string(),
  port: z.number().optional(),
  routes: z.array(z.unknown()),
  analyzedAt: z.string(),
  mode: z.enum(["static", "ai"]),
  workspaceId: z.string().optional(),
})

export const MockRouteSchema = z.object({
  id: z.string(),
  name: z.string(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
  pathPattern: z.string(),
  responseStatus: z.number(),
  responseHeaders: z.record(z.string()),
  responseBody: z.string(),
  contentType: z.string(),
  delay: z.number(),
  enabled: z.boolean(),
  serverId: z.string().optional(),
  workspaceId: z.string().optional(),
  collectionId: z.string().optional(),
  collectionName: z.string().optional(),
  group: z.string().optional(),
  rateLimit: z.object({ enabled: z.boolean(), maxRequests: z.number(), windowSeconds: z.number() }).optional(),
  variants: z.array(z.object({ id: z.string(), name: z.string(), weight: z.number(), responseStatus: z.number(), responseHeaders: z.record(z.string()), responseBody: z.string(), contentType: z.string(), delay: z.number() })).optional(),
  matchQueryParams: z.record(z.string()).optional(),
  matchHeaders: z.record(z.string()).optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
})

export const MockServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseUrl: z.string(),
  localPrefix: z.string(),
  enabled: z.boolean(),
  createdAt: z.number(),
})

export const PayloadByType: Record<SyncItemType, z.ZodTypeAny> = {
  collection: CollectionSchema,
  environment: EnvironmentSchema,
  history: HistoryItemSchema,
  variableMapping: VariableMappingSchema,
  project: SavedProjectSchema,
  workspace: WorkspaceSchema,
  mockRoute: MockRouteSchema,
  mockServer: MockServerSchema,
}
