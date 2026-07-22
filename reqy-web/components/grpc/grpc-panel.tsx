"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { isTauriAvailable } from "@/lib/tauri";
import { invoke } from "@tauri-apps/api/core";
import { Plug, PlugZap, Loader2, Send, AlertCircle, X, Copy, Check } from "lucide-react";

interface GrpcInvokeResult {
  statusCode: number;
  statusMessage: string;
  body: number[];
  trailers: Array<[string, string]>;
}

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export function GrpcPanel() {
  const [url, setUrl] = useState("localhost:50051");
  const [method, setMethod] = useState("");
  const [requestBody, setRequestBody] = useState("");
  const [metadataStr, setMetadataStr] = useState("");
  const [connStatus, setConnStatus] = useState<ConnectionStatus>("disconnected");
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [connError, setConnError] = useState("");
  const [invoking, setInvoking] = useState(false);
  const [result, setResult] = useState<GrpcInvokeResult | null>(null);
  const [durationMs, setDurationMs] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const canConnect = isTauriAvailable();
  const isConnected = connStatus === "connected";

  const handleConnect = useCallback(async () => {
    if (!canConnect) return;
    setConnStatus("connecting");
    setConnError("");
    try {
      const id = await invoke<string>("grpc_connect", { url });
      setConnectionId(id);
      setConnStatus("connected");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setConnError(msg);
      setConnStatus("error");
    }
  }, [url, canConnect]);

  const handleDisconnect = useCallback(async () => {
    if (!connectionId) return;
    try {
      await invoke("grpc_disconnect", { connectionId });
    } catch {
      // ignore
    }
    setConnectionId(null);
    setConnStatus("disconnected");
    setResult(null);
    setDurationMs(null);
  }, [connectionId]);

  const handleInvoke = useCallback(async () => {
    if (!connectionId || !method.trim()) return;
    setInvoking(true);
    setResult(null);
    setDurationMs(null);
    const start = performance.now();
    try {
      const metadata: Array<[string, string]> = metadataStr
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => {
          const sep = l.indexOf(":");
          if (sep === -1) return [l.trim(), ""];
          return [l.slice(0, sep).trim(), l.slice(sep + 1).trim()];
        });
      const encoder = new TextEncoder();
      const requestBytes = Array.from(encoder.encode(requestBody || ""));
      const res = await invoke<GrpcInvokeResult>("grpc_invoke", {
        connectionId,
        method: method.trim(),
        requestBody: requestBytes,
        _metadata: metadata,
      });
      setResult(res);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setResult({
        statusCode: 0,
        statusMessage: msg,
        body: [],
        trailers: [],
      });
    } finally {
      setDurationMs(Math.round(performance.now() - start));
      setInvoking(false);
    }
  }, [connectionId, method, requestBody, metadataStr]);

  const bodyText = result
    ? (() => {
        try {
          return new TextDecoder().decode(new Uint8Array(result.body));
        } catch {
          return `[${result.body.join(", ")}]`;
        }
      })()
    : "";

  const bodyBase64 = result ? btoa(String.fromCharCode(...result.body)) : "";

  const handleCopyBase64 = useCallback(async () => {
    if (!bodyBase64) return;
    try {
      await navigator.clipboard.writeText(bodyBase64);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [bodyBase64]);

  return (
    <div className="flex flex-1 min-w-0 flex-col overflow-hidden gap-3 p-4">
      {/* Connection bar */}
      <Card className="flex items-center gap-3 p-3 shrink-0">
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="host:port — e.g. localhost:50051"
          disabled={isConnected || connStatus === "connecting"}
          className="flex-1 font-mono text-sm"
        />
        {isConnected ? (
          <Badge variant="outline" className="gap-1 text-emerald-600 border-emerald-300">
            <PlugZap className="size-3.5" />
            Connected
          </Badge>
        ) : connStatus === "error" ? (
          <Badge variant="destructive" className="gap-1">
            <AlertCircle className="size-3.5" />
            Error
          </Badge>
        ) : (
          <Badge variant="secondary" className="gap-1 text-muted-foreground">
            <Plug className="size-3.5" />
            Disconnected
          </Badge>
        )}
        {isConnected ? (
          <Button variant="outline" size="sm" onClick={handleDisconnect}>
            <X /> Disconnect
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleConnect}
            disabled={connStatus === "connecting" || !canConnect || !url.trim()}
          >
            {connStatus === "connecting" ? (
              <>
                <Loader2 className="animate-spin" /> Connecting...
              </>
            ) : (
              <>
                <PlugZap /> Connect
              </>
            )}
          </Button>
        )}
      </Card>

      {connError && <p className="text-sm text-destructive shrink-0">{connError}</p>}

      {/* Invoke section */}
      <Card className="flex flex-col gap-3 p-3 flex-1 min-h-0 overflow-hidden">
        <div className="flex gap-2 shrink-0">
          <Input
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            placeholder="package.Service/Method"
            disabled={!isConnected || invoking}
            className="flex-1 font-mono text-sm"
          />
          <Button
            size="sm"
            onClick={handleInvoke}
            disabled={!isConnected || invoking || !method.trim()}
          >
            {invoking ? (
              <>
                <Loader2 className="animate-spin" /> Invoking...
              </>
            ) : (
              <>
                <Send /> Invoke
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 flex-1 min-h-0">
          {/* Request */}
          <div className="flex flex-col gap-1.5 min-h-0">
            <span className="text-xs font-medium text-muted-foreground">Request Body</span>
            <Textarea
              value={requestBody}
              onChange={(e) => setRequestBody(e.target.value)}
              placeholder='{"message": "hello"}'
              disabled={!isConnected || invoking}
              className="flex-1 resize-none font-mono text-xs"
            />
          </div>

          {/* Response */}
          <div className="flex flex-col gap-1.5 min-h-0">
            <div className="flex items-center justify-between shrink-0">
              <span className="text-xs font-medium text-muted-foreground">
                Response
                {result && (
                  <span className="ml-2 text-muted-foreground/60">
                    (HTTP {result.statusCode}
                    {durationMs !== null && ` · ${durationMs}ms`})
                  </span>
                )}
              </span>
              {bodyBase64 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 gap-1 text-xs text-muted-foreground"
                  onClick={handleCopyBase64}
                >
                  {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                  {copied ? "Copied" : "Copy base64"}
                </Button>
              )}
            </div>
            <Textarea
              readOnly
              value={result ? bodyText || bodyBase64 : "Awaiting invocation..."}
              placeholder="Response will appear here"
              className="flex-1 resize-none font-mono text-xs"
            />
          </div>
        </div>

        {/* Metadata */}
        <div className="flex flex-col gap-1.5 shrink-0">
          <span className="text-xs font-medium text-muted-foreground">
            Metadata (key:value per line)
          </span>
          <Textarea
            value={metadataStr}
            onChange={(e) => setMetadataStr(e.target.value)}
            placeholder="custom-header: value"
            disabled={!isConnected || invoking}
            className="h-16 resize-none font-mono text-xs"
          />
        </div>
      </Card>
    </div>
  );
}
