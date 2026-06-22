/**
 * Offline queue for sync operations.
 * Stores pending changes in IndexedDB via the idb library.
 */

import { openDB, type IDBPDatabase } from "idb"
import type { SyncQueueItem, SyncPayload } from "./sync-types"

const DB_NAME = "reqly-sync-queue"
const DB_VERSION = 1
const STORE_NAME = "pending-items"

class OfflineQueue {
  private db: IDBPDatabase | null = null
  private initPromise: Promise<void> | null = null

  private async init(): Promise<void> {
    if (this.initPromise) return this.initPromise
    this.initPromise = this._init()
    return this.initPromise
  }

  private async _init(): Promise<void> {
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" })
        }
      },
    })
  }

  private getId(payload: SyncPayload): string {
    return `${payload.itemType}:${payload.itemId}`
  }

  async enqueue(payload: SyncPayload): Promise<void> {
    await this.init()
    if (!this.db) return
    const id = this.getId(payload)
    const tx = this.db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)

    const existing = await store.get(id)
    if (existing) {
      const item: SyncQueueItem = {
        ...existing,
        payload,
        attempts: existing.attempts,
        createdAt: Date.now(),
      }
      await store.put(item)
    } else {
      const item: SyncQueueItem = {
        id,
        payload,
        attempts: 0,
        createdAt: Date.now(),
      }
      await store.put(item)
    }
    await tx.done
  }

  async dequeue(id: string): Promise<void> {
    await this.init()
    if (!this.db) return
    await this.db.delete(STORE_NAME, id)
  }

  async dequeueAll(ids: string[]): Promise<void> {
    await this.init()
    if (!this.db) return
    const tx = this.db.transaction(STORE_NAME, "readwrite")
    await Promise.all(ids.map((id) => tx.store.delete(id)))
    await tx.done
  }

  async peek(): Promise<SyncQueueItem[]> {
    await this.init()
    if (!this.db) return []
    return this.db.getAll(STORE_NAME)
  }

  async incrementAttempts(id: string): Promise<void> {
    await this.init()
    if (!this.db) return
    const tx = this.db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    const item = (await store.get(id)) as SyncQueueItem | undefined
    if (item) {
      item.attempts = (item.attempts || 0) + 1
      await store.put(item)
    }
    await tx.done
  }

  async clear(): Promise<void> {
    await this.init()
    if (!this.db) return
    await this.db.clear(STORE_NAME)
  }

  async size(): Promise<number> {
    const items = await this.peek()
    return items.length
  }
}

export const offlineQueue = new OfflineQueue()
