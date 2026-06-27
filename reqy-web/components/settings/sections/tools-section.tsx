"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ToolAssociationModal, type Tool } from "./tool-association-modal"

const TOOLS: Tool[] = [
  {
    id: "postman",
    name: "Postman",
    description: "Import et export de collections Postman.",
    logoEmoji: "📮",
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
    scopes: ["Lecture de vos repositories", "Lecture de votre profil", "Création de gists"],
    oauthUrl: "/api/github-auth",
  },
  {
    id: "linear",
    name: "Linear",
    description: "Synchronisation avec vos tickets Linear (bêta).",
    logoEmoji: "⚡",
    scopes: ["Lecture de vos tickets"],
    // Pas de oauthUrl → stub
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

function ToolCard({ tool, refreshKey, onAssociate }: { tool: Tool; refreshKey: number; onAssociate: () => void }) {
  const status = useToolStatus(tool.id, refreshKey)
  return (
    <Card className="flex flex-col gap-3 p-5 transition-all hover:border-primary/30 hover:shadow-md">
      <div className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden="true">{tool.logoEmoji}</span>
        <h3 className="text-base font-semibold">{tool.name}</h3>
      </div>
      <p className="line-clamp-2 text-sm text-muted-foreground">{tool.description}</p>
      <div className="mt-auto flex items-center justify-between gap-2">
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
        <Button size="sm" variant={status === "connected" ? "outline" : "default"} onClick={onAssociate}>
          {status === "connected" ? "Gérer" : "Associer"}
        </Button>
      </div>
    </Card>
  )
}

export function ToolsSection() {
  const [activeTool, setActiveTool] = useState<Tool | null>(null)
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TOOLS.map((tool) => (
          <ToolCard
            key={tool.id}
            tool={tool}
            refreshKey={refreshKey}
            onAssociate={() => {
              setActiveTool(tool)
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
      />
    </div>
  )
}
