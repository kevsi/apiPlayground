"use client";

import { useState, useCallback, useEffect } from "react";
import { useWebSocket } from "@/hooks/use-websocket";
import { useWsStore } from "@/hooks/use-websocket-store";
import { buildAuthHeaders, applyAuthToUrl } from "@/lib/ws-auth";
import { ConnectionBar } from "./ConnectionBar";
import { WsHeadersPanel } from "./WsHeadersPanel";
import { WsAuthPanel } from "./WsAuthPanel";
import { MessageLog } from "./MessageLog";
import { MessageComposer } from "./MessageComposer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";
import type { WsAuthConfig } from "@/types/websocket";

const DEFAULT_AUTH: WsAuthConfig = { type: "none", token: "", queryName: "token" };
const STORAGE_KEY = "reqy:websocket-config";

interface SavedWsConfig {
  url: string;
  headers: Record<string, string>;
  auth: WsAuthConfig;
}

function loadSavedConfig(): Partial<SavedWsConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<SavedWsConfig>;
  } catch {
    return {};
  }
}

function saveConfig(url: string, headers: Record<string, string>, auth: WsAuthConfig) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ url, headers, auth } satisfies SavedWsConfig),
    );
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

export function WebSocketTab() {
  const saved = loadSavedConfig();
  const store = useWsStore();
  const activeId = store.activeConnectionId;
  const { connection, connect, send, disconnect, clearMessages } = useWebSocket(activeId);

  const [url, setUrl] = useState(saved.url ?? "wss://echo.websocket.org");
  const [headers, setHeaders] = useState<Record<string, string>>(saved.headers ?? {});
  const [authConfig, setAuthConfig] = useState<WsAuthConfig>(saved.auth ?? DEFAULT_AUTH);
  const [messageFilter, setMessageFilter] = useState<"all" | "sent" | "received">("all");
  const [configTab, setConfigTab] = useState("headers");
  const [dismissedError, setDismissedError] = useState(false);

  // Pre-fill authConfig on the store when the active connection uses it
  useEffect(() => {
    if (activeId && connection?.authConfig) {
      const conn = store.connections[activeId];
      if (conn && conn.authConfig) {
        setAuthConfig(conn.authConfig);
      }
    }
  }, [activeId, connection, store.connections]);

  const handleConnect = useCallback(async () => {
    setDismissedError(false);
    // Apply auth transformations before connecting
    const finalUrl = applyAuthToUrl(url, authConfig);
    const authHeaders = buildAuthHeaders(authConfig);
    const finalHeaders = { ...headers, ...authHeaders };
    try {
      const id = await connect(finalUrl, finalHeaders);
      if (id) {
        // Store authConfig on the connection for future reference
        store.setAuthConfig(id, authConfig);
      }
    } catch (e) {
      console.warn("WebSocket connect failed:", e);
    }
  }, [url, headers, authConfig, connect, store]);

  const handleReconnect = useCallback(async () => {
    if (activeId) {
      await disconnect();
    }
    setDismissedError(false);
    const finalUrl = applyAuthToUrl(url, authConfig);
    const authHeaders = buildAuthHeaders(authConfig);
    const finalHeaders = { ...headers, ...authHeaders };
    try {
      const id = await connect(finalUrl, finalHeaders);
      if (id) {
        store.setAuthConfig(id, authConfig);
      }
    } catch (e) {
      console.warn("WebSocket reconnect failed:", e);
    }
  }, [url, headers, authConfig, connect, disconnect, activeId, store]);

  const handleSend = useCallback(
    (content: string) => {
      send(content).catch((e) => console.warn("WebSocket send failed:", e));
    },
    [send],
  );

  const handleSave = useCallback(() => {
    saveConfig(url, headers, authConfig);
  }, [url, headers, authConfig]);

  const status = connection?.status ?? "idle";
  const messages = connection?.messages ?? [];
  const connectedAt = connection?.connectedAt;
  const isConnected = status === "connected";

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
          <span className="flex-1 text-sm text-red-600">
            Connection lost — {connection.errorReason}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReconnect}
            className="min-h-9 gap-1 px-2 text-sm font-medium text-red-500 hover:text-red-600 hover:bg-red-500/10"
          >
            <RefreshCw className="size-3" />
            Reconnect
          </Button>
          <button
            onClick={() => setDismissedError(true)}
            aria-label="Dismiss error"
            className="text-sm text-muted-foreground/40 hover:text-foreground ml-1"
          >
            ×
          </button>
        </div>
      )}

      <Tabs value={configTab} onValueChange={setConfigTab} className="shrink-0">
        <TabsList className="mx-4 h-7 w-auto self-start rounded-lg border border-border/40 bg-muted/30 p-0.5">
          <TabsTrigger
            value="headers"
            className="h-6 px-3 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-xs"
          >
            Headers
          </TabsTrigger>
          <TabsTrigger
            value="auth"
            className="h-6 px-3 text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-xs"
          >
            Auth
          </TabsTrigger>
        </TabsList>
        <TabsContent value="headers" className="m-0">
          <WsHeadersPanel headers={headers} onChange={setHeaders} disabled={isConnected} />
        </TabsContent>
        <TabsContent value="auth" className="m-0">
          <WsAuthPanel authConfig={authConfig} onChange={setAuthConfig} disabled={isConnected} />
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
  );
}
