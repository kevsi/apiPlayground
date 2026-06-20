"use client"

import { useState, useEffect } from "react"

export type SyncState = "synced" | "syncing" | "error"

let currentState: SyncState = "synced"
let retryHandler: (() => void) | null = null
const stateListeners = new Set<() => void>()

export function setSyncState(state: SyncState) {
  if (currentState === state) return
  currentState = state
  stateListeners.forEach((fn) => fn())
}

export function getSyncState(): SyncState {
  return currentState
}

export function setRetryHandler(handler: (() => void) | null) {
  retryHandler = handler
}

export interface SyncStateResult {
  state: SyncState
  retry: () => void
}

export function useSyncState(): SyncStateResult {
  const [state, setState] = useState<SyncState>(currentState)

  useEffect(() => {
    const listener = () => setState(currentState)
    stateListeners.add(listener)
    return () => {
      stateListeners.delete(listener)
    }
  }, [])

  return {
    state,
    retry: () => retryHandler?.(),
  }
}
