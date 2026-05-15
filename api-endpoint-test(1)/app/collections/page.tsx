"use client"

import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { CollectionsPanel } from "@/components/collections-panel"
import { useRequestStore, type RequestItem } from "@/hooks/use-request-store"
import { useRouter } from "next/navigation"

export default function CollectionsPage() {
  const router = useRouter()
  const {
    collections,
    addCollection,
    updateCollection,
    deleteCollection,
    addRequestToCollection,
    removeRequestFromCollection,
  } = useRequestStore()

  const handleSelectRequest = (_request: RequestItem) => {
    // Optionally navigate to home with pre-filled request or just close
    router.push("/")
  }

  return (
    <div className="flex h-screen bg-background">
      <ApiSidebar activePage="collections" />

      <div className="ml-64 flex flex-1 flex-col overflow-hidden">
        <ApiHeader />

        <main className="flex-1 overflow-auto">
          <CollectionsPanel
            collections={collections}
            onSelectRequest={handleSelectRequest}
            onAddCollection={() =>
              addCollection({
                name: "New Collection",
                color: "emerald",
                icon: "package",
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
