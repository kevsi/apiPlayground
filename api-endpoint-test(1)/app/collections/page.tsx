'use client'

import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { CollectionsPanel } from "@/components/collections-panel"
import { ImportPostmanModal } from "@/components/import-postman-modal"
import { ExportPostmanModal } from "@/components/export-postman-modal"
import { Button } from "@/components/ui/button"
import { useRequestStore, type Collection, type RequestItem } from "@/hooks/use-request-store"
import { useSidebar } from "@/contexts/sidebar-context"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { setPendingCollectionRequest } from "@/lib/utils"
import { resolveUniqueCollectionName } from "@/lib/import-schemas"
import { generateOpenApiSpec } from "@/lib/openapi-export"
import { postmanImportResponseSchema } from "@/lib/import-schemas"
import { toast } from "@/hooks/use-toast"
import { useState, useEffect } from "react"

export default function CollectionsPage() {
  const router = useRouter()
  const { isCollapsed, toggleSidebar } = useSidebar()
  const {
    collections,
    addCollection,
    updateCollection,
    deleteCollection,
    addRequestToCollection,
    removeRequestFromCollection,
  } = useRequestStore()
  

  const [postmanImportOpen, setPostmanImportOpen] = useState(false)
  const [postmanConnected, setPostmanConnected] = useState(false)
  const [postmanExportOpen, setPostmanExportOpen] = useState(false)

  // Check Postman connection status
  useEffect(() => {
    const checkPostmanStatus = async () => {
      try {
        const response = await fetch("/api/postman-auth")
        const data = await response.json()
        setPostmanConnected(data.connected || false)
      } catch {
        setPostmanConnected(false)
      }
    }

    checkPostmanStatus()
  }, [])

  const handleImportPostmanCollection = (collection: { name: string; description?: string; routes: any[] }) => {
    const uniqueName = resolveUniqueCollectionName(
      collection.name,
      collections.map((c) => c.name),
    )
    const newCollectionId = addCollection({
      name: uniqueName,
      color: "emerald",
      icon: "package",
    })

    collection.routes.forEach((route) => {
      addRequestToCollection(newCollectionId, {
        name: route.name || `${route.method} ${route.path}`,
        method: (route.method || "GET") as any,
        url: route.path || "/",
        endpoint: route.path || "/",
        headers: {},
        body: route.body || "",
        queryParams: [],
      })
    })

    toast({
      title: `Collection Postman importée: ${uniqueName}`,
      description: uniqueName !== collection.name ? `Renommée depuis « ${collection.name} » (conflit de nom).` : undefined,
    })
  }

  const handleExportCollectionsToPostman = async (selectedCollectionIds: string[]) => {
    if (!postmanConnected) {
      toast({ title: "Postman non connecté", variant: "destructive" })
      return
    }

    const selectedCollections = collections.filter((collection) =>
      selectedCollectionIds.includes(collection.id)
    )

    if (!selectedCollections.length) {
      toast({ title: "Aucune collection sélectionnée", variant: "destructive" })
      return
    }

    try {
      const response = await fetch("/api/postman-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedCollections.length === 1
            ? `Export Reqly - ${selectedCollections[0].name}`
            : `Export Reqly - ${selectedCollections.length} collections`,
          description: selectedCollections.length === 1
            ? `Collection exportée depuis Reqly : ${selectedCollections[0].name}`
            : `Export de ${selectedCollections.length} collections depuis Reqly`,
          requests: selectedCollections.flatMap((collection) =>
            collection.requests.map((request) => ({
              collectionName: collection.name,
              name: request.name,
              method: request.method,
              url: request.url || request.endpoint || "/",
              headers: request.headers || {},
              body: request.body || "",
            }))
          ),
        }),
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({}))
        throw new Error(error.message || "Erreur lors de l'export vers Postman")
      }

      const data = await response.json()
      toast({ title: "Export vers Postman réussi", description: data.message || "Collection créée dans Postman" })
    } catch (err) {
      toast({ title: "Erreur", description: err instanceof Error ? err.message : "Impossible d'exporter vers Postman", variant: "destructive" })
    }
  }

  // Debug: log render and collections length to ensure re-renders occur
  if (typeof window !== 'undefined') {
    try {
       
      console.log('PAGE RENDER: collections.length =', collections.length)
    } catch {
      // intentionally empty
    }
  }

  const handleSelectRequest = (request: RequestItem) => {
    setPendingCollectionRequest({
      id: request.id,
      name: request.name,
      method: request.method,
      url: request.url,
      endpoint: request.endpoint,
      headers: request.headers,
      body: request.body,
      queryParams: request.queryParams,
    })
    toast({ title: `Requête "${request.name}" transférée dans l'éditeur.` })
    router.push("/")
  }

  const handleSelectAndSendRequest = (request: RequestItem) => {
    setPendingCollectionRequest({
      id: request.id,
      name: request.name,
      method: request.method,
      url: request.url,
      endpoint: request.endpoint,
      headers: request.headers,
      body: request.body,
      queryParams: request.queryParams,
      sendImmediately: true,
    })
    toast({ title: `Requête "${request.name}" transférée et envoyée.` })
    router.push("/")
  }

  const handleRunCollection = (collection: Collection) => {
    if (!collection.requests.length) {
      toast({ title: `La collection "${collection.name}" est vide.`, variant: "destructive" })
      return
    }

    const firstRequest = collection.requests[0]
    setPendingCollectionRequest({
      collectionId: collection.id,
      name: firstRequest.name,
      method: firstRequest.method,
      url: firstRequest.url,
      endpoint: firstRequest.endpoint,
      headers: firstRequest.headers,
      body: firstRequest.body,
      queryParams: firstRequest.queryParams,
      sendImmediately: true,
    })
    toast({ title: `Exécution de la collection "${collection.name}" démarrée.` })
    router.push("/")
  }

  const handleRunCollectionBackground = (collection: Collection) => {
    if (!collection.requests.length) {
      toast({ title: `La collection "${collection.name}" est vide.`, variant: "destructive" })
      return
    }

    const firstRequest = collection.requests[0]
    setPendingCollectionRequest({
      collectionId: collection.id,
      name: firstRequest.name,
      method: firstRequest.method,
      url: firstRequest.url,
      endpoint: firstRequest.endpoint,
      headers: firstRequest.headers,
      body: firstRequest.body,
      queryParams: firstRequest.queryParams,
      sendImmediately: true,
      background: true,
    })
    toast({ title: `Exécution background de la collection "${collection.name}" démarrée.` })
    router.push("/")
  }

  const handleExportOpenApi = async () => {
    const spec = generateOpenApiSpec(collections)
    const contents = JSON.stringify(spec, null, 2)

    if (typeof window !== "undefined" && 'showSaveFilePicker' in window) {
      try {
        const handle = await (window as unknown as { showSaveFilePicker: (opts: unknown) => Promise<{ createWritable: () => Promise<{ write: (c: string) => Promise<void>, close: () => Promise<void> }> }> }).showSaveFilePicker({
          suggestedName: "reqly-openapi.json",
          types: [
            {
              description: "JSON OpenAPI file",
              accept: { "application/json": [".json"] },
            },
          ],
        })
        const writable = await handle.createWritable()
        await writable.write(contents)
        await writable.close()
        return
      } catch {
        // If user cancels save dialog or browser doesn't support it, fallback to download
      }
    }

    const blob = new Blob([contents], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "reqly-openapi.json"
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex h-screen bg-background">
      <ApiSidebar activePage="collections" collapsed={isCollapsed} onCollapse={toggleSidebar} />

      <div className={cn(
        "flex flex-1 flex-col overflow-hidden transition-all duration-300 ease-in-out",
        isCollapsed ? "ml-[60px]" : "ml-64",
        "max-[916px]:ml-[60px]"
      )}>
        <ApiHeader />

        <main className="flex-1 overflow-auto">
          <div className="flex flex-col gap-4 border-b border-border bg-background/80 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Collections</h1>
              <p className="text-sm text-muted-foreground">Gérez vos groupes de requêtes et exportez-les en OpenAPI.</p>
            </div>
            <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setPostmanImportOpen(true)}>
                Importer depuis Postman
              </Button>
              <Button variant="secondary" onClick={() => setPostmanExportOpen(true)} disabled={!postmanConnected}>
                Exporter vers Postman
              </Button>
              <Button variant="secondary" onClick={handleExportOpenApi}>
                Exporter OpenAPI
              </Button>
            </div>
          </div>

          <ImportPostmanModal
            open={postmanImportOpen}
            onClose={() => setPostmanImportOpen(false)}
            onImport={handleImportPostmanCollection}
            isConnected={postmanConnected}
          />

          <ExportPostmanModal
            open={postmanExportOpen}
            onClose={() => setPostmanExportOpen(false)}
            collections={collections}
            onExport={handleExportCollectionsToPostman}
            isConnected={postmanConnected}
          />

          <CollectionsPanel
            collections={collections}
            onSelectRequest={handleSelectRequest}
            onSelectAndSendRequest={handleSelectAndSendRequest}
            onRunCollection={handleRunCollection}
            onRunCollectionBackground={handleRunCollectionBackground}
            onAddCollection={(data) =>
              addCollection({
                name: data?.name ?? "New Collection",
                color: data?.color ?? "emerald",
                icon: data?.icon ?? "package",
              })
            }
            onDeleteCollection={deleteCollection}
            onRenameCollection={(id, name) => updateCollection(id, { name })}
            onAddRequestToCollection={(collectionId, request) => {
              const defaultRequest = {
                name: "New Request",
                method: "GET" as const,
                url: "",
                endpoint: "",
                headers: {},
                body: "",
                queryParams: [],
              }
              addRequestToCollection(collectionId, request ?? defaultRequest)
            }}
            onRemoveRequestFromCollection={removeRequestFromCollection}
          />
        </main>
      </div>
    </div>
  )
}
