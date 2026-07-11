"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Play,
  Square,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  FolderOpen,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { useRequestStore, type Collection } from "@/hooks/use-request-store";
import type { CollectionRunReport } from "@/lib/test-runner/types";
import { cn } from "@/lib/utils";

type RunStatus = "idle" | "running" | "done" | "error";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function StatusBadge({ status }: { status: number }) {
  if (status >= 500) {
    return <span className="text-xs font-semibold text-red-500">{status}</span>;
  }
  if (status >= 400) {
    return <span className="text-xs font-semibold text-amber-500">{status}</span>;
  }
  if (status >= 300) {
    return <span className="text-xs font-semibold text-sky-500">{status}</span>;
  }
  return <span className="text-xs font-semibold text-emerald-500">{status}</span>;
}

function RequestResult({
  result,
}: {
  result: {
    requestId: string;
    requestName: string;
    status: string;
    responseTimeMs?: number;
    error?: string;
  };
}) {
  const icon =
    result.status === "pass" ? (
      <CheckCircle2 className="size-4 text-emerald-500" />
    ) : result.status === "fail" ? (
      <XCircle className="size-4 text-red-500" />
    ) : result.status === "skipped" ? (
      <Clock className="size-4 text-amber-500" />
    ) : (
      <Loader2 className="size-4 animate-spin text-muted-foreground" />
    );

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/20 p-3">
      {icon}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{result.requestName}</p>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          {result.responseTimeMs !== undefined && (
            <span>{formatDuration(result.responseTimeMs)}</span>
          )}
          {result.error && <span className="text-red-400 truncate">{result.error}</span>}
        </div>
      </div>
    </div>
  );
}

export default function RunnerPage() {
  const { collections } = useRequestStore();
  const [selectedId, setSelectedId] = useState<string>("");
  const [status, setStatus] = useState<RunStatus>("idle");
  const [report, setReport] = useState<CollectionRunReport | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const selected = collections.find((c) => c.id === selectedId);

  const runCollection = useCallback(async () => {
    if (!selected) return;
    setStatus("running");
    setReport(null);
    setProgress({ current: 0, total: selected.requests.length });

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const res = await fetch("/api/test-runner/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collection: selected }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Run failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = (await res.json()) as CollectionRunReport;
      setReport(data);
      setStatus("done");
      setProgress({ current: 0, total: 0 });
      toast({
        title: "Run complete",
        description: `${data.summary.passed}/${data.summary.total} passed`,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        toast({ title: "Run cancelled" });
      } else {
        setStatus("error");
        toast({
          title: "Run failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    } finally {
      setAbortController(null);
    }
  }, [selected]);

  const cancelRun = useCallback(() => {
    abortController?.abort();
  }, [abortController]);

  useEffect(() => {
    return () => {
      abortController?.abort();
    };
  }, [abortController]);

  // Flatten results from report
  const results = report?.results ?? [];
  const summary = report?.summary ?? null;

  return (
    <main className="flex-1 overflow-auto p-6">
      <div className="flex flex-col gap-4 border-b border-border bg-background/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Test Runner</h1>
          <p className="text-sm text-muted-foreground">
            Run a collection and view assertion results.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {/* Collection Selector */}
        <Card className="bg-card">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <FolderOpen className="size-4 text-muted-foreground" />
              Select Collection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <select
                  value={selectedId}
                  onChange={(e) => {
                    setSelectedId(e.target.value);
                    setStatus("idle");
                    setReport(null);
                    setProgress({ current: 0, total: 0 });
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors md:text-sm"
                >
                  <option value="">— Choose a collection —</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.requests.length} requests)
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              </div>
              {status === "idle" || status === "done" || status === "error" ? (
                <Button onClick={runCollection} disabled={!selected}>
                  <Play className="mr-2 size-4" />
                  Run
                </Button>
              ) : (
                <Button variant="destructive" onClick={cancelRun}>
                  <Square className="mr-2 size-4" />
                  Cancel
                </Button>
              )}
            </div>

            {selected && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium">{selected.name}</span>
                <span>·</span>
                <span>{selected.requests.length} requests</span>
                {status === "running" && (
                  <>
                    <span>·</span>
                    <span className="text-primary">
                      Running... {progress.current}/{progress.total}
                    </span>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results */}
        {summary && (
          <Card className="bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-4">
                <span>Results</span>
                <span className="flex items-center gap-1 text-emerald-500">
                  <CheckCircle2 className="size-4" />
                  {summary.passed} passed
                </span>
                <span className="flex items-center gap-1 text-red-500">
                  <XCircle className="size-4" />
                  {summary.failed} failed
                </span>
                <span className="text-muted-foreground">{summary.skipped} skipped</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {results.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">No results.</p>
              ) : (
                results.map(
                  (r: {
                    requestId: string;
                    requestName: string;
                    status: string;
                    responseTimeMs?: number;
                    error?: string;
                  }) => (
                    <RequestResult
                      key={r.requestId}
                      result={{
                        requestId: r.requestId,
                        requestName: r.requestName,
                        status: r.status,
                        responseTimeMs: r.responseTimeMs,
                        error: r.error,
                      }}
                    />
                  ),
                )
              )}
            </CardContent>
          </Card>
        )}

        {collections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-6 flex size-20 items-center justify-center rounded-full bg-muted">
              <FolderOpen className="size-10 text-muted-foreground/40" />
            </div>
            <h2 className="text-xl font-semibold text-foreground">No collections yet</h2>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              Create collections in the Collections page and add requests to start testing.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
