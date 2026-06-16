"use client"

import { useState, useMemo } from "react"
import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { useSidebar } from "@/contexts/sidebar-context"
import { cn } from "@/lib/utils"
import { useMockStore } from "@/hooks/use-mock-store"
import type { MockRoute } from "@/lib/mock-types"
import { useRequestStore, type Collection } from "@/hooks/use-request-store"
import { MockRouteEditor, type MockRouteFormData } from "@/components/mock-route-editor"
import { Play, Plus, MoreHorizontal, Edit2, Trash2, Copy, Power, PowerOff, FlaskConical, Folder, Search, ToggleLeft, ToggleRight } from "lucide-react"
import { toast } from "@/hooks/use-toast"

const methodBadge: Record<string, string> = {
  GET: "bg-emerald-500 text-white",
  POST: "bg-blue-500 text-white",
  PUT: "bg-amber-500 text-white",
  PATCH: "bg-purple-500 text-white",
  DELETE: "bg-red-500 text-white",
}

interface TestResultData {
  status: number
  body: string
  headers: { key: string; value: string }[]
  url: string
  method: string
}

export default function MocksPage() {
  const { isCollapsed, toggleSidebar } = useSidebar()
  const mockStore = useMockStore()
  const { collections, history, isLoaded: storeLoaded, activeWorkspaceId } = useRequestStore()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingRoute, setEditingRoute] = useState<MockRoute | null>(null)
  const [generatingOpen, setGeneratingOpen] = useState(false)
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("")
  const [testUrl, setTestUrl] = useState("")
  const [testResult, setTestResult] = useState<TestResultData | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [logsOpen, setLogsOpen] = useState(false)

  const wsId = activeWorkspaceId ?? "ws-personal"

  const filteredRoutes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    const wsRoutes = mockStore.routes.filter((r) => r.workspaceId === wsId)
    if (!q) return wsRoutes
    return wsRoutes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.pathPattern.toLowerCase().includes(q) ||
        r.method.toLowerCase().includes(q)
    )
  }, [searchQuery, mockStore.routes, wsId])

  const handleNewRoute = () => {
    setEditingRoute(null)
    setEditorOpen(true)
  }

  const handleEditRoute = (route: MockRoute) => {
    setEditingRoute(route)
    setEditorOpen(true)
  }

  const handleSaveRoute = (data: MockRouteFormData) => {
    if (editingRoute) {
      mockStore.updateRoute(editingRoute.id, data)
      toast({ title: `Route "${data.name}" mise à jour.` })
    } else {
      mockStore.addRoute({ ...data, workspaceId: activeWorkspaceId ?? "ws-personal" })
      toast({ title: `Route "${data.name}" créée.` })
    }
    setEditorOpen(false)
    setEditingRoute(null)
  }

  const handleDuplicateRoute = (route: MockRoute) => {
    const { id, createdAt, updatedAt, workspaceId: _, ...rest } = route
    mockStore.addRoute({ ...rest, workspaceId: activeWorkspaceId ?? "ws-personal", name: `${rest.name} (copie)` })
    toast({ title: `Route dupliquée.` })
  }

  const handleGenerateFromCollection = () => {
    if (!selectedCollectionId) return
    const collection = collections.find((c) => c.id === selectedCollectionId)
    if (!collection) return
    const count = mockStore.generateFromCollection(collection, history).length
    toast({ title: `${count} routes mock générées depuis "${collection.name}".` })
    setGeneratingOpen(false)
    setSelectedCollectionId("")
  }

  const handleTestMock = async (route: MockRoute) => {
    const url = `/api/mock${route.pathPattern.startsWith("/") ? "" : "/"}${route.pathPattern}`
    setTestUrl(url)
    try {
      const res = await fetch(url, { method: route.method })
      const body = await res.text()
      const headers: { key: string; value: string }[] = []
      res.headers.forEach((v, k) => { headers.push({ key: k, value: v }) })
      setTestResult({ status: res.status, body, headers, url, method: route.method })
    } catch (err) {
      setTestResult({
        status: 0,
        body: String(err),
        headers: [],
        url,
        method: route.method,
      })
    }
  }

  const serverBaseUrl = typeof window !== "undefined" ? window.location.origin : ""

  function RouteRow({ route, onTest, onEdit, onDuplicate }: {
    route: MockRoute
    onTest: (r: MockRoute) => void
    onEdit: (r: MockRoute) => void
    onDuplicate: (r: MockRoute) => void
  }) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 px-4 py-3 transition-colors",
          !route.enabled && "opacity-50"
        )}
      >
        {/* Enable toggle */}
        <div className="flex items-center gap-2">
          <Switch
            checked={route.enabled}
            onCheckedChange={() => mockStore.toggleRoute(route.id)}
            className={cn(
              route.enabled ? "data-[state=checked]:bg-emerald-500" : "data-[state=unchecked]:bg-slate-300"
            )}
            aria-label={route.enabled ? "Désactiver cette route" : "Activer cette route"}
          />
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {route.enabled ? "Actif" : "Inactif"}
          </span>
        </div>

        {/* Method badge */}
        <span className={cn(
          "inline-flex shrink-0 items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none w-12",
          methodBadge[route.method] || "bg-slate-500 text-white"
        )}>
          {route.method}
        </span>

        {/* Path pattern */}
        <span className="flex-1 truncate font-mono text-sm">
          {route.pathPattern}
        </span>

        {/* Status + delay */}
        <span className="shrink-0 text-xs text-muted-foreground hidden sm:inline">
          {route.responseStatus}
          {route.delay > 0 && ` · ${route.delay}ms`}
        </span>

        {/* Name */}
        <span className="shrink-0 text-xs text-muted-foreground max-w-[120px] truncate hidden md:inline">
          {route.name}
        </span>

        {/* Rate limit & variant badges */}
        <div className="shrink-0 flex items-center gap-1 hidden lg:flex">
          {route.rateLimit?.enabled && (
            <span className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 border border-amber-200" title={`${route.rateLimit.maxRequests} req / ${route.rateLimit.windowSeconds}s`}>
              <span className="font-bold">{route.rateLimit.maxRequests}</span>/<span>{route.rateLimit.windowSeconds}s</span>
            </span>
          )}
          {route.variants && route.variants.length > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 border border-purple-200" title={`${route.variants.length} variantes de scénario`}>
              {route.variants.length} scénario{route.variants.length > 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-7">
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onTest(route)}>
              <Play className="size-3.5 mr-2" /> Tester
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(route)}>
              <Edit2 className="size-3.5 mr-2" /> Modifier
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDuplicate(route)}>
              <Copy className="size-3.5 mr-2" /> Dupliquer
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onClick={() => mockStore.deleteRoute(route.id)}
            >
              <Trash2 className="size-3.5 mr-2" /> Supprimer
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background bg-dot-pattern">
      <ApiSidebar activePage="mocks" collapsed={isCollapsed} onCollapse={toggleSidebar} />
      <div className={cn(
        "flex flex-1 flex-col overflow-hidden transition-[margin] duration-200 ease-out",
        isCollapsed ? "ml-[60px]" : "ml-64",
        "max-[916px]:ml-[60px]"
      )}>
        <ApiHeader />
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Info card */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FlaskConical className="size-5 text-primary" />
                  <span className="font-semibold">Mock Server</span>
                </div>
                <div className="flex items-center gap-3">
                    <Button size="sm" onClick={mockStore.toggleGlobal} variant={mockStore.enabledGlobally ? "default" : "outline"}>
                      {mockStore.enabledGlobally ? <ToggleRight className="size-4 mr-2" /> : <ToggleLeft className="size-4 mr-2" />}
                      {mockStore.enabledGlobally ? "Mocks activés" : "Mocks désactivés"}
                    </Button>
                  <Badge variant="secondary">
                    {serverBaseUrl}/api/mock/
                  </Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Envoyez vos requêtes vers <code className="rounded bg-muted px-1 py-0.5 text-xs">{serverBaseUrl}/api/mock/&lt;chemin&gt;</code> pour obtenir des réponses simulées.
                Les routes activées sont servies immédiatement.
              </p>
            </div>

            {/* Actions bar + search */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleNewRoute}>
                  <Plus className="size-3.5 mr-1" />
                  Nouvelle route
                </Button>
                <Button size="sm" variant="outline" onClick={() => setGeneratingOpen(true)}>
                  <Copy className="size-3.5 mr-1" />
                  Depuis une collection
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
                  <input
                    type="text"
                    placeholder="Filtrer par nom, chemin, méthode..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-8 w-52 rounded-lg border border-input bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <p className="text-xs text-muted-foreground whitespace-nowrap">
                  {filteredRoutes.length} / {mockStore.routes.length} route{mockStore.routes.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            {/* Routes list — grouped by collection */}
            {(() => {
              if (filteredRoutes.length === 0) {
                return (
                  <div className="rounded-xl border border-dashed border-border p-12 text-center">
                    <FlaskConical className="mx-auto size-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {searchQuery ? "Aucune route ne correspond à votre recherche." : "Aucune route mock pour le moment."}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Créez une route manuellement ou générez-la depuis une collection.
                    </p>
                  </div>
                )
              }

              // Group routes by collectionId
              const groups = new Map<string, { label: string; routes: typeof filteredRoutes }>()
              const ungrouped: typeof filteredRoutes = []

              for (const route of filteredRoutes) {
                if (route.collectionId && route.collectionName) {
                  const existing = groups.get(route.collectionId)
                  if (existing) {
                    existing.routes.push(route)
                  } else {
                    groups.set(route.collectionId, { label: route.collectionName, routes: [route] })
                  }
                } else {
                  ungrouped.push(route)
                }
              }

              return (
                <div className="space-y-6">
                  {Array.from(groups.entries()).map(([collId, group]) => (
                    <div key={collId}>
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <Folder className="size-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          {group.label}
                        </span>
                        <span className="text-xs text-muted-foreground/50">({group.routes.length})</span>
                      </div>
                      <div className="rounded-xl border border-border divide-y overflow-hidden">
                        {group.routes.map((route) => (
                          <RouteRow key={route.id} route={route} onTest={handleTestMock} onEdit={handleEditRoute} onDuplicate={handleDuplicateRoute} />
                        ))}
                      </div>
                    </div>
                  ))}

                  {ungrouped.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                          Routes libres
                        </span>
                        <span className="text-xs text-muted-foreground/50">({ungrouped.length})</span>
                      </div>
                      <div className="rounded-xl border border-border divide-y overflow-hidden">
                        {ungrouped.map((route) => (
                          <RouteRow key={route.id} route={route} onTest={handleTestMock} onEdit={handleEditRoute} onDuplicate={handleDuplicateRoute} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Log viewer */}
            <div className="rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setLogsOpen(!logsOpen)}
                className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">
                    Journal des requêtes mock
                  </span>
                  <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {mockStore.mockLogs.length}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {logsOpen ? "Réduire" : "Déplier"}
                </span>
              </button>
              {logsOpen && (
                <div className="border-t divide-y max-h-[240px] overflow-y-auto">
                  {mockStore.mockLogs.length === 0 ? (
                    <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                      Aucune requête mock enregistrée pour l&apos;instant.
                    </div>
                  ) : (
                    [...mockStore.mockLogs].reverse().map((entry, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2 text-xs">
                        <span className="shrink-0 text-[10px] text-muted-foreground font-mono w-16 text-right">
                          {new Date(entry.timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                        <span className={cn(
                          "inline-flex shrink-0 items-center justify-center rounded px-1 py-0.5 text-[10px] font-bold leading-none w-10",
                          methodBadge[entry.method] || "bg-slate-500 text-white"
                        )}>
                          {entry.method}
                        </span>
                        <span className="flex-1 truncate font-mono text-muted-foreground">
                          {entry.path}
                        </span>
                        <span className="shrink-0 font-mono">
                          <span className={cn(
                            "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold",
                            entry.responseStatus >= 200 && entry.responseStatus < 300 && "bg-emerald-100 text-emerald-700",
                            entry.responseStatus >= 300 && entry.responseStatus < 500 && "bg-amber-100 text-amber-700",
                            entry.responseStatus >= 500 && "bg-red-100 text-red-700"
                          )}>
                            {entry.responseStatus}
                          </span>
                        </span>
                        <span className="shrink-0 text-muted-foreground hidden sm:inline">
                          {entry.matchedRouteName}
                        </span>
                        {entry.delay > 0 && (
                          <span className="shrink-0 text-muted-foreground">
                            {entry.delay}ms
                          </span>
                        )}
                      </div>
                    ))
                  )}
                  {mockStore.mockLogs.length > 0 && (
                    <div className="px-4 py-2 border-t bg-muted/20">
                      <button
                        onClick={mockStore.clearMockLogs}
                        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Effacer le journal
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Editor dialog */}
      <MockRouteEditor
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open)
          if (!open) setEditingRoute(null)
        }}
        onSave={handleSaveRoute}
        initialData={editingRoute}
      />

      {/* Generate from collection dialog */}
      <Dialog open={generatingOpen} onOpenChange={setGeneratingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Générer depuis une collection</DialogTitle>
            <DialogDescription>
              Crée une route mock pour chaque requête de la collection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {collections.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune collection disponible.</p>
            ) : (
              <div className="grid gap-2 max-h-60 overflow-y-auto">
                {collections.map((col) => (
                  <button
                    key={col.id}
                    onClick={() => setSelectedCollectionId(col.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                      selectedCollectionId === col.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted"
                    )}
                  >
                    <span className="font-medium">{col.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {col.requests.length} requête{col.requests.length !== 1 ? "s" : ""}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGeneratingOpen(false)}>Annuler</Button>
            <Button onClick={handleGenerateFromCollection} disabled={!selectedCollectionId}>
              Générer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test result dialog */}
      <Dialog open={!!testUrl} onOpenChange={(open) => { if (!open) { setTestUrl(""); setTestResult(null) } }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Résultat du test</DialogTitle>
          </DialogHeader>
          {testResult !== null && (
            <div className="space-y-4 overflow-y-auto pr-1">
              {/* Status + URL row */}
              <div className="flex items-center gap-3">
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold",
                  testResult.status >= 200 && testResult.status < 300 && "bg-emerald-100 text-emerald-700",
                  testResult.status >= 300 && testResult.status < 500 && "bg-amber-100 text-amber-700",
                  testResult.status >= 500 && "bg-red-100 text-red-700",
                  testResult.status === 0 && "bg-red-100 text-red-700"
                )}>
                  {testResult.status || "ERR"}
                </span>
                <span className={cn(
                  "inline-flex shrink-0 items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none",
                  methodBadge[testResult.method] || "bg-slate-500 text-white"
                )}>
                  {testResult.method}
                </span>
                <span className="font-mono text-xs text-muted-foreground truncate">
                  {testResult.url}
                </span>
              </div>

              {/* Headers */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">En-têtes de réponse</div>
                <div className="rounded-lg border divide-y max-h-36 overflow-y-auto">
                  {testResult.headers.map((h, i) => (
                    <div key={i} className="flex items-baseline gap-2 px-3 py-1.5 text-xs">
                      <span className="shrink-0 font-medium text-foreground">{h.key}</span>
                      <span className="text-muted-foreground">:</span>
                      <span className="font-mono text-muted-foreground break-all">{h.value}</span>
                    </div>
                  ))}
                  {testResult.headers.length === 0 && (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Aucun en-tête</div>
                  )}
                </div>
              </div>

              {/* Body */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1.5">Corps de la réponse</div>
                <pre className="rounded-lg border bg-muted p-3 text-xs overflow-auto max-h-64 whitespace-pre-wrap font-mono leading-relaxed">
                  {(() => {
                    try {
                      return JSON.stringify(JSON.parse(testResult.body), null, 2)
                    } catch {
                      return testResult.body
                    }
                  })()}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
