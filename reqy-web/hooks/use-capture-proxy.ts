"use client"

import { useState, useEffect, useCallback } from "react"
import { invoke } from "@tauri-apps/api/core"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"

export interface CapturedRequest {
  id: string
  method: string
  url: string
  headers: [string, string][]
  body: string | null
  timestamp: number
  status: number | null
  responseHeaders: [string, string][] | null
  responseBody: string | null
  durationMs: number | null
  error: string | null
}

export function useCaptureProxy() {
  const [isRunning, setIsRunning] = useState(false)
  const [port, setPort] = useState(8899)
  const [capturedRequests, setCapturedRequests] = useState<CapturedRequest[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let unlistenCaptured: UnlistenFn | null = null
    let unlistenUpdated: UnlistenFn | null = null

    const setupListeners = async () => {
      unlistenCaptured = await listen<CapturedRequest>("captured-request", (event) => {
        setCapturedRequests((prev) => {
          // Prevent duplicates
          if (prev.some((r) => r.id === event.payload.id)) return prev
          return [...prev, event.payload]
        })
      })

      unlistenUpdated = await listen<CapturedRequest>("captured-request-updated", (event) => {
        setCapturedRequests((prev) =>
          prev.map((r) => (r.id === event.payload.id ? event.payload : r))
        )
      })
    }

    setupListeners()

    return () => {
      unlistenCaptured?.()
      unlistenUpdated?.()
    }
  }, [])

  const start = useCallback(async (p: number) => {
    setError(null)
    try {
      await invoke("start_capture_proxy", { port: p })
      setPort(p)
      setIsRunning(true)
    } catch (e) {
      setError(String(e))
      throw e
    }
  }, [])

  const stop = useCallback(async () => {
    setError(null)
    try {
      await invoke("stop_capture_proxy")
      setIsRunning(false)
    } catch (e) {
      setError(String(e))
      throw e
    }
  }, [])

  const clear = useCallback(() => {
    setCapturedRequests([])
    setError(null)
  }, [])

  return {
    isRunning,
    port,
    capturedRequests,
    error,
    start,
    stop,
    clear,
  }
}