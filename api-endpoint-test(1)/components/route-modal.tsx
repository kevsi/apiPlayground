import { useState, useCallback } from "react"
import type { SavedProject } from '../types'
import { useRequestStore } from "@/hooks/use-request-store"
import { Layers, CheckCircle } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface RouteModalProps {
  project: SavedProject | null
  open: boolean
  onClose: () => void
}

export function RouteModal({ project, open, onClose }: RouteModalProps) {
  const [filter, setFilter] = useState("")
  const [creating, setCreating] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const { addCollection, addRequestToCollection } = useRequestStore()

  if (!project) return null

  const handleCreateCollection = useCallback(async () => {
    setCreating(true)
    setCreatedId(null)
    try {
      const baseUrl = `http://localhost:${project.port ?? 3000}`
      const colName = `Collection ${project.framework} · ${project.name}`
      // 1. Create the collection
      const colId = addCollection({
        name: colName,
        description: `${project.routes.length} routes détectées dans « ${project.name} »`,
        color: "emerald",
        icon: "package",
      })
      setCreatedId(colId)
      // 2. Add each route as a request item (don't block UI)
      const added: string[] = []
      for (const route of project.routes) {
        addRequestToCollection(colId, {
          name: `${route.method} ${route.path}`,
          method: route.method as any,
          url: `${baseUrl}${route.path}`,
          endpoint: route.path,
          headers: {},
        })
        added.push(`${route.method} ${route.path}`)
      }
      toast.success(`${added.length} requête(s) ajoutée(s) à la collection « ${colName} » (port ${project.port ?? 3000})`)
    } catch (err) {
      toast.error(`Erreur : ${String(err)}`)
      setCreatedId(null)
    } finally {
      setCreating(false)
    }
  }, [project, addCollection, addRequestToCollection])

  const filtered = filter
    ? project.routes.filter((r) =>
        r.path.toLowerCase().includes(filter.toLowerCase()) ||
        r.method.toLowerCase().includes(filter.toLowerCase())
      )
    : project.routes

  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="absolute inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
        <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl border border-border bg-background shadow-2xl">
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border bg-background/95 p-5 backdrop-blur">
            <div>
              <h2 className="text-xl font-semibold">{project.name}</h2>
              <p className="text-sm text-muted-foreground">{project.framework} · {project.routes.length} routes{project.port ? ` · Port ${project.port}` : ""}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCreateCollection}
                disabled={creating || project.routes.length === 0}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                  createdId
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 cursor-default"
                    : "border-border bg-background text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
                )}
                title={createdId ? "Collection déjà créée" : "Créer une collection avec toutes les routes détectées"}
              >
                {creating ? (
                  <><CheckCircle className="size-3.5 animate-pulse" /> Création…</>
                ) : createdId ? (
                  <><CheckCircle className="size-3.5" /> Collection créée</>
                ) : (
                  <><Layers className="size-3.5" /> Créer collection</>
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-border bg-muted px-3 py-1 text-sm font-medium text-foreground hover:bg-accent transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Confirmation banner */}
            {createdId && (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">
                <CheckCircle className="size-4 shrink-0" />
                <span>
                  <strong>Collection créée</strong> avec {project.routes.length} requête(s) sur <strong>localhost:{project.port ?? 3000}</strong>.
                  Ouvrez le panneau <strong>Collections</strong> pour la retrouver.
                </span>
              </div>
            )}

            {/* Filter */}
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Filtrer les routes…"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />

            {/* Routes */}
            {filtered.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground text-center">
                Aucune route trouvée.
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((route) => (
                  <div key={`${route.method}-${route.path}`} className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold uppercase text-primary">
                        {route.method}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">{route.sourceFile}</span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{route.name || route.path}</p>
                    <code className="text-sm text-muted-foreground">{route.path}</code>
                    <p className="mt-2 text-sm">{route.description || 'Pas de description fournie.'}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-muted px-2 py-1">Body: {route.bodyType}</span>
                      <span className="rounded-full bg-muted px-2 py-1">Auth: {route.authRequired ? 'Oui' : 'Non'}</span>
                      {route.headers?.length ? <span className="rounded-full bg-muted px-2 py-1">{route.headers.length} headers</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            )
            }
          </div>
        </div>
      </div>
    </div>
  )
}
