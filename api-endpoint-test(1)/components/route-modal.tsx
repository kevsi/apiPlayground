import { useState, useCallback } from "react"
import type { SavedProject } from '../types'
import { useRequestStore } from "@/hooks/use-request-store"
import { Layers, CheckCircle, Copy } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface RouteModalProps {
  project: SavedProject | null
  open: boolean
  onClose: () => void
}

export function RouteModal({ project, open, onClose }: RouteModalProps) {
  const [filter, setFilter] = useState("")
  const [methodFilter, setMethodFilter] = useState<"all" | "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OTHER">("all")
  const [bodyTypeFilter, setBodyTypeFilter] = useState<"all" | "json" | "form" | "none">("all")
  const [authOnly, setAuthOnly] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const { addCollection, addRequestToCollection } = useRequestStore()

  const handleCreateCollection = useCallback(async () => {
    if (!project) return
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
      toast({ title: `${added.length} requête(s) ajoutée(s) à la collection « ${colName} » (port ${project.port ?? 3000})`, meta: { event: "collectionComplete" } } as any)
    } catch (err) {
      toast({ title: `Erreur : ${String(err)}`, variant: "destructive" })
      setCreatedId(null)
    } finally {
      setCreating(false)
    }
  }, [project, addCollection, addRequestToCollection])

  if (!project) return null

  const filtered = project.routes
    .filter((r) => {
      if (methodFilter === "all") return true
      if (methodFilter === "OTHER") return !["GET", "POST", "PUT", "DELETE", "PATCH"].includes(r.method)
      return r.method === methodFilter
    })
    .filter((r) => bodyTypeFilter === "all" || r.bodyType === bodyTypeFilter)
    .filter((r) => !authOnly || r.authRequired)
    .filter((r) => {
      if (!filter) return true
      const term = filter.toLowerCase()
      return (
        r.path.toLowerCase().includes(term) ||
        r.method.toLowerCase().includes(term) ||
        (r.name?.toLowerCase() ?? "").includes(term) ||
        (r.description?.toLowerCase() ?? "").includes(term) ||
        (r.sourceFile?.toLowerCase() ?? "").includes(term)
      )
    })

  const handleCopyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast({ title: `${label} copié`, description: text, meta: { event: "copy" } } as any)
    } catch (err) {
      toast({ title: `Impossible de copier ${label}`, variant: "destructive" })
    }
  }, [])

  const handleCopyAllRoutes = useCallback(async () => {
    const text = filtered.map(route => `${route.method} ${route.path}`).join("\n")
    if (!text) {
      toast({ title: "Aucune route à copier", variant: "destructive" })
      return
    }
    await handleCopyText(text, "Toutes les routes")
  }, [filtered, handleCopyText])

  const handleCopyRoute = useCallback(async (routePath: string) => {
    await handleCopyText(routePath, "Chemin de la route")
  }, [handleCopyText])

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="absolute inset-0 z-50 flex items-center justify-center p-4" onClick={e => e.stopPropagation()}>
        <div className="w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-3xl border border-border bg-card shadow-2xl flex flex-col">
          {/* Header */}
          <div className="flex-none border-b border-border bg-card/95 p-4 backdrop-blur">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">{project.name}</h2>
              <p className="text-sm text-muted-foreground">{project.framework} · {project.routes.length} routes{project.port ? ` · Port ${project.port}` : ""}</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">{project.framework} · {project.routes.length} routes{project.port ? ` · Port ${project.port}` : ""}</p>
                <p className="text-xs text-muted-foreground">Affichage de {filtered.length} route(s) après filtre</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyAllRoutes}
                  disabled={filtered.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Copy className="size-3.5" /> Copier toutes
                </button>
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
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
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
            <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
              <Input
                value={filter}
                onChange={e => setFilter(e.target.value)}
                placeholder="Filtrer les routes…"
                className="w-full"
              />
              <button
                type="button"
                onClick={() => setFilter("")}
                className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-background px-4 text-sm text-foreground transition hover:bg-muted"
              >
                Réinitialiser
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">Méthode</label>
                <Select value={methodFilter} onValueChange={(value) => setMethodFilter(value as typeof methodFilter)}>
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue placeholder="Toutes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="DELETE">DELETE</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                    <SelectItem value="OTHER">Autres</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">Body type</label>
                <Select value={bodyTypeFilter} onValueChange={(value) => setBodyTypeFilter(value as typeof bodyTypeFilter)}>
                  <SelectTrigger className="w-full" size="sm">
                    <SelectValue placeholder="Tous" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="json">JSON</SelectItem>
                    <SelectItem value="form">Form</SelectItem>
                    <SelectItem value="none">Aucun</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-2 block text-xs font-medium text-muted-foreground">Authentification</label>
                <button
                  type="button"
                  onClick={() => setAuthOnly((prev) => !prev)}
                  className={cn(
                    "inline-flex h-10 w-full items-center justify-center rounded-md border px-3 text-sm font-medium transition",
                    authOnly
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-foreground hover:bg-muted"
                  )}
                >
                  {authOnly ? "Uniquement auth" : "Tous"}
                </button>
              </div>
            </div>

            {/* Routes */}
            {filtered.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground text-center">
                Aucune route trouvée.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {filtered.map((route) => (
                  <div key={`${route.method}-${route.path}`} className="rounded-3xl border border-border bg-card p-3 shadow-sm transition-colors hover:bg-muted/80">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                          route.method === "GET" ? "bg-emerald-100 text-emerald-700" :
                          route.method === "POST" ? "bg-blue-100 text-blue-700" :
                          route.method === "PUT" ? "bg-amber-100 text-amber-700" :
                          route.method === "DELETE" ? "bg-red-100 text-red-700" :
                          "bg-slate-100 text-slate-700"
                        )}>
                          {route.method}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">{route.sourceFile}</span>
                      </div>
                      <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{route.bodyType ? `Body: ${route.bodyType}` : "Body: N/A"}</span>
                    </div>
                    <p className="text-base font-semibold text-foreground truncate">{route.name || route.path}</p>
                    <div className="mt-2 rounded-2xl bg-muted px-3 py-2 text-sm text-muted-foreground">
                      {route.path}
                    </div>
                    {route.description ? (
                      <p className="mt-3 text-sm text-foreground">{route.description}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span className="rounded-full bg-muted px-2 py-1">Body: {route.bodyType}</span>
                      <span className={cn(
                        "rounded-full px-2 py-1 text-xs font-semibold",
                        route.authRequired ? "bg-emerald-100 text-emerald-700" : "bg-muted"
                      )}>
                        Protégé: {route.authRequired ? 'Oui' : 'Non'}
                      </span>
                      {/(?:login|register|signin|signup|auth|logout|session)/i.test(route.path) ? (
                        <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">Route auth</span>
                      ) : null}
                      {route.headers?.length ? <span className="rounded-full bg-muted px-2 py-1">{route.headers.length} header(s)</span> : null}
                      <button
                        type="button"
                        onClick={() => handleCopyRoute(route.path)}
                        className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted"
                      >
                        <Copy className="size-3" /> Copier
                      </button>
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
