"use client"

import { Cloud, CloudOff, RefreshCw, ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import { useSync } from "@/hooks/use-sync"

interface SyncSectionProps {
  onOpenSyncModal: () => void
}

export default function SyncSection({ onOpenSyncModal }: SyncSectionProps) {
  const {
    state,
    lastSyncAt,
    pendingCount,
    isEnabled,
    isAuthenticated,
    setEnabled,
    forceSync,
  } = useSync()

  const relativeTime = lastSyncAt
    ? new Date(lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "Jamais"

  return (
    <div className="space-y-6">
      {/* Cloud Sync */}
      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
              <Cloud className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Synchronisation cloud</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Synchronisez automatiquement vos données entre appareils via Supabase.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                  state === "synced" ? "bg-emerald-100 text-emerald-800" :
                  state === "syncing" ? "bg-blue-100 text-blue-800" :
                  state === "error" ? "bg-destructive/10 text-destructive" :
                  "bg-slate-100 text-slate-700"
                )}>
                  {state === "synced" ? "Synchronisé" :
                   state === "syncing" ? "Synchronisation…" :
                   state === "error" ? "Erreur" :
                   state === "offline" ? "Hors ligne" : "Inactif"}
                </span>
                <span>Dernière sync : {relativeTime}</span>
                {pendingCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                    {pendingCount} en attente
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Switch
              checked={isEnabled}
              onCheckedChange={setEnabled}
              disabled={!isAuthenticated}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={!isEnabled || !isAuthenticated || state === "syncing"}
              onClick={forceSync}
              className="flex items-center gap-2"
            >
              <RefreshCw className={cn("size-4", state === "syncing" && "animate-spin")} />
              Sync maintenant
            </Button>
          </div>
        </div>
        {!isAuthenticated && (
          <div className="mt-4 rounded-2xl bg-muted p-3 text-sm text-muted-foreground">
            Connectez-vous à votre compte pour activer la synchronisation cloud.
          </div>
        )}
      </section>

      {/* Import / Export */}
      <section className="rounded-3xl border border-border bg-card p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
              <ArrowUpDown className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Import / Export</h2>
              <p className="mt-0.5 text-sm text-muted-foreground">Exportez et importez vos collections et environnements.</p>
            </div>
          </div>
          <Button onClick={onOpenSyncModal} className="shrink-0 flex items-center gap-2">
            Import / Export
          </Button>
        </div>
      </section>
    </div>
  )
}
