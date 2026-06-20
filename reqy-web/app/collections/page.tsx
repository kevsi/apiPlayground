'use client'

import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { CollectionsPanel } from "@/components/collections-panel"
import { ImportPostmanModal } from "@/components/import-postman-modal"
import { ExportPostmanModal } from "@/components/export-postman-modal"
import { ImportOpenApiModal } from "@/components/import-openapi-modal"
import { Button } from "@/components/ui/button"
import { useRequestStore, type Collection, type RequestItem } from "@/hooks/use-request-store"
import { useSidebar } from "@/contexts/sidebar-context"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { setPendingCollectionRequest } from "@/lib/request-bridge"
import { resolveUniqueCollectionName } from "@/lib/import-schemas"
import { generateOpenApiSpec } from "@/lib/openapi-export"
import { postmanImportResponseSchema } from "@/lib/import-schemas"
import { toast } from "@/hooks/use-toast"
import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"

export default function CollectionsPage() {
  const router = useRouter()
  const { isCollapsed, toggleSidebar } = useSidebar()
  const {
    collections,
    addCollection,
    updateCollection,
    deleteCollection,
    duplicateCollection,
    reorderCollections,
    addRequestToCollection,
    removeRequestFromCollection,
    addFolder,
    renameFolder,
    deleteFolder,
    moveRequestToFolder,
    moveFolder,
    reorderRequestsInCollection,
    reorderFolders,
  } = useRequestStore()
  

  const [postmanImportOpen, setPostmanImportOpen] = useState(false)
  const [postmanConnected, setPostmanConnected] = useState(false)
  const [postmanExportOpen, setPostmanExportOpen] = useState(false)
  const [openApiImportOpen, setOpenApiImportOpen] = useState(false)
  const [exportingPostman, setExportingPostman] = useState(false)
  const [exportingOpenApi, setExportingOpenApi] = useState(false)

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

    setExportingPostman(true)
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
    } finally {
      setExportingPostman(false)
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
      bodyType: request.bodyType,
      authType: request.authType,
      authToken: request.authToken,
      queryParams: request.queryParams,
    })
    toast({ title: "Requête chargée dans l'éditeur" })
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
      bodyType: request.bodyType,
      authType: request.authType,
      authToken: request.authToken,
      queryParams: request.queryParams,
      sendImmediately: true,
    })
    toast({ title: `"${request.name}" loaded and sent` })
    router.push("/")
  }

  const handleRunCollection = (collection: Collection) => {
    if (!collection.requests.length) {
      toast({ title: `Collection "${collection.name}" is empty.`, variant: "destructive" })
      return
    }

    setPendingCollectionRequest({
      collectionId: collection.id,
      requestIds: collection.requests.map((r) => r.id),
      name: collection.name,
      method: "GET",
      url: "",
      endpoint: "",
      sendImmediately: true,
    })
    toast({ title: `Running collection "${collection.name}"` })
    router.push("/")
  }

  const handleRunCollectionBackground = (collection: Collection) => {
    if (!collection.requests.length) {
      toast({ title: `Collection "${collection.name}" is empty.`, variant: "destructive" })
      return
    }

    setPendingCollectionRequest({
      collectionId: collection.id,
      requestIds: collection.requests.map((r) => r.id),
      name: collection.name,
      method: "GET",
      url: "",
      endpoint: "",
      sendImmediately: true,
      background: true,
    })
    toast({ title: `Background run of collection "${collection.name}" started` })
    router.push("/")
  }

  const existingCollectionNames = collections.map((c) => c.name)

  const handleImportOpenApi = (incomingCollections: Array<{
    name: string
    description?: string
    color: string
    icon: string
    requests: Array<{
      name: string
      method: string
      url: string
      endpoint: string
      headers?: Record<string, string>
      body?: string
      queryParams?: Array<{ key: string; value: string }>
    }>
  }>) => {
    let createdCount = 0
    for (const col of incomingCollections) {
      const uniqueName = resolveUniqueCollectionName(
        col.name,
        existingCollectionNames,
      )
      existingCollectionNames.push(uniqueName)
      const newCollectionId = addCollection({
        name: uniqueName,
        color: col.color || "emerald",
        icon: col.icon || "package",
        description: col.description,
      })

      for (const req of col.requests) {
        addRequestToCollection(newCollectionId, {
          name: req.name,
          method: (req.method as any) || "GET",
          url: req.url,
          endpoint: req.endpoint,
          headers: req.headers || {},
          body: req.body || "",
          queryParams: req.queryParams || [],
        })
        createdCount++
      }
    }

    toast({
      title: `Import OpenAPI terminé`,
      description: `${createdCount} requête${createdCount > 1 ? "s" : ""} importée${createdCount > 1 ? "s" : ""} dans ${collections.length} collection${collections.length > 1 ? "s" : ""}.`,
    })
  }

  const handleExportOpenApi = async () => {
    setExportingOpenApi(true)
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
        setExportingOpenApi(false)
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
    setExportingOpenApi(false)
  }

  return (
    <div className="flex h-screen bg-background bg-dot-pattern">
      <ApiSidebar activePage="collections" collapsed={isCollapsed} onCollapse={toggleSidebar} />

      <div className={cn(
        "flex flex-1 flex-col overflow-hidden transition-[margin] duration-200 ease-out",
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
                <Button variant="secondary" onClick={() => setOpenApiImportOpen(true)}>
                Importer OpenAPI
              </Button>
              <Button variant="secondary" onClick={() => setPostmanImportOpen(true)}>
                From Postman
              </Button>
              <Button variant="secondary" onClick={() => setPostmanExportOpen(true)} disabled={!postmanConnected || exportingPostman}>
                {exportingPostman ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {exportingPostman ? "Export..." : "Export to Postman"}
              </Button>
              <Button variant="secondary" onClick={handleExportOpenApi} disabled={exportingOpenApi}>
                {exportingOpenApi ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {exportingOpenApi ? "Export..." : "Exporter OpenAPI"}
              </Button>
            </div>
          </div>

          <ImportOpenApiModal
            open={openApiImportOpen}
            onClose={() => setOpenApiImportOpen(false)}
            onImport={handleImportOpenApi}
            existingCollectionNames={collections.map((c) => c.name)}
          />

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
            onAddCollection={(data) =>
              addCollection({
                name: data?.name ?? "New Collection",
                color: data?.color ?? "emerald",
                icon: data?.icon ?? "package",
              })
            }
            onDeleteCollection={deleteCollection}
            onDuplicateCollection={duplicateCollection}
            onReorderCollections={reorderCollections}
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
            onAddFolder={addFolder}
            onRenameFolder={renameFolder}
            onDeleteFolder={deleteFolder}
            onMoveRequestToFolder={moveRequestToFolder}
            onMoveFolder={moveFolder}
            onReorderRequestsInCollection={reorderRequestsInCollection}
            onReorderFolders={reorderFolders}
          />
        </main>
      </div>
    </div>
  )
}
