import { create } from "zustand"
import type { WsConnection, WsMessage, WsStatus } from "@/types/websocket"

interface WsStore {
  connections: Record<string, WsConnection>
  activeConnectionId: string | null

  createConnection: (id: string, url: string, headers: Record<string, string>) => void
  removeConnection: (id: string) => void
  setActiveConnection: (id: string | null) => void
  setStatus: (id: string, status: WsStatus, reason?: string) => void
  appendMessage: (id: string, message: WsMessage) => void
  clearMessages: (id: string) => void
  setHeaders: (id: string, headers: Record<string, string>) => void
  setConnectedAt: (id: string) => void
  setDisconnectedAt: (id: string) => void
}

export const useWsStore = create<WsStore>((set) => ({
  connections: {},
  activeConnectionId: null,

  createConnection: (id, url, headers) =>
    set((state) => ({
      connections: {
        ...state.connections,
        [id]: {
          id,
          url,
          status: "idle",
          headers,
          messages: [],
        },
      },
      activeConnectionId: id,
    })),

  removeConnection: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.connections
      return {
        connections: rest,
        activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId,
      }
    }),

  setActiveConnection: (id) => set({ activeConnectionId: id }),

  setStatus: (id, status, reason) =>
    set((state) => {
      const conn = state.connections[id]
      if (!conn) return state
      return {
        connections: {
          ...state.connections,
          [id]: { ...conn, status, errorReason: reason ?? conn.errorReason },
        },
      }
    }),

  appendMessage: (id, message) =>
    set((state) => {
      const conn = state.connections[id]
      if (!conn) return state
      return {
        connections: {
          ...state.connections,
          [id]: { ...conn, messages: [...conn.messages, message] },
        },
      }
    }),

  clearMessages: (id) =>
    set((state) => {
      const conn = state.connections[id]
      if (!conn) return state
      return {
        connections: {
          ...state.connections,
          [id]: { ...conn, messages: [] },
        },
      }
    }),

  setHeaders: (id, headers) =>
    set((state) => {
      const conn = state.connections[id]
      if (!conn) return state
      return {
        connections: {
          ...state.connections,
          [id]: { ...conn, headers },
        },
      }
    }),

  setConnectedAt: (id) =>
    set((state) => {
      const conn = state.connections[id]
      if (!conn) return state
      return {
        connections: {
          ...state.connections,
          [id]: { ...conn, connectedAt: Date.now() },
        },
      }
    }),

  setDisconnectedAt: (id) =>
    set((state) => {
      const conn = state.connections[id]
      if (!conn) return state
      return {
        connections: {
          ...state.connections,
          [id]: { ...conn, disconnectedAt: Date.now() },
        },
      }
    }),
}))
