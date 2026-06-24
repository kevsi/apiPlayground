"use client"
import { useEffect, useRef } from "react"
import { useSyncState } from "@/hooks/store/sync-state"

export interface WsChangeMessage {
  type: "change"
  workspaceId: string
  timestamp: number
  changes?: unknown[]
}

const RECONNECT_DELAY_MS = 5_000
const RECONNECT_DELAY_ERROR_MS = 10_000

/**
 * Opens a WebSocket to the sync server for the current workspace.
 * On a "change" message, invokes `onChange` so the consumer can re-poll
 * and apply the diff. Auto-reconnects on close/error.
 *
 * Polling in `use-sync-engine.ts` remains as a fallback.
 */
export function useSyncSocket(onChange: (msg: WsChangeMessage) => void): void {
  const serverUrl = useSyncState((s) => s.serverUrl)
  const workspaceId = useSyncState((s) => s.workspaceId)
  const enabled = useSyncState((s) => s.enabled)
  const setSyncError = useSyncState((s) => s.setSyncError)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Keep latest onChange without retriggering the connect effect.
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!enabled || !workspaceId || !serverUrl) {
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current)
        reconnectRef.current = null
      }
      return
    }

    let cancelled = false

    const connect = () => {
      if (cancelled) return
      try {
        const wsBase = serverUrl.replace(/^http/, "ws")
        const wsUrl = `${wsBase}/api/sync/ws?workspaceId=${encodeURIComponent(workspaceId)}`
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          setSyncError(null)
        }

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data) as WsChangeMessage
            if (msg.type === "change") {
              onChangeRef.current(msg)
            }
          } catch {
            // ignore malformed messages
          }
        }

        ws.onerror = () => {
          setSyncError("WebSocket error")
        }

        ws.onclose = () => {
          wsRef.current = null
          if (cancelled) return
          // Auto-reconnect if still enabled and still in the same workspace
          const current = useSyncState.getState()
          if (current.enabled && current.workspaceId === workspaceId) {
            reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
          }
        }
      } catch (err) {
        setSyncError(err instanceof Error ? err.message : "WS connection failed")
        if (!cancelled) {
          reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_ERROR_MS)
        }
      }
    }

    connect()

    return () => {
      cancelled = true
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current)
        reconnectRef.current = null
      }
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [enabled, workspaceId, serverUrl, setSyncError])
}
