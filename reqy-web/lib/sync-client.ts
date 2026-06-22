/**
 * Browser-side client for the sync API routes.
 */

import type { SyncPayload } from "./sync-types"

const API_BASE = "/api/sync"

export interface PullResult {
  items: {
    id: string
    itemType: string
    itemId: string
    workspaceId?: string
    payload: SyncPayload
    updatedAt: number
    deleted: boolean
  }[]
  total: number
}

export interface PushResult {
  success: boolean
  pushed: number
  syncedAt: number
}

export interface ResolveResult {
  success: boolean
  resolution: "local" | "remote" | "merged"
  itemId: string
  itemType: string
}

export class SyncClient {
  private async fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(url, {
      credentials: "include",
      headers: { "content-type": "application/json" },
      ...options,
    })

    if (res.status === 401) {
      throw new AuthError("Unauthorized")
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Unknown error" }))
      throw new ApiError(body.error || `HTTP ${res.status}`, res.status)
    }

    return res.json()
  }

  async pull(since?: number, workspaceId?: string): Promise<PullResult> {
    const params = new URLSearchParams()
    if (since) params.set("since", String(since))
    if (workspaceId) params.set("workspaceId", workspaceId)
    const url = `${API_BASE}/pull?${params.toString()}`
    return this.fetchJson<PullResult>(url)
  }

  async push(items: SyncPayload[], deviceId: string): Promise<PushResult> {
    return this.fetchJson<PushResult>(`${API_BASE}/push`, {
      method: "POST",
      body: JSON.stringify({ items, deviceId }),
    })
  }

  async resolve(
    itemId: string,
    itemType: string,
    resolution: "local" | "remote" | "merged",
    deviceId: string,
    mergedData?: unknown
  ): Promise<ResolveResult> {
    return this.fetchJson<ResolveResult>(`${API_BASE}/resolve`, {
      method: "POST",
      body: JSON.stringify({ itemId, itemType, resolution, deviceId, mergedData }),
    })
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AuthError"
  }
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
    this.name = "ApiError"
  }
}

export const syncClient = new SyncClient()
