"use client"

import { useEffect, useCallback, useRef } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { useWsStore } from "@/hooks/use-websocket-store"
import type { WsStatus } from "@/types/websocket"
import type { WsTauriMessageEvent, WsTauriStatusEvent, WsTauriErrorEvent } from "@/types/websocket"

/**
 * Detect if we're running inside a Tauri webview by checking for the IPC bridge.
 * Tauri v2 injects `window.__TAURI_INTERNALS__` (not just `__TAURI__`).
 * `__TAURI__` alone can be a false positive (browser extensions, dev tools, etc.).
 */
function canUseTauriInvoke(): boolean {
  if (typeof window === "undefined") return false
  const internals = (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__
  return typeof internals === "object" && internals !== null
}

// ─── Browser fallback: native WebSocket API ──────────────────────────────
function useBrowserFallback(connectionId: string | null) {
  const store = useWsStore()
  const wsRef = useRef<WebSocket | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!connectionId) return
    cleanupRef.current = () => {
      if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
    return () => cleanupRef.current?.()
  }, [connectionId])

  const connect = useCallback(
    async (url: string, _headers: Record<string, string>) => {
      const id = crypto.randomUUID()
      store.createConnection(id, url, {})

      // Browser WebSocket API ignores custom headers for non-browser WS
      store.setStatus(id, "connecting")

      const socket = new WebSocket(url)
      wsRef.current = socket

      socket.onopen = () => {
        store.setStatus(id, "connected")
        store.setConnectedAt(id)
      }

      socket.onmessage = (event) => {
        store.appendMessage(id, {
          id: crypto.randomUUID(),
          direction: "received",
          content: event.data as string,
          timestamp: Date.now(),
          byteSize: new Blob([event.data]).size,
        })
      }

      socket.onerror = () => {
        store.setStatus(id, "error", "WebSocket connection error")
        store.setDisconnectedAt(id)
      }

      socket.onclose = (event) => {
        if (event.code !== 1000) {
          store.setStatus(id, "disconnected", `Closed with code ${event.code}`)
        } else {
          store.setStatus(id, "disconnected")
        }
        store.setDisconnectedAt(id)
        if (wsRef.current === socket) wsRef.current = null
      }

      return id
    },
    [store],
  )

  const send = useCallback(
    async (message: string) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(message)
        const connection = Object.values(store.connections).find(
          (c) => connectionId && c.id === connectionId,
        )
        if (connection) {
          store.appendMessage(connectionId!, {
            id: crypto.randomUUID(),
            direction: "sent",
            content: message,
            timestamp: Date.now(),
            byteSize: new Blob([message]).size,
          })
        }
      }
    },
    [connectionId, store],
  )

  const disconnect = useCallback(async () => {
    if (connectionId) store.setStatus(connectionId, "disconnecting")
    if (wsRef.current) {
      wsRef.current.close(1000, "User disconnected")
      wsRef.current = null
    }
  }, [connectionId, store])

  return { connect, send, disconnect }
}

// ─── Tauri backend: Rust tokio-tungstenite ──────────────────────────────
function useTauriBackend(connectionId: string | null) {
  const store = useWsStore()
  const unlistenFnsRef = useRef<UnlistenFn[]>([])

  useEffect(() => {
    // Clear stale listeners from previous connectionId
    unlistenFnsRef.current.forEach((fn) => fn())
    unlistenFnsRef.current = []

    if (!connectionId || !canUseTauriInvoke()) return

    let cancelled = false

    const setup = async () => {
      const messageUnlisten = await listen<WsTauriMessageEvent>("ws://message", (event) => {
        if (event.payload.connection_id !== connectionId) return
        store.appendMessage(connectionId, {
          id: crypto.randomUUID(),
          direction: "received",
          content: event.payload.content,
          timestamp: event.payload.timestamp,
          byteSize: new Blob([event.payload.content]).size,
        })
      })
      const statusUnlisten = await listen<WsTauriStatusEvent>("ws://status", (event) => {
        if (event.payload.connection_id !== connectionId) return
        const status = event.payload.status.toLowerCase() as WsStatus
        store.setStatus(connectionId, status, event.payload.reason)
        if (status === "connected") {
          store.setConnectedAt(connectionId)
        }
        if (status === "disconnected" || status === "error") {
          store.setDisconnectedAt(connectionId)
        }
      })
      const errorUnlisten = await listen<WsTauriErrorEvent>("ws://error", (event) => {
        if (event.payload.connection_id !== connectionId) return
        store.setStatus(connectionId, "error", event.payload.message)
        store.setDisconnectedAt(connectionId)
      })
      if (!cancelled) {
        unlistenFnsRef.current = [messageUnlisten, statusUnlisten, errorUnlisten]
      } else {
        messageUnlisten()
        statusUnlisten()
        errorUnlisten()
      }
    }

    setup()

    return () => {
      cancelled = true
      unlistenFnsRef.current.forEach((fn) => fn())
      unlistenFnsRef.current = []
    }
  }, [connectionId, store])

  const connect = useCallback(
    async (url: string, headers: Record<string, string> = {}) => {
      if (!canUseTauriInvoke()) return null
      try {
        const id = await invoke<string>("ws_connect", { url, headers })
        store.createConnection(id, url, headers)
        store.setStatus(id, "connecting")
        return id
      } catch (e) {
        console.error("Tauri WebSocket connection failed:", e)
        throw e
      }
    },
    [store],
  )

  const send = useCallback(
    async (message: string) => {
      if (!connectionId || !canUseTauriInvoke()) return
      try {
        await invoke("ws_send", { connectionId, message })
        store.appendMessage(connectionId, {
          id: crypto.randomUUID(),
          direction: "sent",
          content: message,
          timestamp: Date.now(),
          byteSize: new Blob([message]).size,
        })
      } catch (e) {
        console.error("Tauri WebSocket send failed:", e)
        throw e
      }
    },
    [connectionId, store],
  )

  const disconnect = useCallback(async () => {
    if (!connectionId || !canUseTauriInvoke()) return
    try {
      store.setStatus(connectionId, "disconnecting")
      await invoke("ws_disconnect", { connectionId })
    } catch (e) {
      console.error("Tauri WebSocket disconnect failed:", e)
    }
  }, [connectionId, store])

  return { connect, send, disconnect }
}

// ─── Unified hook ────────────────────────────────────────────────────────
export function useWebSocket(connectionId: string | null) {
  const store = useWsStore()

  // Always call both hooks unconditionally to respect React's Rules of Hooks.
  // Each backend function checks internally whether it should activate.
  const tauriBackend = useTauriBackend(connectionId)
  const browserBackend = useBrowserFallback(connectionId)

  // Unified connect: try Tauri first, fall back to browser if not available
  const connect = useCallback(
    async (url: string, headers: Record<string, string> = {}) => {
      // Try Tauri backend if the IPC bridge is available
      if (canUseTauriInvoke()) {
        try {
          return await tauriBackend.connect(url, headers)
        } catch (e) {
          console.warn("Tauri connect failed, falling back to browser WebSocket:", e)
          // Fall through to browser fallback
        }
      }
      return browserBackend.connect(url, headers)
    },
    [tauriBackend, browserBackend],
  )

  const send = useCallback(
    async (message: string) => {
      if (canUseTauriInvoke()) {
        try {
          return await tauriBackend.send(message)
        } catch (e) {
          console.warn("Tauri send failed, falling back to browser WebSocket:", e)
        }
      }
      return browserBackend.send(message)
    },
    [tauriBackend, browserBackend],
  )

  const disconnect = useCallback(async () => {
    if (canUseTauriInvoke()) {
      try {
        return await tauriBackend.disconnect()
      } catch (e) {
        console.warn("Tauri disconnect failed, falling back to browser WebSocket:", e)
      }
    }
    return browserBackend.disconnect()
  }, [tauriBackend, browserBackend])

  const clearMessages = useCallback(() => {
    if (!connectionId) return
    store.clearMessages(connectionId)
  }, [connectionId, store])

  const connection = connectionId ? store.connections[connectionId] ?? null : null

  return {
    connection,
    connect,
    send,
    disconnect,
    clearMessages,
    store,
  }
}
