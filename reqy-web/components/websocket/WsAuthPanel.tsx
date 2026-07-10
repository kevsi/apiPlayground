"use client";

import { Input } from "@/components/ui/input";
import { Info, Key, Link } from "lucide-react";
import { isTauriAvailable } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { WsAuthConfig, WsAuthType } from "@/types/websocket";

interface WsAuthPanelProps {
  authConfig: WsAuthConfig;
  onChange: (config: WsAuthConfig) => void;
  disabled: boolean;
}

const MODES: { value: WsAuthType; label: string; description: string }[] = [
  { value: "none", label: "None", description: "No authentication" },
  { value: "bearer", label: "Bearer Token", description: "Authorization header (desktop only)" },
  { value: "query", label: "Query Param", description: "Token in URL parameter" },
];

export function WsAuthPanel({ authConfig, onChange, disabled }: WsAuthPanelProps) {
  return (
    <div className="border-b border-border/60 px-4 py-3">
      {/* Mode selector */}
      <div className="flex items-center gap-1.5 mb-3">
        {MODES.map((mode) => (
          <button
            key={mode.value}
            onClick={() => !disabled && onChange({ ...authConfig, type: mode.value })}
            disabled={disabled}
            className={cn(
              "flex-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150",
              authConfig.type === mode.value
                ? "bg-primary/10 text-primary shadow-xs border border-primary/20"
                : "text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 border border-transparent",
              disabled && "opacity-50 cursor-not-allowed",
            )}
          >
            <div className="text-xs font-semibold">{mode.label}</div>
            <div className="text-[10px] opacity-60 mt-0.5">{mode.description}</div>
          </button>
        ))}
      </div>

      {/* Bearer-specific info */}
      {authConfig.type === "bearer" && !isTauriAvailable() && (
        <div className="flex items-start gap-2 mb-2 rounded-md bg-amber-500/5 border border-amber-500/10 px-2 py-1.5">
          <Info className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-700 leading-tight">
            Bearer auth requires the Tauri desktop app. In web mode, use Query Param instead.
          </p>
        </div>
      )}

      {/* Query-specific info */}
      {authConfig.type === "query" && !isTauriAvailable() && (
        <div className="flex items-start gap-2 mb-2 rounded-md bg-blue-500/5 border border-blue-500/10 px-2 py-1.5">
          <Info className="size-3.5 text-blue-600 shrink-0 mt-0.5" />
          <p className="text-[10px] text-blue-700 leading-tight">
            Query param auth works in both desktop and web mode.
          </p>
        </div>
      )}

      {/* Token input */}
      {(authConfig.type === "bearer" || authConfig.type === "query") && (
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Key className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/40 pointer-events-none" />
            <Input
              type="password"
              value={authConfig.token}
              onChange={(e) => onChange({ ...authConfig, token: e.target.value })}
              placeholder={authConfig.type === "bearer" ? "Bearer token..." : "Token value..."}
              disabled={disabled}
              className="h-8 pl-8 text-xs font-mono"
            />
          </div>

          {/* Query param name — only for query mode */}
          {authConfig.type === "query" && (
            <div className="relative">
              <Link className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/40 pointer-events-none" />
              <Input
                value={authConfig.queryName}
                onChange={(e) => onChange({ ...authConfig, queryName: e.target.value })}
                placeholder="Query parameter name (default: token)"
                disabled={disabled}
                className="h-8 pl-8 text-xs font-mono"
              />
            </div>
          )}
        </div>
      )}

      {/* None: show info */}
      {authConfig.type === "none" && (
        <p className="text-xs text-muted-foreground/40 italic text-center py-2">
          No authentication will be sent with the WebSocket connection.
        </p>
      )}
    </div>
  );
}
