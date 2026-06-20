/**
 * Mock Config Validation Schema
 * 
 * Validates mock route configuration and server settings.
 */

import { z } from 'zod'
import { HttpMethodSchema } from './proxy'

export const MockResponseSchema = z.object({
  statusCode: z.number().int().min(100).max(599).default(200),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.string().optional(),
  delay: z.number().int().min(0).max(30000).optional().default(0),
})

export const MockRouteSchema = z.object({
  id: z.string().min(1, 'Route ID is required'),
  name: z.string().min(1, 'Route name is required'),
  pathPattern: z.string().min(1, 'Path pattern is required'),
  method: HttpMethodSchema,
  responseStatus: z.number().int().min(100).max(599).default(200),
  responseHeaders: z.record(z.string(), z.string()).default({}),
  responseBody: z.string().default(''),
  contentType: z.string().default('application/json'),
  enabled: z.boolean().default(true),
  workspaceId: z.string().optional(),
  serverId: z.string().optional(),
  serverEnabled: z.boolean().optional().default(true),
  matchType: z.enum(['exact', 'regex', 'prefix']).optional().default('exact'),
  delay: z.number().int().min(0).max(30000).default(0),
  description: z.string().optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
  rateLimit: z.object({
    enabled: z.boolean(),
    maxRequests: z.number().int().min(0),
    windowSeconds: z.number().int().min(0),
  }).optional(),
  variants: z.array(z.object({
    id: z.string(),
    name: z.string(),
    weight: z.number().int().min(0),
    responseStatus: z.number().int().min(100).max(599),
    responseHeaders: z.record(z.string(), z.string()),
    responseBody: z.string(),
    contentType: z.string(),
    delay: z.number().int().min(0),
  })).optional(),
  matchQueryParams: z.record(z.string(), z.string()).optional(),
  matchHeaders: z.record(z.string(), z.string()).optional(),
}).strict()

export const MockServerSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Server name is required'),
  enabled: z.boolean().optional().default(true),
  workspaceId: z.string().optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
}).strict()

export const MockConfigPayloadSchema = z.object({
  routes: z.array(MockRouteSchema).optional(),
  servers: z.array(MockServerSchema).optional(),
  globalEnabled: z.boolean().optional(),
  workspaceOverrides: z.record(z.string(), z.boolean()).optional(),
  workspaceId: z.string().optional(),
}).strict()

export type MockResponse = z.infer<typeof MockResponseSchema>
export type MockRoute = z.infer<typeof MockRouteSchema>
export type MockServer = z.infer<typeof MockServerSchema>
export type MockConfigPayload = z.infer<typeof MockConfigPayloadSchema>

/**
 * Safe mock config validator
 */
export function validateMockConfigPayload(payload: unknown): MockConfigPayload | null {
  try {
    return MockConfigPayloadSchema.parse(payload)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
      console.error(`[MockConfig validation] ${issues}`)
    }
    return null
  }
}

export function validateMockConfigPayloadThrow(payload: unknown): MockConfigPayload {
  try {
    return MockConfigPayloadSchema.parse(payload)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
      throw new Error(`Invalid mock config: ${issues}`, { cause: error })
    }
    throw error
  }
}

export function validateMockRoute(route: unknown): MockRoute | null {
  try {
    return MockRouteSchema.parse(route)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ')
      console.error(`[MockRoute validation] ${issues}`)
    }
    return null
  }
}
