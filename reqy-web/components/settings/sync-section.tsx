"use client"

import { Button } from "@/components/ui/button"

interface SyncSectionProps {
  onOpenSyncModal: () => void
}

export default function SyncSection({ onOpenSyncModal }: SyncSectionProps) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <svg className="size-5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Sync d'équipe</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Exportez et importez vos collections et environnements.</p>
          </div>
        </div>
        <Button onClick={onOpenSyncModal} className="shrink-0 flex items-center gap-2">
          Import / Export
        </Button>
      </div>
    </section>
  )
}
