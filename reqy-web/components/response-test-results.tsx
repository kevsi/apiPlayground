"use client";

import { CheckCircle, XCircle, FlaskConical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TestResult } from "@/lib/types";

interface TestResultsSectionProps {
  testResults: TestResult[];
}

export function TestResultsSection({ testResults }: TestResultsSectionProps) {
  if (!testResults || testResults.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center px-4">
        <div className="rounded-2xl bg-muted/40 border border-border p-5 mb-4">
          <FlaskConical className="size-10 text-muted-foreground/30" />
        </div>
        <p className="text-sm font-semibold text-foreground/80">No test results</p>
        <p className="mt-1 text-xs text-muted-foreground/60 max-w-[200px]">
          Add assertions in the Tests panel and send a request to see results
        </p>
      </div>
    );
  }

  const allPassed = testResults.every((r) => r.passed);
  const passedCount = testResults.filter((r) => r.passed).length;

  return (
    <div className="space-y-1 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span
          className={cn(
            "text-xs font-semibold",
            allPassed ? "text-emerald-500" : "text-red-500",
          )}
        >
          {passedCount}/{testResults.length} passed
        </span>
      </div>
      {testResults.map((result) => (
        <div
          key={result.assertionId}
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-xs",
            result.passed
              ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600"
              : "border-red-500/20 bg-red-500/5 text-red-600",
          )}
        >
          {result.passed ? (
            <CheckCircle className="size-3.5 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="size-3.5 shrink-0 mt-0.5" />
          )}
          <div className="flex flex-col min-w-0">
            <span className="font-medium truncate">
              {result.type}: {result.target}
              {result.expected ? ` = ${result.expected}` : ""}
            </span>
            <span className="text-muted-foreground/80">{result.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
