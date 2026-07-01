"use client"

import { useState, useMemo, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { cn } from "@/lib/utils"
import { useMockStore } from "@/hooks/use-mock-store"
import type { MockRoute, MockServer } from "@/lib/mock-types"
import { useRequestStore, type Collection } from "@/hooks/use-request-store"
import { MockRouteEditor, type MockRouteFormData } from "@/components/mock-route-editor"
import { Play, Plus, MoreHorizontal, Edit2, Trash2, Copy, Power, PowerOff, FlaskConical, Search, Loader2, GripVertical, Server, Dot } from "lucide-react"
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
  const mockStore = useMockStore()
  const { collections, history, isLoaded: storeLoaded, activeWorkspaceId } = useRequestStore()

  const [editorOpen, setEditorOpen] = useState(false)
  const [editingRoute, setEditingRoute] = useState<MockRoute | null>(null)
  const [addServerOpen, setAddServerOpen] = useState(false)
  const [generatingOpen, setGeneratingOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>("")
  const [testUrl, setTestUrl] = useState("")
  const [testResult, setTestResult] = useState<TestResultData | null>(null)
  const [isTesting, setIsTesting] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const dragOverIndexRef = useRef<number | null>(null)

  const [serverFormData, setServerFormData] = useState({
    name: "",
    baseUrl: "",
    localPrefix: "",
  })

  const wsId = activeWorkspaceId ?? "ws-personal"
  const workspaceCollections = useMemo(
    () => collections.filter((c) => (c.workspaceId || "ws-personal") === wsId),
    [collections, wsId]
  )

  const selectedServer = mockStore.servers.find((s) => s.id === mockStore.selectedServerId) || mockStore.servers[0]
  const serverRoutes = useMemo(() =>
    selectedServer
      ? mockStore.getServerRoutes(selectedServer.id).filter((r) => (r.workspaceId || "ws-personal") === wsId)
      : [],
    [mockStore, selectedServer, wsId]
  )

  const filteredRoutes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return serverRoutes
    return serverRoutes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.pathPattern.toLowerCase().includes(q) ||
        r.method.toLowerCase().includes(q)
    )
  }, [searchQuery, serverRoutes])

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
      mockStore.addRoute({
        ...data,
        serverId: mockStore.selectedServerId || undefined,
        workspaceId: activeWorkspaceId ?? "ws-personal",
      })
      toast({ title: `Route "${data.name}" créée.` })
    }
    setEditorOpen(false)
    setEditingRoute(null)
  }

  const handleDuplicateRoute = (route: MockRoute) => {
    const { id, createdAt, updatedAt, workspaceId: _, ...rest } = route
    mockStore.addRoute({
      ...rest,
      serverId: mockStore.selectedServerId || undefined,
      workspaceId: activeWorkspaceId ?? "ws-personal",
      name: `${rest.name} (copie)`,
    })
    toast({ title: `Route dupliquée.` })
  }

  const handleTestMock = async (route: MockRoute) => {
    if (!selectedServer) return
    setIsTesting(true)

    // Build display URL
    const prefix = selectedServer.localPrefix || "default"
    const cleanPath = route.pathPattern.replace(/^\/?/, "/")
    const displayUrl = `/mock/${prefix}${cleanPath}`
    setTestUrl(displayUrl)

    try {
      // Simulate delay
      if (route.delay > 0) {
        await new Promise((r) => setTimeout(r, route.delay))
      }

      // Pick variant if configured
      let activeStatus = route.responseStatus
      let activeBody = route.responseBody
      let activeHeaders: Record<string, string> = route.responseHeaders ?? {}

      if (route.variants && route.variants.length > 0) {
        const totalWeight = route.variants.reduce((s, v) => s + v.weight, 0)
        if (totalWeight > 0) {
          let roll = Math.random() * totalWeight
          for (const v of route.variants) {
            roll -= v.weight
            if (roll <= 0) {
              activeStatus = v.responseStatus
              activeBody = v.responseBody
              activeHeaders = v.responseHeaders ?? {}
              break
            }
          }
        }
      }

      const headers: { key: string; value: string }[] = [
        { key: "x-mock-route", value: route.id },
        { key: "x-mock-name", value: route.name },
        { key: "x-mock-delay", value: String(route.delay) },
        ...Object.entries(activeHeaders).map(([key, value]) => ({ key, value })),
      ]

      setTestResult({
        status: activeStatus,
        body: activeBody,
        headers,
        url: displayUrl,
        method: route.method,
      })
    } catch (err) {
      setTestResult({ status: 0, body: String(err), headers: [], url: displayUrl, method: route.method })
    } finally {
      setIsTesting(false)
    }
  }

  const handleAddServer = () => {
    // If a baseUrl is provided and no explicit prefix was given, keep prefix empty
    // and DO NOT auto-generate one from the name. Otherwise generate from name.
    let prefix = serverFormData.localPrefix
    const explicitPrefixProvided = Boolean(serverFormData.localPrefix && serverFormData.localPrefix.trim())
    if (!explicitPrefixProvided && serverFormData.baseUrl) {
      prefix = ""
    } else if (!prefix && serverFormData.name) {
      prefix = serverFormData.name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32)
    }
    prefix = prefix || "server"

    mockStore.addServer({
      name: serverFormData.name || "Nouveau serveur",
      baseUrl: serverFormData.baseUrl,
      localPrefix: prefix,
      enabled: true,
    })
    toast({ title: "Serveur créé." })
    setAddServerOpen(false)
    setServerFormData({ name: "", baseUrl: "", localPrefix: "" })
  }

  const handleDeleteServer = (serverId: string) => {
    const server = mockStore.servers.find((s) => s.id === serverId)
    if (!server) return
    mockStore.deleteServer(serverId)
    toast({ title: `Serveur "${server.name}" supprimé.` })
  }

  const handleToggleServer = async (serverId: string) => {
    const server = mockStore.servers.find((s) => s.id === serverId)
    if (!server) return
    const newEnabled = !server.enabled
    mockStore.updateServer(serverId, { enabled: newEnabled })
    // Sync immédiat — on construit l'état à jour manuellement car le useEffect
    // de sync n'a pas encore écrit dans localStorage (stale read).
    try {
      const updatedServers = mockStore.servers.map((s) =>
        s.id === serverId ? { ...s, enabled: newEnabled } : s
      )
      await fetch("/api/mock/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          routes: mockStore.routes,
          servers: updatedServers,
        }),
      })
    } catch { /* serveur indisponible */ }
  }

  const handleGenerateFromCollection = async () => {
    if (!selectedCollectionId || !mockStore.selectedServerId) return
    const collection = workspaceCollections.find((c) => c.id === selectedCollectionId)
    if (!collection) return
    setIsGenerating(true)
    await new Promise((r) => setTimeout(r, 50))
    const count = mockStore.generateFromCollection(collection, history, mockStore.selectedServerId).length
    toast({ title: `${count} routes mock générées depuis "${collection.name}".` })
    setIsGenerating(false)
    setGeneratingOpen(false)
    setSelectedCollectionId("")
  }

  const handleMoveRoute = (fromIndex: number, toIndex: number) => {
    const ids = filteredRoutes.map((r) => r.id)
    const [movedId] = ids.splice(fromIndex, 1)
    ids.splice(toIndex, 0, movedId)
    mockStore.reorderRoutes(ids)
  }

  const serverBaseUrl = typeof window !== "undefined" ? window.location.origin : ""

  const EndpointRow = ({ route, onTest, onEdit, onDuplicate, index, onMove }: {
    route: MockRoute
    onTest: (r: MockRoute) => void
    onEdit: (r: MockRoute) => void
    onDuplicate: (r: MockRoute) => void
    index: number
    onMove: (from: number, to: number) => void
  }) => {return (
    <div
      className={cn(
        "group flex items-center gap-3 px-4 py-3 transition-all duration-200 hover:bg-muted/40 hover:shadow-sm",
        !route.enabled && "opacity-50 hover:opacity-80",
        dragIndex === index && "opacity-40 scale-[0.98] shadow-inner bg-muted/50"
      )}
      draggable
      onDragStart={() => setDragIndex(index)}
      onDragOver={(e) => { e.preventDefault(); dragOverIndexRef.current = index }}
      onDragEnd={() => {
        if (dragIndex !== null && dragOverIndexRef.current !== null && dragIndex !== dragOverIndexRef.current) {
          onMove(dragIndex, dragOverIndexRef.current)
        }
        setDragIndex(null)
        dragOverIndexRef.current = null
      }}
    >
      <div className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors">
        <GripVertical className="size-4" />
      </div>

      <div className="flex items-center gap-2">
        <Switch
          checked={route.enabled}
          onCheckedChange={() => mockStore.toggleRoute(route.id)}
          className={cn(
            route.enabled ? "data-[state=checked]:bg-emerald-500" : "data-[state=unchecked]:bg-slate-300"
          )}
          aria-label={route.enabled ? "Désactiver" : "Activer"}
        />
      </div>

      <span className={cn(
        "inline-flex shrink-0 items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold leading-none w-12 shadow-sm transition-transform duration-200 group-hover:scale-105",
        methodBadge[route.method] || "bg-slate-500 text-white"
      )}>
        {route.method}
      </span>

      <span className="flex-1 truncate font-mono text-sm">
        {route.pathPattern}
      </span>

      <span className="shrink-0 text-xs text-muted-foreground hidden sm:inline">
        {route.responseStatus}
        {route.delay > 0 && ` · ${route.delay}ms`}
      </span>

      <span className="shrink-0 text-xs text-muted-foreground max-w-[120px] truncate hidden md:inline">
        {route.name}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7">
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onTest(route)} disabled={isTesting}>
            {isTesting ? <Loader2 className="size-3.5 mr-2 animate-spin" /> : <Play className="size-3.5 mr-2" />}
            {isTesting ? "Test en cours..." : "Tester"}
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
  )}

  return (
    <>
<main className="flex-1 overflow-auto hide-scrollbar bg-dot-pattern flex flex-col">
          {/* Header section */}
          <div className="border-b border-border bg-background/50 px-6 py-4 sticky top-0 z-10">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-foreground">Mock Servers</h1>
                <p className="text-sm text-muted-foreground mt-1">Gérez vos serveurs mock et leurs endpoints</p>
              </div>
              <Button size="sm" onClick={() => setAddServerOpen(true)}>
                <Plus className="size-3.5 mr-1.5" />
                Nouveau serveur
              </Button>
            </div>
          </div>

          {/* Content area */}
          <div className="flex-1 overflow-auto flex">
            {/* Left sidebar — servers */}
            <div className="w-[280px] border-r border-border bg-muted/30 flex flex-col overflow-hidden">
              {/* Server list */}
              <div className="flex-1 overflow-y-auto p-3">
                {mockStore.servers.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-center py-8">
                    <div>
                      <Server className="mx-auto size-8 text-muted-foreground/40 mb-2" />
                      <p className="text-xs text-muted-foreground">Aucun serveur</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {mockStore.servers.map((server) => (
                      <button
                        key={server.id}
                        onClick={() => mockStore.selectServer(server.id)}
                        className={cn(
                          "w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-xs transition-all duration-200 relative overflow-hidden group/server",
                          mockStore.selectedServerId === server.id
                            ? "bg-primary/10 text-primary font-medium shadow-sm"
                            : "hover:bg-muted/60 text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {mockStore.selectedServerId === server.id && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-3/4 w-1 bg-primary rounded-r-full shadow-[0_0_8px_rgba(var(--primary),0.6)] animate-in slide-in-from-left-1" />
                        )}
                        <Dot className={cn(
                          "size-2 shrink-0",
                          server.enabled ? "text-emerald-500 fill-emerald-500" : "text-muted-foreground"
                        )} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{server.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate">{server.baseUrl || "—"}</div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button 
                              type="button"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 w-9 size-6 opacity-0 group-hover:opacity-100"
                            >
                              <MoreHorizontal className="size-3" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleServer(server.id) }}>
                              {server.enabled ? <PowerOff className="size-3.5 mr-2" /> : <Power className="size-3.5 mr-2" />}
                              {server.enabled ? "Désactiver" : "Activer"}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={(e) => { e.stopPropagation(); handleDeleteServer(server.id) }}
                              disabled={server.id === "mock_server_default"}
                            >
                              <Trash2 className="size-3.5 mr-2" /> Supprimer
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right panel — endpoints */}
            <div className="flex-1 overflow-auto flex flex-col">
              {selectedServer ? (
                <>
                  {/* Server info header */}
                  <div className="border-b border-border bg-muted/20 px-6 py-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-lg font-semibold">{selectedServer.name}</h2>
                        <p className="text-xs text-muted-foreground mt-1">
                          {mockStore.getServerRoutes(selectedServer.id).length} endpoint{mockStore.getServerRoutes(selectedServer.id).length !== 1 ? "s" : ""}
                        </p>
                      </div>
                      <Badge variant={selectedServer.enabled ? "default" : "secondary"}>
                        {selectedServer.enabled ? "Actif" : "Inactif"}
                      </Badge>
                    </div>

                    {/* URL bar */}
                    <div className="space-y-2 mb-4">
                      <label className="text-xs font-medium text-muted-foreground">URL de base</label>
                      <div className="flex items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs">
                        <code className="flex-1 truncate">
                          {`${serverBaseUrl.replace(/\/$/, "")}/mock/${selectedServer.localPrefix ? `${selectedServer.localPrefix}/` : ""}`}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-6 shrink-0"
                          onClick={() => {
                            const url = `${serverBaseUrl.replace(/\/$/, "")}/mock/${selectedServer.localPrefix ? `${selectedServer.localPrefix}/` : ""}`
                            navigator.clipboard.writeText(url).then(() => {
                              toast({ title: "URL copiée dans le presse-papiers." })
                            })
                          }}
                        >
                          <Copy className="size-3.5" />
                        </Button>
                      </div>
                    </div>

                    {/* Actions and search */}
                    <div className="flex flex-col gap-3">
                      <div className="flex gap-2 items-center justify-between">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" disabled>
                            <Copy className="size-3.5 mr-1" />
                            OpenAPI
                          </Button>
                          <Button size="sm" onClick={handleNewRoute}>
                            <Plus className="size-3.5 mr-1" />
                            Endpoint
                          </Button>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setGeneratingOpen(true)}>
                          <Copy className="size-3.5 mr-1" />
                          Collection
                        </Button>
                      </div>
                      
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
                        <input
                          type="text"
                          placeholder="Filtrer les endpoints..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="h-8 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Endpoints list */}
                  <div className="flex-1 overflow-auto p-6">
                    {filteredRoutes.length === 0 ? (
                      <div className="flex items-center justify-center h-full text-center p-8 animate-in fade-in zoom-in-95 duration-500">
                        <div className="flex flex-col items-center">
                          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/10 to-primary/5 mb-5 shadow-inner border border-primary/10">
                            <FlaskConical className="size-10 text-primary drop-shadow-md" />
                          </div>
                          <p className="text-base font-medium text-foreground">
                            {searchQuery ? "Aucun endpoint ne correspond." : "Aucun endpoint pour ce serveur."}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                            Créez un endpoint manuellement ou importez-en un lot depuis une collection.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg border border-border divide-y overflow-hidden">
                        {filteredRoutes.map((route, idx) => (
                          <EndpointRow
                            key={route.id}
                            route={route}
                            onTest={handleTestMock}
                            onEdit={handleEditRoute}
                            onDuplicate={handleDuplicateRoute}
                            index={idx}
                            onMove={handleMoveRoute}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer — add endpoint button */}
                  {filteredRoutes.length > 0 && (
                    <div className="border-t border-border px-6 py-3 bg-muted/20">
                      <Button size="sm" variant="ghost" className="w-full text-xs" onClick={handleNewRoute}>
                        <Plus className="size-3 mr-1.5" />
                        Ajouter un endpoint
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center p-6">
                  <div className="text-center">
                    <Server className="mx-auto size-8 text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">Aucun serveur disponible</p>
                    <p className="text-xs text-muted-foreground mt-1">Créez un serveur pour commencer</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

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

      {/* Add server dialog */}
      <Dialog open={addServerOpen} onOpenChange={setAddServerOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un serveur mock</DialogTitle>
            <DialogDescription>
              Créez un nouveau serveur pour organiser vos endpoints.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-foreground">Nom du serveur</label>
              <Input
                value={serverFormData.name}
                onChange={(e) => setServerFormData({ ...serverFormData, name: e.target.value })}
                placeholder="Ex: JSONPlaceholder"
                className="mt-1.5 h-8 text-xs"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">URL de base</label>
              <Input
                value={serverFormData.baseUrl}
                onChange={(e) => setServerFormData({ ...serverFormData, baseUrl: e.target.value })}
                placeholder="Ex: https://api.example.com"
                className="mt-1.5 h-8 text-xs font-mono"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground">Préfixe local</label>
              <Input
                value={serverFormData.localPrefix}
                onChange={(e) => setServerFormData({ ...serverFormData, localPrefix: e.target.value })}
                placeholder="Auto-généré depuis le nom"
                className="mt-1.5 h-8 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Les requêtes seront interceptées sur <code className="bg-muted px-1 rounded">
                  /mock/{serverFormData.localPrefix || "prefix"}/
                </code>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddServerOpen(false)}>Annuler</Button>
            <Button onClick={handleAddServer} disabled={!serverFormData.name}>Créer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate from collection dialog */}
      <Dialog open={generatingOpen} onOpenChange={setGeneratingOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Générer depuis une collection</DialogTitle>
            <DialogDescription>
              Crée un endpoint pour chaque requête de la collection.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {workspaceCollections.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune collection disponible.</p>
            ) : (
              <div className="grid gap-2 max-h-60 overflow-y-auto">
                {workspaceCollections.map((col) => (
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
            <Button onClick={handleGenerateFromCollection} disabled={!selectedCollectionId || isGenerating}>
              {isGenerating ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
              {isGenerating ? "Génération..." : "Générer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test result dialog */}
      <Dialog open={!!testUrl} onOpenChange={(open) => { if (!open) { setTestUrl(""); setTestResult(null); setIsTesting(false) } }}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Résultat du test</DialogTitle>
          </DialogHeader>

          {/* Loading state */}
          {isTesting && (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 className="size-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Simulation en cours…</p>
              <code className="text-xs font-mono text-muted-foreground/70">{testUrl}</code>
            </div>
          )}

          {/* Result */}
          {!isTesting && testResult !== null && (
            <div className="space-y-4 overflow-y-auto pr-1">
              <div className="flex items-center gap-3">
                <span className={cn(
                  "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold",
                  testResult.status >= 200 && testResult.status < 300 && "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
                  testResult.status >= 300 && testResult.status < 500 && "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
                  testResult.status >= 500 && "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
                  testResult.status === 0 && "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                )}>
                  {testResult.status || "ERR"}
                </span>
                <span className={cn(
                  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold",
                  methodBadge[testResult.method] || "bg-slate-500 text-white"
                )}>
                  {testResult.method}
                </span>
                <code className="flex-1 text-xs font-mono text-muted-foreground truncate">{testResult.url}</code>
              </div>

              {testResult.body && (
                <div>
                  <label className="text-xs font-medium text-foreground mb-1.5 block">Response body</label>
                  <pre className="rounded-lg border border-border/40 bg-[#0d1117] text-[#e6edf3] p-4 text-xs overflow-x-auto max-h-[300px] font-mono shadow-inner custom-scrollbar whitespace-pre-wrap break-all">
                    {(() => {
                      try { return JSON.stringify(JSON.parse(testResult.body), null, 2) }
                      catch { return testResult.body }
                    })()}
                  </pre>
                </div>
              )}

              {testResult.headers.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-foreground mb-1.5 block">Headers de réponse</label>
                  <div className="rounded-lg border border-border/40 divide-y divide-border/40 overflow-hidden">
                    {testResult.headers.map((h, i) => (
                      <div key={i} className="flex gap-2 px-3 py-1.5 text-xs font-mono bg-muted/20">
                        <span className="text-primary/80 shrink-0">{h.key}</span>
                        <span className="text-muted-foreground truncate">{h.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
