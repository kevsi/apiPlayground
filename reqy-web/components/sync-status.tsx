"use client"

import { useState } from "react"
import { Cloud, CloudOff, CloudCog, AlertTriangle, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSync } from "@/hooks/use-sync"
import { SyncConflictModal } from "./sync-conflict-modal"

function StatusIcon({ state, pendingCount }: { state: string; pendingCount: number }) {
  if (pendingCount > 0) return <CloudCog className="size-4 animate-pulse text-amber-500" />
  switch (state) {
    case "synced":
      return <CheckCircle2 className="size-4 text-emerald-500" />
    case "syncing":
      return <Cloud className="size-4 animate-pulse text-blue-500" />
    case "offline":
      return <CloudOff className="size-4 text-slate-400" />
    case "error":
      return <AlertTriangle className="size-4 text-destructive" />
    default:
      return <Cloud className="size-4 text-slate-400" />
  }
}

function StatusLabel({ state, pendingCount }: { state: string; pendingCount: number }) {
  if (pendingCount > 0) return <span className="text-amber-600">{pendingCount} en attente</span>
  switch (state) {
    case "synced":
      return <span className="text-emerald-600">Synchronisé</span>
    case "syncing":
      return <span className="text-blue-600">Synchronisation…</span>
    case "offline":
      return <span className="text-slate-500">Hors ligne</span>
    case "error":
      return <span className="text-destructive">Erreur</span>
    default:
      return <span className="text-slate-500">—</span>
  }
}

export function SyncStatus() {
  const {
    state,
    conflicts,
    pendingCount,
    lastSyncAt,
    isEnabled,
    isAuthenticated,
    setEnabled,
    forceSync,
    resolveConflict,
  } = useSync()

  const [showConflictModal, setShowConflictModal] = useState(false)

  const hasConflicts = conflicts.length > 0
  const relativeTime = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—"

  return (
    <div className="flex items-center gap-2">
      {hasConflicts && (
        <button
          type="button"
          onClick={() => setShowConflictModal(true)}
          className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:bg-amber-200 transition-colors"
          title={`${conflicts.length} conflit${conflicts.length > 1 ? "s" : ""} à résoudre`}
        >
          <AlertTriangle className="size-3" />
          {conflicts.length}
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          if (!isEnabled) return
          if (isAuthenticated) {
            forceSync()
          } else {
            window.location.href = "/settings#account"
          }
        }}
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
          state === "error"
            ? "border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20"
            : state === "synced"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
              : state === "syncing"
                ? "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
                : state === "offline"
                  ? "border-slate-200 bg-slate-100 text-slate-700 hover:bg-slate-200"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
        )}
        title={!isEnabled ? "Sync désactivée" : !isAuthenticated ? "Connectez-vous pour synchroniser" : `Dernière sync : ${relativeTime}`}
      >
        <StatusIcon state={state} pendingCount={pendingCount} />
        <span className="hidden sm:inline"><StatusLabel state={state} pendingCount={pendingCount} /></span>
      </button>

      {showConflictModal && (
        <SyncConflictModal
          conflicts={conflicts}
          onResolve={resolveConflict}
          onClose={() => setShowConflictModal(false)}
        />
      )}
    </div>
  )
}
