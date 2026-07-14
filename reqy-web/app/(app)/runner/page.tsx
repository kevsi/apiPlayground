"use client";

import { useCallback, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  ListChecks,
  Terminal,
  CircleSlash,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { useRequestStore, type Collection } from "@/hooks/use-request-store";
import { runCollection as runCollectionEngine } from "@/lib/test-runner/runner";
import { createRunnerExecutor } from "@/lib/test-runner/executor";
import {
  type CollectionRunReport,
  type RequestTestResult,
  type AssertionResult,
  type Assertion,
  type AssertionStatus,
  type RunnerContext,
} from "@/lib/test-runner/types";
import { hashRunReport, verifyRunReport } from "@/lib/run-report/hash";
import { ShieldCheck, ShieldAlert } from "lucide-react";

function formatDuration(ms?: number) {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function STATUS_BADGE(status: number) {
  if (status >= 500) return "bg-destructive/10 text-destructive";
  if (status >= 400) return "bg-warning/10 text-warning";
  if (status >= 300) return "bg-sky-500/10 text-sky-500";
  return "bg-success/10 text-success";
}

const STATUS_META: Record<
  AssertionStatus,
  { label: string; icon: LucideIcon; color: string; dot: string }
> = {
  pass: { label: "Passed", icon: CheckCircle2, color: "text-success", dot: "bg-success" },
  fail: { label: "Failed", icon: XCircle, color: "text-destructive", dot: "bg-destructive" },
  skipped: {
    label: "Skipped",
    icon: CircleSlash,
    color: "text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  errored: { label: "Errored", icon: AlertCircle, color: "text-warning", dot: "bg-warning" },
};

const COUNT_KEY: Record<AssertionStatus, "passed" | "failed" | "errored" | "skipped"> = {
  pass: "passed",
  fail: "failed",
  errored: "errored",
  skipped: "skipped",
};

function describeAssertion(a: Assertion): string {
  switch (a.type) {
    case "status": {
      if (typeof a.expected === "number") return `Status equals ${a.expected}`;
      if ("in" in a.expected) return `Status in [${a.expected.in.join(", ")}]`;
      return `Status not ${a.expected.not}`;
    }
    case "responseTime":
      return `Response time ${a.operator} ${a.valueMs}ms`;
    case "jsonPath": {
      const op =
        a.operator === "exists"
          ? "exists"
          : a.operator === "notExists"
            ? "does not exist"
            : a.operator === "equals"
              ? `equals ${JSON.stringify(a.value)}`
              : a.operator === "contains"
                ? `contains ${JSON.stringify(a.value)}`
                : a.operator;
      return `JSONPath ${a.path} ${op}`;
    }
    case "schema":
      return "Schema validation";
    default:
      return "Assertion";
  }
}

function formatActual(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return v;
  try {
    const str = JSON.stringify(v);
    return str.length > 80 ? str.slice(0, 80) + "…" : str;
  } catch {
    return String(v);
  }
}

function RequestResult({ result }: { result: RequestTestResult }) {
  const meta = STATUS_META[result.status];
  const StatusIcon = meta.icon;
  const hasScript = !!(result.scriptOutput?.pre || result.scriptOutput?.post);
  const hasAssertions = result.assertionResults.length > 0;

  return (
    <AccordionItem value={result.requestId} className="px-4">
      <AccordionTrigger className="items-center gap-3 hover:no-underline">
        <span className={cn("size-2 rounded-full shrink-0", meta.dot)} />
        <span className="flex-1 min-w-0 truncate font-medium text-foreground">
          {result.requestName}
        </span>
        {result.statusCode != null && (
          <span
            className={cn(
              "font-mono text-xs font-semibold rounded px-1.5 py-0.5 shrink-0",
              STATUS_BADGE(result.statusCode),
            )}
          >
            {result.statusCode}
          </span>
        )}
        {result.responseTimeMs != null && (
          <span className="font-mono text-xs text-muted-foreground shrink-0 flex items-center gap-1">
            <Clock className="size-3" />
            {formatDuration(result.responseTimeMs)}
          </span>
        )}
        <StatusIcon className={cn("size-4 shrink-0", meta.color)} />
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        {result.error && (
          <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive font-mono">
            {result.error}
          </div>
        )}

        {hasAssertions && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Assertions
            </p>
            <div className="divide-y divide-border rounded-lg border border-border bg-muted/20">
              {result.assertionResults.map((ar: AssertionResult, i: number) => (
                <div key={i} className="flex items-start gap-2.5 px-3 py-2">
                  {ar.passed ? (
                    <CheckCircle2 className="size-4 text-success shrink-0 translate-y-0.5" />
                  ) : (
                    <XCircle className="size-4 text-destructive shrink-0 translate-y-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{describeAssertion(ar.assertion)}</p>
                    {ar.error ? (
                      <p className="font-mono text-xs text-destructive/80 truncate">{ar.error}</p>
                    ) : (
                      <p className="font-mono text-xs text-muted-foreground truncate">
                        actual: {formatActual(ar.actualValue)}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!hasAssertions && !hasScript && !result.error && (
          <p className="text-xs text-muted-foreground">
            No assertions or scripts configured for this request.
          </p>
        )}

        {hasScript && (
          <div className="mt-3 space-y-2">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Terminal className="size-3.5" />
              Script output
            </p>
            {result.scriptOutput?.pre && (
              <pre className="overflow-auto rounded-lg border border-border bg-[var(--code-bg)] p-3 font-mono text-xs text-[var(--code-text)]">
                {result.scriptOutput.pre}
              </pre>
            )}
            {result.scriptOutput?.post && (
              <pre className="overflow-auto rounded-lg border border-border bg-[var(--code-bg)] p-3 font-mono text-xs text-[var(--code-text)]">
                {result.scriptOutput.post}
              </pre>
            )}
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export default function RunnerPage() {
  const { collections, environmentVariables, activeWorkspaceId } = useRequestStore();
  const [selectedId, setSelectedId] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<CollectionRunReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [integrity, setIntegrity] = useState<"idle" | "valid" | "tampered">("idle");

  const reportHash = useMemo(() => (report ? hashRunReport(report) : ""), [report]);

  const selected: Collection | null = collections.find((c) => c.id === selectedId) ?? null;
  const requestCount = selected?.requests?.length ?? 0;
  const canRun = !!selected && requestCount > 0 && !isRunning;

  const executor = useMemo(
    () => createRunnerExecutor({ workspaceId: activeWorkspaceId }),
    [activeWorkspaceId],
  );

  const baseContext = useMemo<RunnerContext>(
    () => ({
      environment: environmentVariables ?? {},
      iterationData: {},
      iterationIndex: 0,
      log: () => {},
    }),
    [environmentVariables],
  );

  const handleRun = useCallback(async () => {
    if (!selected) return;
    setIsRunning(true);
    setProgress(0);
    setReport(null);
    setError(null);
    try {
      const result = await runCollectionEngine(selected, baseContext, { executor });
      setReport(result);
      setProgress(100);
      setIntegrity("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  }, [selected, baseContext, executor]);

  const summary = report?.summary;
  const total = summary?.total ?? 0;
  const hasFailures = (summary?.failed ?? 0) + (summary?.errored ?? 0) > 0;
  const verdictIcon: LucideIcon = !report ? ListChecks : hasFailures ? XCircle : CheckCircle2;
  const VerdictIcon = verdictIcon;
  const verdictColor = !report
    ? "text-muted-foreground"
    : hasFailures
      ? "text-destructive"
      : "text-success";
  const verdictAccent = !report
    ? "from-muted/20 to-transparent"
    : hasFailures
      ? "from-destructive/15 to-transparent"
      : "from-success/15 to-transparent";
  const verdictText = !report
    ? "No runs yet"
    : hasFailures
      ? `${summary?.failed ?? 0} failed · ${summary?.errored ?? 0} errored`
      : "All checks passed";

  const segments = summary
    ? [
        { v: summary.passed, color: "bg-success" },
        { v: summary.failed, color: "bg-destructive" },
        { v: summary.errored, color: "bg-warning" },
        { v: summary.skipped, color: "bg-muted-foreground" },
      ].filter((s) => s.v > 0)
    : [];

  return (
    <main className="flex-1 overflow-auto p-6 hide-scrollbar">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Runner</h1>
        <p className="text-sm text-muted-foreground">
          Execute an entire collection and verify every assertion in one pass.
        </p>
      </div>

      {/* Control bar */}
      <Card className="bg-card mb-5">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-3 min-w-0">
            <Select value={selectedId} onValueChange={setSelectedId} disabled={isRunning}>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="Select a collection…" />
              </SelectTrigger>
              <SelectContent>
                {collections.length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No collections available
                  </div>
                )}
                {collections.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="truncate">{c.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {c.requests?.length ?? 0}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              {requestCount > 0
                ? `${requestCount} request${requestCount !== 1 ? "s" : ""}`
                : "No requests"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isRunning ? (
              <Button variant="outline" disabled className="gap-2">
                <Loader2 className="size-4 animate-spin" />
                Running…
              </Button>
            ) : (
              <Button onClick={handleRun} disabled={!canRun} className="gap-2">
                <Play className="size-4" />
                Run collection
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      {(isRunning || progress === 100) && (
        <div className="mb-5">
          <div className="metric-bar">
            {isRunning ? (
              <div className="metric-bar-fill w-1/3 shimmer bg-primary/70" />
            ) : (
              <div
                className={cn("metric-bar-fill", hasFailures ? "bg-destructive" : "bg-success")}
                style={{ width: "100%" }}
              />
            )}
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {isRunning ? "Executing requests…" : "Run complete"}
          </p>
        </div>
      )}

      {/* Error */}
      {error && !report && (
        <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!report && !isRunning && !error && (
        <Empty className="border border-dashed animate-fade-in">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ListChecks className="size-6" />
            </EmptyMedia>
            <EmptyTitle>No runs yet</EmptyTitle>
            <EmptyDescription>
              Pick a collection above and hit{" "}
              <span className="font-medium text-foreground">Run collection</span> to execute every
              request and verify its assertions. Results, response codes, timings, and script output
              appear here.
            </EmptyDescription>
          </EmptyHeader>
          <Button
            variant="default"
            size="sm"
            onClick={handleRun}
            disabled={!canRun}
            className="h-8 gap-1.5 text-xs font-medium shadow-xs"
          >
            <Play className="size-4" />
            {selected ? "Run collection" : "Select a collection first"}
          </Button>
        </Empty>
      )}

      {/* Report */}
      {report && (
        <div className="space-y-5 animate-slide-up" key={report.startedAt}>
          {/* Summary */}
          <Card className={cn("bg-card relative overflow-hidden", "response-flash")}>
            <div
              className={cn(
                `absolute inset-x-0 top-0 h-16 bg-gradient-to-b ${verdictAccent} pointer-events-none`,
              )}
            />
            <CardHeader className="flex flex-row items-center justify-between gap-4 pb-2 relative">
              <CardTitle className="flex items-center gap-2 text-base">
                <VerdictIcon className={cn("size-5", verdictColor)} />
                <span className="text-foreground">{verdictText}</span>
              </CardTitle>
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {formatDuration(report.totalDurationMs)}
                </span>
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {report.collectionName}
                </span>
              </div>
            </CardHeader>
            <CardContent className="relative space-y-4">
              {/* Distribution bar */}
              {segments.length > 0 && (
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                  {segments.map((s, i) => (
                    <div
                      key={i}
                      className={cn("h-full transition-all duration-500", s.color)}
                      style={{ width: `${(s.v / total) * 100}%` }}
                    />
                  ))}
                </div>
              )}

              {/* Legend */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {(["pass", "fail", "errored", "skipped"] as AssertionStatus[]).map((k) => {
                  const m = STATUS_META[k];
                  const count = summary?.[COUNT_KEY[k]] ?? 0;
                  const Icon = m.icon;
                  return (
                    <div key={k} className="rounded-lg border border-border bg-muted/20 p-3">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("size-2 rounded-full", m.dot)} />
                        <span className="text-xs text-muted-foreground">{m.label}</span>
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-xl font-bold text-foreground">
                        <Icon className={cn("size-4", m.color)} />
                        {count}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Integrity hash + verify action */}
              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    Hash d&apos;intégrité
                  </span>
                  <code className="font-mono text-xs text-foreground bg-muted rounded px-1.5 py-0.5 break-all">
                    {reportHash}
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() =>
                      setIntegrity(verifyRunReport(report, reportHash) ? "valid" : "tampered")
                    }
                  >
                    Vérifier l&apos;intégrité
                  </Button>
                  {integrity === "valid" && (
                    <span className="flex items-center gap-1 text-xs font-medium text-success">
                      <ShieldCheck className="size-4" />
                      Rapport intact
                    </span>
                  )}
                  {integrity === "tampered" && (
                    <span className="flex items-center gap-1 text-xs font-medium text-destructive">
                      <ShieldAlert className="size-4" />
                      Rapport modifié
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Per-request results */}
          <Card className="bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <ListChecks className="size-4 text-muted-foreground" />
                Requests
                <span className="text-xs font-normal text-muted-foreground">
                  ({report.results.length})
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Accordion type="single" collapsible className="w-full">
                {report.results.map((r) => (
                  <RequestResult key={r.requestId} result={r} />
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
