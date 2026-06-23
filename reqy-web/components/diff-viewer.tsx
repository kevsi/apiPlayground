"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"

export interface DiffLine {
  type: "added" | "removed" | "unchanged"
  content: string
}

export interface DiffResult {
  lines: DiffLine[]
  leftLines: number
  rightLines: number
  addedLines: number
  removedLines: number
}

/**
 * Simple LCS-based line diff algorithm
 */
function computeLineDiff(leftRaw: string, rightRaw: string): DiffResult {
  const leftLines = leftRaw.split("\n")
  const rightLines = rightRaw.split("\n")

  // LCS DP table
  const m = leftLines.length
  const n = rightLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (leftLines[i - 1] === rightLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to build diff
  const diffLines: DiffLine[] = []
  let i = m
  let j = n
  const tempLines: DiffLine[] = []

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && leftLines[i - 1] === rightLines[j - 1]) {
      tempLines.push({ type: "unchanged", content: leftLines[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      tempLines.push({ type: "added", content: rightLines[j - 1] })
      j--
    } else {
      tempLines.push({ type: "removed", content: leftLines[i - 1] })
      i--
    }
  }

  // Reverse to get correct order
  for (let k = tempLines.length - 1; k >= 0; k--) {
    diffLines.push(tempLines[k])
  }

  const addedLines = diffLines.filter((l) => l.type === "added").length
  const removedLines = diffLines.filter((l) => l.type === "removed").length

  return {
    lines: diffLines,
    leftLines: leftLines.length,
    rightLines: rightLines.length,
    addedLines,
    removedLines,
  }
}

/**
 * Pretty-print JSON if both strings are valid JSON
 */
function tryFormatJson(text: string): string {
  try {
    const parsed = JSON.parse(text)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return text
  }
}

function isValidJson(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

interface DiffViewerProps {
  left: string
  right: string
  leftLabel?: string
  rightLabel?: string
  className?: string
}

export function DiffViewer({
  left,
  right,
  leftLabel = "Left",
  rightLabel = "Right",
  className,
}: DiffViewerProps) {
  const { diff, leftFormatted, rightFormatted } = useMemo(() => {
    const leftFmt = isValidJson(left) ? tryFormatJson(left) : left
    const rightFmt = isValidJson(right) ? tryFormatJson(right) : right
    const diffResult = computeLineDiff(leftFmt, rightFmt)
    return {
      diff: diffResult,
      leftFormatted: leftFmt,
      rightFormatted: rightFmt,
    }
  }, [left, right])

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Summary bar */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-muted/30 text-xs font-medium shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-red-500" />
          <span className="text-muted-foreground">-{diff.removedLines} removed</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-emerald-500" />
          <span className="text-muted-foreground">+{diff.addedLines} added</span>
        </span>
        <span className="text-muted-foreground/60 ml-auto">
          {leftLabel} ({diff.leftLines} lines) vs {rightLabel} ({diff.rightLines} lines)
        </span>
      </div>

      {/* Diff content */}
      <ScrollArea className="flex-1">
        <div className="font-mono text-xs leading-5">
          {diff.lines.map((line, idx) => (
            <div
              key={idx}
              className={cn(
                "flex min-h-[20px] px-4",
                line.type === "added" && "bg-emerald-100/70 text-emerald-900",
                line.type === "removed" && "bg-red-100/70 text-red-900",
                line.type === "unchanged" && "text-muted-foreground/80"
              )}
            >
              <span
                className={cn(
                  "shrink-0 w-6 select-none text-center font-bold",
                  line.type === "added" && "text-emerald-600",
                  line.type === "removed" && "text-red-600",
                  line.type === "unchanged" && "text-muted-foreground/40"
                )}
              >
                {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
              </span>
              <pre className="whitespace-pre-wrap break-all flex-1 py-0 py-0">
                {line.content || " "}
              </pre>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}