"use client"

import { useEffect, useState } from "react"
import { Diff, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"

const STORAGE_KEY = "reqly-graphql-schema-snapshots"

function loadSnapshots(): Record<string, { schema: unknown; savedAt: number }> {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Record<string, { schema: unknown; savedAt: number }>) : {}
  } catch {
    return {}
  }
}

function saveSnapshots(snaps: Record<string, { schema: unknown; savedAt: number }>) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snaps))
  } catch {
    /* ignore quota */
  }
}

interface Props {
  schema?: unknown | null
  endpoint?: string
}

export function GraphqlSchemaDiff({ schema, endpoint }: Props) {
  const [snapshotName, setSnapshotName] = useState("")
  const [snapshots, setSnapshots] = useState<Record<string, { schema: unknown; savedAt: number }>>({})
  const [diffText, setDiffText] = useState<string>("")
  const [diffTarget, setDiffTarget] = useState<string>("")

  useEffect(() => {
    setSnapshots(loadSnapshots())
  }, [])

  const saveSnapshot = () => {
    if (!schema || !snapshotName.trim()) return
    const next = { ...snapshots, [snapshotName]: { schema, savedAt: Date.now() } }
    setSnapshots(next)
    saveSnapshots(next)
    setSnapshotName("")
  }

  const removeSnapshot = (name: string) => {
    const next = { ...snapshots }
    delete next[name]
    setSnapshots(next)
    saveSnapshots(next)
    if (diffTarget === name) {
      setDiffTarget("")
      setDiffText("")
    }
  }

  const computeDiff = () => {
    if (!schema || !diffTarget || !snapshots[diffTarget]) {
      setDiffText("Select a snapshot to compare.")
      return
    }
    const a = JSON.stringify(schema, null, 2)
    const b = JSON.stringify(snapshots[diffTarget].schema, null, 2)
    if (a === b) {
      setDiffText("✅ Schemas are identical.")
    } else {
      const aLines = a.split("\n").length
      const bLines = b.split("\n").length
      setDiffText(
        `⚠️ Schemas differ.\n\n` +
          `Current schema: ${aLines} lines\n` +
          `Snapshot "${diffTarget}": ${bLines} lines\n\n` +
          `Last saved: ${new Date(snapshots[diffTarget].savedAt).toLocaleString()}\n\n` +
          `Open GraphiQL to inspect types side-by-side.`,
      )
    }
  }

  return (
    <div className="border-t bg-card p-2 space-y-2" data-testid="graphql-schema-diff">
      <div className="flex items-center gap-2">
        <input
          value={snapshotName}
          onChange={(e) => setSnapshotName(e.target.value)}
          placeholder="Snapshot name"
          className="flex-1 text-xs px-2 py-1 border rounded bg-background"
          data-testid="graphql-diff-snapshot-name"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={saveSnapshot}
          disabled={!schema || !snapshotName.trim()}
        >
          Save snapshot
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={diffTarget}
          onChange={(e) => setDiffTarget(e.target.value)}
          className="flex-1 text-xs px-2 py-1 border rounded bg-background"
          data-testid="graphql-diff-target"
        >
          <option value="">Choose snapshot…</option>
          {Object.entries(snapshots).map(([name, snap]) => (
            <option key={name} value={name}>
              {name} ({new Date(snap.savedAt).toLocaleDateString()})
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="default"
          className="h-7 text-xs"
          onClick={computeDiff}
          data-testid="graphql-diff-compare"
        >
          <Diff className="w-3 h-3 mr-1" /> Compare
        </Button>
      </div>
      {diffTarget && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-[10px]"
          onClick={() => removeSnapshot(diffTarget)}
        >
          <Trash2 className="w-3 h-3 mr-1" /> Delete snapshot
        </Button>
      )}
      <pre
        className="text-xs font-mono bg-muted/30 p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap"
        data-testid="graphql-diff-output"
      >
        {diffText || "Save snapshots of the current schema, then compare them to detect changes."}
      </pre>
      {endpoint && (
        <p className="text-[10px] text-muted-foreground">
          Endpoint: <span className="font-mono">{endpoint}</span>
        </p>
      )}
    </div>
  )
}
