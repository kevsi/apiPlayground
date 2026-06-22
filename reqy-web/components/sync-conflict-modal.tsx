"use client"

import { useState } from "react"
import { X, ArrowDownToLine, ArrowUpFromLine, AlertTriangle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ConflictItem } from "@/lib/sync-types"

interface SyncConflictModalProps {
  conflicts: ConflictItem[]
  onResolve: (conflict: ConflictItem, resolution: "local" | "remote") => Promise<void>
  onClose: () => void
}

export function SyncConflictModal({ conflicts, onResolve, onClose }: SyncConflictModalProps) {
  const [resolving, setResolving] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)

  const active = conflicts[activeIndex]
  if (!active) {
    onClose()
    return null
  }

  const handleResolve = async (resolution: "local" | "remote") => {
    setResolving(active.id)
    try {
      await onResolve(active, resolution)
    } finally {
      setResolving(null)
    }
  }

  const typeLabels: Record<string, string> = {
    collection: "Collection",
    environment: "Environnement",
    history: "Historique",
    variableMapping: "Mapping de variable",
    project: "Projet",
    workspace: "Workspace",
    mockRoute: "Route mock",
    mockServer: "Serveur mock",
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader className="flex flex-row items-start justify-between">
          <div>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              Conflit de synchronisation
            </DialogTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Conflit {activeIndex + 1} sur {conflicts.length} — {typeLabels[active.itemType] || active.itemType} : {" "}
              <span className="font-mono text-xs">{active.itemId}</span>
            </p>
          </div>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-muted p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-blue-600">
                <ArrowUpFromLine className="size-4" />
                Version locale
              </div>
              <pre className="max-h-48 overflow-auto rounded-xl bg-background p-3 text-xs text-muted-foreground">
                {JSON.stringify(active.localPayload.data, null, 2)}
              </pre>
              <p className="mt-2 text-xs text-muted-foreground">
                Modifiée le {new Date(active.localPayload.updatedAt).toLocaleString()}
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-muted p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-600">
                <ArrowDownToLine className="size-4" />
                Version distante
              </div>
              <pre className="max-h-48 overflow-auto rounded-xl bg-background p-3 text-xs text-muted-foreground">
                {JSON.stringify(active.remotePayload.data, null, 2)}
              </pre>
              <p className="mt-2 text-xs text-muted-foreground">
                Modifiée le {new Date(active.remotePayload.updatedAt).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={resolving === active.id || activeIndex === 0}
                onClick={() => setActiveIndex((i) => Math.max(0, i - 1))}
              >
                Précédent
              </Button>
              <Button
                variant="outline"
                disabled={resolving === active.id || activeIndex >= conflicts.length - 1}
                onClick={() => setActiveIndex((i) => Math.min(conflicts.length - 1, i + 1))}
              >
                Suivant
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                disabled={resolving === active.id}
                onClick={() => handleResolve("local")}
              >
                Garder la locale
              </Button>
              <Button
                disabled={resolving === active.id}
                onClick={() => handleResolve("remote")}
              >
                Garder la distante
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
