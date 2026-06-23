"use client"

import { useState, useRef, useCallback, useEffect } from "react"

export interface SSEEvent {
  id: string
  event: string
  data: string
  timestamp: number
}

export type SSEStatus = "idle" | "connecting" | "open" | "closed" | "error"

export function useSSE() {
  const [events, setEvents] = useState<SSEEvent[]>([])
  const [status, setStatus] = useState<SSEStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const sourceRef = useRef<EventSource | null>(null)

  const connect = useCallback((url: string) => {
    if (sourceRef.current) {
      sourceRef.current.close()
    }

    setStatus("connecting")
    setError(null)

    const source = new EventSource(url)
    sourceRef.current = source

    source.onopen = () => {
      setStatus("open")
    }

    source.onerror = () => {
      setStatus("error")
      setError("Connection error")
    }

    source.onmessage = (e) => {
      setEvents((prev) => [
        ...prev,
        {
          id: `sse-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          event: "message",
          data: e.data,
          timestamp: Date.now(),
        },
      ])
    }

    // Custom event listeners can be added via source.addEventListener('foo', handler)
  }, [])

  const disconnect = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close()
      sourceRef.current = null
      setStatus("closed")
    }
  }, [])

  const clearEvents = useCallback(() => {
    setEvents([])
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sourceRef.current) {
        sourceRef.current.close()
        sourceRef.current = null
      }
    }
  }, [])

  return { status, events, error, connect, disconnect, clearEvents }
}