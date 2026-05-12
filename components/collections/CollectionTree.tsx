"use client"

import { useState } from "react"
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  MoreHorizontal,
  Plus,
  Lock,
  Users,
  Package,
  Trash2,
  Edit2,
  Search,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { Collection, RequestItem, HttpMethod } from "@/hooks/use-request-store"

const methodColors: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/20 text-emerald-600 border-emerald-500/30",
  POST: "bg-blue-500/20 text-blue-600 border-blue-500/30",
  PUT: "bg-amber-500/20 text-amber-600 border-amber-500/30",
  PATCH: "bg-purple-500/20 text-purple-600 border-purple-500/30",
  DELETE: "bg-red-500/20 text-red-600 border-red-500/30",
}

const collectionColors: Record<string, string> = {
  emerald: "bg-emerald-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  purple: "bg-purple-500",
  red: "bg-red-500",
  pink: "bg-pink-500",
}

const collectionIcons: Record<string, React.ReactNode> = {
  lock: <Lock className="size-3 text-white" />,
  users: <Users className="size-3 text-white" />,
  package: <Package className="size-3 text-white" />,
}

interface CollectionsPanelProps {
  collections: Collection[]
  onSelectRequest: (request: RequestItem) => void
  onAddCollection: () => void
  onDeleteCollection: (id: string) => void
  onAddRequestToCollection: (collectionId: string) => void
}

export function CollectionsPanel({
  collections,
  onSelectRequest,
  onAddCollection,
  onDeleteCollection,
  onAddRequestToCollection,
}: CollectionsPanelProps) {
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(
    new Set(collections.map((c) => c.id))
  )
  const [searchQuery, setSearchQuery] = useState("")

  const toggleCollection = (id: string) => {
    setExpandedCollections((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const filteredCollections = collections.map((collection) => ({
    ...collection,
    requests: collection.requests.filter(
      (req) =>
        req.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        req.endpoint.toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter((collection) => 
    searchQuery === "" || collection.requests.length > 0 || collection.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-foreground">Collections</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddCollection}
          className="h-7 gap-1 px-2 text-xs"
        >
          <FolderPlus className="size-3.5" />
          New
        </Button>
      </div>

      {/* Search */}
      <div className="border-b border-border p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search requests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-sm"
          />
        </div>
      </div>

      {/* Collections List */}
      <div className="flex-1 overflow-y-auto p-2">
        {filteredCollections.map((collection) => {
          const isExpanded = expandedCollections.has(collection.id)
          
          return (
            <div key={collection.id} className="mb-1">
              {/* Collection Header */}
              <div className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent">
                <button
                  onClick={() => toggleCollection(collection.id)}
                  className="flex items-center gap-2 flex-1"
                >
                  {isExpanded ? (
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  )}
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded",
                      collectionColors[collection.color]
                    )}
                  >
                    {collectionIcons[collection.icon] || (
                      <Package className="size-3 text-white" />
                    )}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {collection.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({collection.requests.length})
                  </span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-6 p-0 opacity-0 group-hover:opacity-100"
                    >
                      <MoreHorizontal className="size-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onClick={() => onAddRequestToCollection(collection.id)}>
                      <Plus className="mr-2 size-3.5" />
                      Add Request
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <Edit2 className="mr-2 size-3.5" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDeleteCollection(collection.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 size-3.5" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Collection Requests */}
              {isExpanded && (
                <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-3">
                  {collection.requests.map((request) => (
                    <button
                      key={request.id}
                      onClick={() => onSelectRequest(request)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-accent"
                    >
                      <Badge
                        variant="outline"
                        className={cn(
                          "h-5 shrink-0 px-1.5 text-[10px] font-bold",
                          methodColors[request.method]
                        )}
                      >
                        {request.method}
                      </Badge>
                      <span className="truncate text-sm text-foreground">
                        {request.name}
                      </span>
                    </button>
                  ))}
                  {collection.requests.length === 0 && (
                    <p className="px-2 py-2 text-xs text-muted-foreground">
                      No requests yet
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {filteredCollections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Package className="size-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No collections found</p>
          </div>
        )}
      </div>
    </div>
  )
}
