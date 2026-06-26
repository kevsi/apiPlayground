"use client";

/**
 * Phase 7.6 — Metrics dashboard widget
 *
 * Aggregates stats from metrics.ts (P50/P95/count) and feedback-store.ts
 * (rating counts) and renders a compact card. Designed to be embedded
 * in the Reqly dashboard.
 */
import { useEffect, useState } from "react";
import { Activity, ThumbsDown, ThumbsUp, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getLatencyStats, type LatencyStats } from "@/src/ai/cloud-engine/metrics";
import { getRatingStats, type RatingStats } from "@/src/ai/cloud-engine/feedback-store";

export interface MetricsWidgetProps {
  /** Which latency labels to display. Defaults to common AI labels. */
  labels?: string[];
  /** Refresh interval in ms (default: 5_000). */
  refreshMs?: number;
  className?: string;
}

export function MetricsWidget({
  labels = ["analyze", "streamLLM", "retrieveChunks"],
  refreshMs = 5000,
  className,
}: MetricsWidgetProps) {
  const [latency, setLatency] = useState<Record<string, LatencyStats | null>>({});
  const [ratings, setRatings] = useState<RatingStats>({ total: 0, up: 0, down: 0 });

  useEffect(() => {
    function refresh() {
      const next: Record<string, LatencyStats | null> = {};
      for (const l of labels) next[l] = getLatencyStats(l);
      setLatency(next);
      setRatings(getRatingStats());
    }
    refresh();
    const id = setInterval(refresh, refreshMs);
    return () => clearInterval(id);
  }, [labels.join("|"), refreshMs]);

  return (
    <Card className={cn("p-4 space-y-4", className)} data-testid="metrics-widget">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">Métriques ReqlyAI</h3>
        </div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          Live · {refreshMs / 1000}s
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {labels.map((l) => {
          const s = latency[l];
          return (
            <div key={l} className="rounded-lg bg-muted/40 p-2 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {l}
              </div>
              {s ? (
                <>
                  <div className="text-sm font-mono">
                    <span className="text-muted-foreground">p50 </span>
                    <span className="font-semibold">{s.p50.toFixed(1)}</span>
                    <span className="text-muted-foreground"> · p95 </span>
                    <span className="font-semibold">{s.p95.toFixed(1)}</span>
                    <span className="text-muted-foreground">ms</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    n={s.count} · avg={s.avg.toFixed(1)}ms
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted-foreground italic">no data</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-border pt-3 flex items-center justify-between">
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <ThumbsUp className="size-3 text-emerald-600" />
            <span className="font-mono">{ratings.up}</span>
          </div>
          <div className="flex items-center gap-1">
            <ThumbsDown className="size-3 text-red-500" />
            <span className="font-mono">{ratings.down}</span>
          </div>
          <div className="text-muted-foreground">
            ratio{" "}
            <span className="font-mono">
              {ratings.total === 0
                ? "—"
                : `${Math.round((ratings.up / ratings.total) * 100)}%`}
            </span>
          </div>
        </div>
        <Zap className="size-3 text-muted-foreground/40" />
      </div>
    </Card>
  );
}
