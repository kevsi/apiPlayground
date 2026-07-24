"use client";

import { useState, useCallback, useRef } from "react";
import { useSSE, type SSEAuthType, type SSEEvent } from "@/hooks/use-sse";
import { KeyValueEditor, type KeyValuePair } from "@/components/key-value-editor";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wifi,
  WifiOff,
  Loader2,
  Trash2,
  Activity,
  Radio,
  ChevronDown,
  ChevronRight,
  HeadersIcon,
  Shield,
  Filter,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = d.getHours().toString().padStart(2, "0");
  const mm = d.getMinutes().toString().padStart(2, "0");
  const ss = d.getSeconds().toString().padStart(2, "0");
  const ms = d.getMilliseconds().toString().padStart(3, "0");
  return `${hh}:${mm}:${ss}.${ms}`;
}

function prettyPrintJson(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

function EventItem({ event }: { event: SSEEvent }) {
  const formatted = prettyPrintJson(event.data);
  const isCustomEvent = event.event !== "message";

  return (
    <div
      className={cn(
        "group/event flex flex-col gap-1 rounded-lg border p-3 transition-all duration-200",
        isCustomEvent ? "border-warning/20 bg-warning/5" : "border-primary/20 bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-bold font-mono px-1.5 py-0",
              isCustomEvent
                ? "border-warning/30 text-warning bg-warning/10"
                : "border-primary/30 text-primary bg-primary/10",
            )}
          >
            {event.event.toUpperCase()}
          </Badge>
          <span className="text-[10px] font-mono text-muted-foreground/50">
            {formatTimestamp(event.timestamp)}
          </span>
        </div>
      </div>
      <pre className="text-xs font-mono leading-relaxed text-foreground whitespace-pre-wrap break-all">
        {formatted}
      </pre>
    </div>
  );
}

const authTypeLabels: Record<SSEAuthType, string> = {
  none: "No Auth",
  bearer: "Bearer Token",
  basic: "Basic Auth",
};

export function SSEPanel() {
  const { status, events, connect, disconnect, clearEvents } = useSSE();
  const [url, setUrl] = useState("https://localhost:3000/sse");
  const [showOptions, setShowOptions] = useState(false);
  const eventsEndRef = useRef<HTMLDivElement>(null);

  // Custom headers
  const [headers, setHeaders] = useState<KeyValuePair[]>([]);

  // Auth
  const [authType, setAuthType] = useState<SSEAuthType>("none");
  const [authToken, setAuthToken] = useState("");

  // Event filter
  const [eventFilter, setEventFilter] = useState("");

  // Max events
  const [maxEvents, setMaxEvents] = useState(500);

  const handleConnect = useCallback(() => {
    const trimmed = url.trim();
    if (!trimmed) return;
    connect({
      url: trimmed,
      headers,
      auth: authType !== "none" && authToken ? { type: authType, token: authToken } : undefined,
      maxEvents,
      eventFilter: eventFilter.trim() || undefined,
    });
  }, [url, headers, authType, authToken, maxEvents, eventFilter, connect]);

  const handleDisconnect = useCallback(() => {
    disconnect();
  }, [disconnect]);

  const statusConfig: Record<string, { label: string; className: string; icon: React.ReactNode }> =
    {
      idle: {
        label: "Idle",
        className: "bg-muted text-muted-foreground",
        icon: <Activity />,
      },
      connecting: {
        label: "Connecting",
        className: "bg-warning/10 text-warning border-warning/20",
        icon: <Loader2 className="animate-spin" />,
      },
      open: {
        label: "Open",
        className: "bg-success/10 text-success border-success/20",
        icon: <Wifi />,
      },
      closed: {
        label: "Closed",
        className: "bg-muted text-muted-foreground",
        icon: <WifiOff />,
      },
      error: {
        label: "Error",
        className: "bg-destructive/10 text-destructive border-destructive/20",
        icon: <WifiOff />,
      },
    };

  const currentStatus = statusConfig[status] ?? statusConfig.idle;

  const isConnected = status === "open" || status === "connecting";

  return (
    <div className="flex flex-1 min-w-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
            <Radio className="size-3.5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-tight leading-none">
              SSE
            </h3>
            <p className="text-[10px] text-muted-foreground/40 leading-none mt-1">
              Monitor Server-Sent Events streams
            </p>
          </div>
        </div>
      </div>

      {/* Connection Bar */}
      <div className="p-3 pb-1">
        <div className="flex items-center gap-2 rounded-lg border border-input/50 px-3 py-1.5 transition-all duration-200">
          {/* Status badge */}
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 gap-1.5 py-0.5 px-2 text-[11px] font-semibold",
              currentStatus.className,
            )}
          >
            {currentStatus.icon}
            {currentStatus.label}
          </Badge>

          {/* URL input */}
          <div className="relative flex-1">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://localhost:3000/sse"
              disabled={status === "open" || status === "connecting"}
              className="font-mono text-sm"
            />
          </div>

          {/* Connect / Disconnect button */}
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              disabled={status === "connecting"}
              onClick={handleDisconnect}
              className="shrink-0"
            >
              <WifiOff />
              Disconnect
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleConnect}
              disabled={!url.trim()}
              className="shrink-0"
            >
              <Wifi />
              Connect
            </Button>
          )}
        </div>
      </div>

      {/* Options Toggle */}
      <div className="px-3 pb-1">
        <button
          type="button"
          onClick={() => setShowOptions(!showOptions)}
          disabled={isConnected}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg border border-input/30 px-3 py-2 text-xs font-medium",
            "text-muted-foreground/60 hover:text-foreground hover:border-input/60",
            "transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed",
          )}
        >
          {showOptions ? (
            <ChevronDown className="size-3.5 shrink-0" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0" />
          )}
          Options
          {(headers.length > 0 || authType !== "none" || eventFilter || maxEvents !== 500) && (
            <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground/40">
              {headers.length > 0 && <HeadersIcon className="size-3" />}
              {authType !== "none" && <Shield className="size-3" />}
              {eventFilter && <Filter className="size-3" />}
              {maxEvents !== 500 && <List className="size-3" />}
            </span>
          )}
        </button>

        {/* Options Panel */}
        {showOptions && (
          <div className="mt-2 space-y-4 rounded-lg border border-input/30 p-3 animate-in slide-in-from-top-1 duration-200">
            {/* Custom Headers */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Custom Headers
              </Label>
              <KeyValueEditor
                pairs={headers}
                onChange={setHeaders}
                keyPlaceholder="Header name"
                valuePlaceholder="Header value"
                addLabel="Add header"
                emptyLabel="No custom headers"
                showToggle
              />
            </div>

            {/* Separator */}
            <div className="border-t border-border/40" />

            {/* Auth */}
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                Authentication
              </Label>
              <div className="flex items-start gap-2">
                <div className="w-40 shrink-0">
                  <Select
                    value={authType}
                    onValueChange={(value) => setAuthType(value as SSEAuthType)}
                  >
                    <SelectTrigger className="h-9 border-input bg-muted/20 text-xs transition-all duration-200 hover:border-muted-foreground/30">
                      <SelectValue placeholder="Auth type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Auth</SelectItem>
                      <SelectItem value="bearer">Bearer Token</SelectItem>
                      <SelectItem value="basic">Basic Auth</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {authType !== "none" && (
                  <Input
                    type="password"
                    value={authToken}
                    onChange={(e) => setAuthToken(e.target.value)}
                    placeholder={
                      authType === "bearer"
                        ? "eyJhbGciOiJIUzI1NiIs..."
                        : "base64(username:password)"
                    }
                    className="flex-1 h-9 border-input bg-muted/20 font-mono text-xs transition-all duration-200 focus:bg-muted/40"
                  />
                )}
              </div>
            </div>

            {/* Separator */}
            <div className="border-t border-border/40" />

            {/* Event Filter + Max Events */}
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Event Filter
                </Label>
                <Input
                  type="text"
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  placeholder='Filter by event type (e.g. "update")'
                  disabled={isConnected}
                  className="h-9 border-input bg-muted/20 text-xs transition-all duration-200 focus:bg-muted/40"
                />
                <p className="text-[10px] text-muted-foreground/40">
                  Leave empty to receive all events
                </p>
              </div>
              <div className="w-32 shrink-0 space-y-1.5">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Max Events
                </Label>
                <Input
                  type="number"
                  value={maxEvents}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) setMaxEvents(Math.min(Math.max(1, val), 5000));
                  }}
                  min={1}
                  max={5000}
                  disabled={isConnected}
                  className="h-9 border-input bg-muted/20 font-mono text-xs transition-all duration-200 focus:bg-muted/40"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Events Area */}
      <div className="flex flex-1 min-h-0 flex-col px-3 pb-3">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
            Events
            {events.length > 0 && (
              <span className="ml-1.5 font-mono text-muted-foreground/30">({events.length})</span>
            )}
          </span>
          {events.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearEvents}
              className="h-6 gap-1 text-[10px] font-medium text-muted-foreground/50 hover:text-destructive transition-colors duration-200"
            >
              <Trash2 className="size-3" />
              Clear
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1 min-h-0 border border-border rounded-lg bg-muted/10">
          <div className="flex flex-col gap-2 p-3">
            {events.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-xs text-muted-foreground/50">
                <Activity className="size-8 mb-2 text-muted-foreground/20" />
                <span>No events yet</span>
                <span className="text-[10px] text-muted-foreground/30 mt-1">
                  Connect to an SSE endpoint to start receiving events
                </span>
              </div>
            )}
            {events.map((evt) => (
              <EventItem key={evt.id} event={evt} />
            ))}
            <div ref={eventsEndRef} />
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
