"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { useRequestStore } from "@/hooks/use-request-store"

interface ExtractedRequest {
  id: string
  name: string
  method: string
  url: string
  endpoint: string
  headers: Record<string, string>
  body: string
  bodyType: "none" | "json" | "text" | "form"
  queryParams: Array<{ key: string; value: string }>
  folderId: string | null
  createdAt: string
  updatedAt: string
}

interface PostmanImportModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  collectionId: string | null
  collectionName: string
  onImported?: (collectionId: string) => void
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  POST: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  PUT: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  PATCH: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  DELETE: "bg-red-500/15 text-red-700 dark:text-red-300",
}

export function PostmanImportModal({
  open,
  onOpenChange,
  collectionId,
  collectionName,
  onImported,
}: PostmanImportModalProps) {
  const { toast } = useToast()
  const [preview, setPreview] = useState<ExtractedRequest[]>([])
  const [collectionIdReturned, setCollectionIdReturned] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { addCollection, addRequestToCollection } = useRequestStore()

  useEffect(() => {
    if (!open || !collectionId) {
      setPreview([])
      setCollectionIdReturned("")
      setError(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch("/api/postman-import/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ collectionId }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        if (!data.requests) {
          setError(data.message ?? "Réponse invalide")
          return
        }
        setPreview(data.requests.slice(0, 3))
        setCollectionIdReturned(data.collectionId ?? collectionId)
      })
      .catch(() => {
        if (!cancelled) setError("Erreur réseau")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, collectionId])

  function handleConfirm() {
    if (preview.length === 0 || saving) return
    setSaving(true)
    try {
      const newCollectionId = addCollection({
        name: collectionName,
        color: "emerald",
        icon: "package",
      })
      preview.forEach((req) => {
        addRequestToCollection(newCollectionId, {
          name: req.name,
          method: req.method as any,
          url: req.url,
          endpoint: req.endpoint,
          headers: req.headers,
          body: req.body,
          bodyType: req.bodyType as any,
          queryParams: req.queryParams,
          folderId: req.folderId,
        })
      })
      toast({
        title: "Importé",
        description: `${preview.length} route${preview.length > 1 ? "s" : ""} ajoutée${preview.length > 1 ? "s" : ""} à votre bibliothèque.`,
      })
      onImported?.(newCollectionId)
      onOpenChange(false)
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Import échoué",
        variant: "destructive",
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importer "{collectionName}"</DialogTitle>
          <DialogDescription>
            {loading
              ? "Chargement de l'aperçu…"
              : error
              ? error
              : preview.length > 0
              ? `${preview.length === 3 ? "3+" : preview.length} route${preview.length > 1 ? "s" : ""} (aperçu des 3 premières).`
              : "Aucune route à importer."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : preview.length > 0 ? (
          <div className="space-y-1">
            {preview.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded border bg-muted/20 p-2 text-sm">
                <Badge variant="secondary" className={`shrink-0 ${METHOD_COLORS[r.method] ?? ""}`}>
                  {r.method}
                </Badge>
                <code className="min-w-0 flex-1 truncate font-mono text-xs">{r.url}</code>
              </div>
            ))}
            <p className="pt-1 text-center text-xs text-muted-foreground">
              Collection Postman ID: <span className="font-mono">{collectionIdReturned}</span>
            </p>
          </div>
        ) : null}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleConfirm} disabled={loading || saving || preview.length === 0}>
            {saving ? "Importation…" : "Confirmer l'import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
