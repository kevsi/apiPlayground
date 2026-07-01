export type WsDirection = "sent" | "received"

export type WsStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnecting"
  | "disconnected"
  | "error"

export interface WsMessage {
  id: string
  direction: WsDirection
  content: string
  timestamp: number
  byteSize: number
}

export interface WsConnection {
  id: string
  url: string
  status: WsStatus
  headers: Record<string, string>
  messages: WsMessage[]
  connectedAt?: number
  disconnectedAt?: number
  errorReason?: string
}

export interface WsTauriMessageEvent {
  connection_id: string
  direction: string
  content: string
  timestamp: number
}

export interface WsTauriStatusEvent {
  connection_id: string
  status: string
  reason?: string
}

export interface WsTauriErrorEvent {
  connection_id: string
  message: string
}
