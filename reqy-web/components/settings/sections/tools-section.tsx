"use client"

import { useEffect, useState } from "react"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { ToolAssociationModal, type Tool } from "./tool-association-modal"

const TOOLS: Tool[] = [
  {
    id: "postman",
    name: "Postman",
    description: "Import et export de collections Postman.",
    logoEmoji: "📬",
    logo: "/icones/postman.png",
    scopes: [],
    apiKey: {
      endpoint: "/api/postman-auth",
      placeholder: "PMAK-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      instructions:
        "Allez sur go.postman.co → Settings → API Keys → Generate API Key. Copiez la clé (elle commence par PMAK-).",
    },
  },
  {
    id: "github",
    name: "GitHub",
    description: "Accès à vos repositories et gists.",
    logoEmoji: "🐙",
    logo: "/icones/github.png",
    scopes: ["Lecture de vos repositories", "Lecture de votre profil", "Création de gists"],
    oauthUrl: "/api/github-auth/start",
  },
]

function useToolStatus(toolId: string, refreshKey = 0): "connected" | "disconnected" | "loading" {
  const [status, setStatus] = useState<"connected" | "disconnected" | "loading">("loading")
  useEffect(() => {
    let cancelled = false
    const url =
      toolId === "github"
        ? "/api/github-auth/status"
        : toolId === "postman"
        ? "/api/postman-auth/status"
        : null
    if (!url) {
      setStatus("disconnected")
      return
    }
    fetch(url, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setStatus(data.connected ? "connected" : "disconnected")
      })
      .catch(() => {
        if (!cancelled) setStatus("disconnected")
      })
    return () => {
      cancelled = true
    }
  }, [toolId, refreshKey])
  return status
}

function ToolRow({ tool, refreshKey, onAssociate }: { tool: Tool; refreshKey: number; onAssociate: (connected: boolean) => void }) {
  const status = useToolStatus(tool.id, refreshKey)
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        {tool.logo ? (
          <img src={tool.logo} alt="" className="size-6 shrink-0 rounded object-contain" />
        ) : (
          <span className="text-xl shrink-0" aria-hidden="true">{tool.logoEmoji}</span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium">{tool.name}</p>
          <p className="truncate text-xs text-muted-foreground">{tool.description}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {status === "loading" ? (
          <span className="size-2 animate-pulse rounded-full bg-muted-foreground/30" />
        ) : (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
              status === "connected"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-muted text-muted-foreground"
            }`}
          >
            <span
              className={`size-1.5 rounded-full ${
                status === "connected" ? "bg-emerald-500" : "bg-muted-foreground"
              }`}
            />
            {status === "connected" ? "Connecté" : "Non connecté"}
          </span>
        )}
        <Button size="sm" variant={status === "connected" ? "outline" : "default"} onClick={() => onAssociate(status === "connected")}>
          {status === "connected" ? "Gérer" : "Associer"}
        </Button>
      </div>
    </div>
  )
}

export function ToolsSection() {
  const [activeTool, setActiveTool] = useState<Tool | null>(null)
  const [activeConnected, setActiveConnected] = useState(false)
  const [open, setOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Outils connectés</h2>
        <p className="text-sm text-muted-foreground">
          Connectez vos services tiers pour importer et synchroniser vos données.
        </p>
      </div>
      <div className="divide-y divide-border rounded-lg border border-border px-4">
        {TOOLS.map((tool) => (
          <ToolRow
            key={tool.id}
            tool={tool}
            refreshKey={refreshKey}
            onAssociate={(connected) => {
              setActiveTool(tool)
              setActiveConnected(connected)
              setOpen(true)
            }}
          />
        ))}
      </div>
      <ToolAssociationModal
        tool={activeTool}
        open={open}
        onOpenChange={setOpen}
        onConnected={() => setRefreshKey((k) => k + 1)}
        connected={activeConnected}
      />
    </div>
  )
}
