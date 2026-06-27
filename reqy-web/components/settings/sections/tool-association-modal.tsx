"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

export interface Tool {
  id: string
  name: string
  description: string
  logoEmoji: string
  scopes: string[]
  oauthUrl?: string
}

interface ToolAssociationModalProps {
  tool: Tool | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ToolAssociationModal({ tool, open, onOpenChange }: ToolAssociationModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  async function handleAssociate() {
    if (!tool) return
    if (!tool.oauthUrl) {
      toast({ title: "Bientôt disponible", description: `${tool.name} sera bientôt disponible.` })
      onOpenChange(false)
      return
    }
    setLoading(true)
    window.location.href = tool.oauthUrl
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {tool && (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                <span className="text-3xl" aria-hidden="true">{tool.logoEmoji}</span>
                <div>
                  <DialogTitle>Associer {tool.name}</DialogTitle>
                  <DialogDescription>{tool.description}</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="mb-2 font-medium">Autorisations demandées :</p>
              <ul className="space-y-1 text-muted-foreground">
                {tool.scopes.map((s) => (
                  <li key={s} className="flex gap-2">
                    <span aria-hidden="true">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
                Annuler
              </Button>
              <Button onClick={handleAssociate} disabled={loading}>
                {loading ? "Redirection…" : `Associer ${tool.name} →`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
