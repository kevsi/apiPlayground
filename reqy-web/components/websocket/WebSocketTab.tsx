"use client"

import { useState, useCallback } from "react"
import { useWebSocket } from "@/hooks/use-websocket"
import { useWsStore } from "@/hooks/use-websocket-store"
import { ConnectionBar } from "./ConnectionBar"
import { WsHeadersPanel } from "./WsHeadersPanel"
import { MessageLog } from "./MessageLog"
import { MessageComposer } from "./MessageComposer"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { AlertCircle, RefreshCw } from "lucide-react"

export function WebSocketTab() {
  const store = useWsStore()
  const activeId = store.activeConnectionId
  const { connection, connect, send, disconnect, clearMessages } = useWebSocket(activeId)

  const [url, setUrl] = useState("wss://echo.websocket.org")
  const [headers, setHeaders] = useState<Record<string, string>>({})
  const [messageFilter, setMessageFilter] = useState<"all" | "sent" | "received">("all")
  const [configTab, setConfigTab] = useState("headers")
  const [dismissedError, setDismissedError] = useState(false)

  const handleConnect = useCallback(async () => {
    setDismissedError(false)
    try {
      await connect(url, headers)
    } catch (e) {
      console.warn("WebSocket connect failed:", e)
    }
  }, [url, headers, connect])

  const handleReconnect = useCallback(async () => {
    if (activeId) {
      await disconnect()
    }
    setDismissedError(false)
    try {
      await connect(url, headers)
    } catch (e) {
      console.warn("WebSocket reconnect failed:", e)
    }
  }, [url, headers, connect, disconnect, activeId])

  const handleSend = useCallback(
    (content: string) => {
      send(content).catch((e) => console.warn("WebSocket send failed:", e))
    },
    [send]
  )

  const handleSave = useCallback(() => {
    // TODO: Save connection config to Supabase (requests table, type='websocket')
    // This will be wired when the persistence layer is ready
  }, [])

  const status = connection?.status ?? "idle"
  const messages = connection?.messages ?? []
  const connectedAt = connection?.connectedAt

  return (
    <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
      <ConnectionBar
        url={url}
        status={status}
        connectedAt={connectedAt}
        onUrlChange={setUrl}
        onConnect={handleConnect}
        onDisconnect={disconnect}
        onSave={handleSave}
      />

      {/* Error banner — shown on unexpected connection loss */}
      {status === "error" && connection?.errorReason && !dismissedError && (
        <div className="mx-3 mt-1 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 shrink-0">
          <AlertCircle className="size-3.5 text-red-500 shrink-0" />
          <span className="flex-1 text-xs text-red-600">
            Connection lost — {connection.errorReason}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReconnect}
            className="min-h-9 gap-1 px-2 text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-500/10"
          >
            <RefreshCw className="size-3" />
            Reconnect
          </Button>
          <button
            onClick={() => setDismissedError(true)}
            aria-label="Dismiss error"
            className="text-xs text-muted-foreground/40 hover:text-foreground ml-1"
          >
            ×
          </button>
        </div>
      )}

      <Tabs value={configTab} onValueChange={setConfigTab} className="shrink-0">
        <TabsList className="mx-4 h-7 w-auto self-start rounded-lg border border-border/40 bg-muted/30 p-0.5">
          <TabsTrigger value="headers" className="h-6 px-3 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-xs">
            Headers
          </TabsTrigger>
          <TabsTrigger value="auth" className="h-6 px-3 text-xs font-medium data-[state=active]:bg-background data-[state=active]:shadow-xs">
            Auth
          </TabsTrigger>
        </TabsList>
        <TabsContent value="headers" className="m-0">
          <WsHeadersPanel headers={headers} onChange={setHeaders} disabled={status === "connected"} />
        </TabsContent>
        <TabsContent value="auth" className="m-0">
          <div className="border-b border-border/60 px-4 py-6 text-center text-xs text-muted-foreground/50">
            Auth for WebSocket connections will be available in a future update.
          </div>
        </TabsContent>
      </Tabs>

      <MessageLog
        messages={messages}
        filter={messageFilter}
        onFilterChange={setMessageFilter}
        onClear={clearMessages}
      />

      <MessageComposer disabled={status !== "connected"} onSend={handleSend} />
    </div>
  )
}
