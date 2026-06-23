"use client"

import { useState, useRef, useCallback, useEffect } from "react"

export interface WsMessage {
  id: string
  direction: "incoming" | "outgoing"
  data: string
  timestamp: number
}

export type WsStatus = "idle" | "connecting" | "open" | "closed" | "error"

export function useWebSocket() {
  const [messages, setMessages] = useState<WsMessage[]>([])
  const [status, setStatus] = useState<WsStatus>("idle")
  const socketRef = useRef<WebSocket | null>(null)

  const connect = useCallback((url: string) => {
    if (socketRef.current) {
      socketRef.current.close()
    }

    setStatus("connecting")

    const socket = new WebSocket(url)
    socketRef.current = socket

    socket.onopen = () => {
      setStatus("open")
    }

    socket.onerror = () => {
      setStatus("error")
    }

    socket.onclose = () => {
      setStatus("closed")
      socketRef.current = null
    }

    socket.onmessage = (event) => {
      const message: WsMessage = {
        id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        direction: "incoming",
        data: event.data,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, message])
    }
  }, [])

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close()
      socketRef.current = null
      setStatus("closed")
    }
  }, [])

  const send = useCallback((data: string) => {
    if (socketRef.current && status === "open") {
      socketRef.current.send(data)
      const message: WsMessage = {
        id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        direction: "outgoing",
        data,
        timestamp: Date.now(),
      }
      setMessages((prev) => [...prev, message])
    }
  }, [status])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close()
        socketRef.current = null
      }
    }
  }, [])

  return { status, messages, connect, disconnect, send, clearMessages }
}