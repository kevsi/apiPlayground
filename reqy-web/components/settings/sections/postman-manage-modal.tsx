"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import type { AuthUser } from "@/hooks/use-auth"

interface Collection {
  id: string
  name: string
  requests: number
  items: number
}

interface PostmanManageModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AuthUser | null
  onDisconnected?: () => void
  onSelectCollection: (collection: Collection) => void
}

export function PostmanManageModal({
  open,
  onOpenChange,
  user,
  onDisconnected,
  onSelectCollection,
}: PostmanManageModalProps) {
  const { toast } = useToast()
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [bulkImporting, setBulkImporting] = useState(false)
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null)

  // Guard contre les fetches en double (React Strict Mode dev + remounts rapides)
  const fetchedForOpenRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const fetchCollections = useCallback(async () => {
    // Annule la requête précédente si toujours en vol
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/postman-auth/collections", {
        credentials: "include",
        signal: controller.signal,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message ?? "Erreur de chargement")
        return
      }
      setCollections(data.collections ?? [])
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      setError("Erreur réseau")
    } finally {
      if (abortRef.current === controller) {
        setLoading(false)
        abortRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (open && !fetchedForOpenRef.current) {
      fetchedForOpenRef.current = true
      void fetchCollections()
    } else if (!open) {
      // Reset le guard pour la prochaine ouverture + annule tout en vol
      fetchedForOpenRef.current = false
      abortRef.current?.abort()
      abortRef.current = null
    }
    // Cleanup final quand le composant unmount
    return () => {
      abortRef.current?.abort()
    }
  }, [open, fetchCollections])

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      await fetch("/api/postman-auth", { method: "DELETE", credentials: "include" })
      toast({ title: "Déconnecté", description: "Postman a été déconnecté." })
      onDisconnected?.()
      onOpenChange(false)
    } catch {
      toast({ title: "Erreur", description: "Impossible de déconnecter", variant: "destructive" })
    } finally {
      setDisconnecting(false)
    }
  }

  async function handleBulkImport() {
    setBulkImporting(true)
    setBulkProgress({ current: 0, total: collections.length })
    let success = 0
    let failed = 0
    for (let i = 0; i < collections.length; i++) {
      setBulkProgress({ current: i + 1, total: collections.length })
      try {
        const res = await fetch("/api/postman-import/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ collectionId: collections[i].id }),
        })
        if (res.ok) success++
        else failed++
      } catch {
        failed++
      }
    }
    setBulkImporting(false)
    setBulkProgress(null)
    toast({
      title: "Import terminé",
      description: `${success}/${collections.length} collection${success > 1 ? "s" : ""} préparée${success > 1 ? "s" : ""}${failed ? `, ${failed} échouée${failed > 1 ? "s" : ""}` : ""}.`,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-3">
            <span>Connecté à Postman</span>
            {user?.email && (
              <span className="truncate text-xs font-normal text-muted-foreground">{user.email}</span>
            )}
          </DialogTitle>
          <DialogDescription>
            {collections.length > 0
              ? `${collections.length} collection${collections.length > 1 ? "s" : ""} trouvée${collections.length > 1 ? "s" : ""} dans votre compte Postman.`
              : "Chargement des collections…"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[200px]">
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p className="text-destructive">{error}</p>
              <Button size="sm" variant="outline" className="mt-2" onClick={fetchCollections}>
                Réessayer
              </Button>
            </div>
          ) : collections.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Aucune collection dans votre compte Postman.
            </p>
          ) : (
            <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
              {collections.map((col) => (
                <Card key={col.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{col.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {col.requests} requête{col.requests > 1 ? "s" : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onSelectCollection(col)}>
                    Importer
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? "Déconnexion…" : "Déconnecter"}
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Fermer
            </Button>
            {collections.length > 0 && (
              <Button onClick={handleBulkImport} disabled={bulkImporting}>
                {bulkImporting && bulkProgress
                  ? `[${bulkProgress.current}/${bulkProgress.total}] Importation…`
                  : `Importer toutes (${collections.length})`}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
