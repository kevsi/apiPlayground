"use client"

import { useState, type FormEvent } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

export interface Tool {
  id: string
  name: string
  description: string
  logoEmoji: string
  logo?: string
  scopes: string[]
  oauthUrl?: string
  apiKey?: {
    endpoint: string
    placeholder: string
    instructions: string
  }
}

interface ToolAssociationModalProps {
  tool: Tool | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected?: () => void
  connected?: boolean
}

function ApiKeyForm({ tool, onSuccess }: { tool: Tool; onSuccess: () => void }) {
  const { toast } = useToast()
  const [apiKey, setApiKey] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState(false)
  const config = tool.apiKey!

  const isValid = /^PMAK-[A-Za-z0-9_-]+$/.test(apiKey.trim())

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isValid) {
      setError("La clé doit commencer par PMAK-")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? "Clé rejetée par le serveur")
        return
      }
      toast({ title: "Connecté", description: `Outil ${tool.name} associé avec succès.` })
      onSuccess()
    } catch {
      setError("Erreur réseau, réessayez")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="mb-1 font-medium">Comment obtenir votre clé :</p>
        <p className="text-muted-foreground">{config.instructions}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="api-key">Clé API</Label>
        <div className="flex items-center gap-2">
          <Input
            id="api-key"
            type={show ? "text" : "password"}
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setError(null) }}
            placeholder={config.placeholder}
            autoComplete="off"
            spellCheck={false}
            required
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Masquer" : "Afficher"}
          >
            {show ? "🙈" : "👁"}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={!isValid || loading}>
          {loading ? "Validation…" : "Valider et connecter"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function OAuthFlow({ tool, onOpenChange }: { tool: Tool; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  async function handleAssociate() {
    if (!tool.oauthUrl) {
      toast({ title: "Bientôt disponible", description: `${tool.name} sera bientôt disponible.` })
      onOpenChange(false)
      return
    }
    setLoading(true)
    window.location.href = tool.oauthUrl
  }

  return (
    <>
      {tool.scopes.length > 0 && (
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
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
          Annuler
        </Button>
        <Button onClick={handleAssociate} disabled={loading}>
          {loading ? "Redirection…" : `Associer ${tool.name} →`}
        </Button>
      </DialogFooter>
    </>
  )
}

function DisconnectView({ tool, onDisconnected }: { tool: Tool; onDisconnected: () => void }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const endpoint =
    tool.id === "github"
      ? "/api/github-auth/logout"
      : tool.id === "postman"
        ? "/api/postman-auth"
        : null

  async function handleDisconnect() {
    if (!endpoint) return
    setLoading(true)
    try {
      const res = await fetch(endpoint, { method: "DELETE", credentials: "include" })
      if (!res.ok) throw new Error()
      toast({ title: "Déconnecté", description: `${tool.name} a été déconnecté.` })
      onDisconnected()
    } catch {
      toast({ title: "Erreur", description: "Impossible de se déconnecter, réessayez." })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Vous êtes actuellement connecté à <strong>{tool.name}</strong>.
      </p>
      <DialogFooter>
        <Button variant="outline" onClick={() => onDisconnected()}>
          Fermer
        </Button>
        <Button variant="destructive" onClick={handleDisconnect} disabled={loading}>
          {loading ? "Déconnexion…" : "Se déconnecter"}
        </Button>
      </DialogFooter>
    </div>
  )
}

export function ToolAssociationModal({ tool, open, onOpenChange, onConnected, connected }: ToolAssociationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {tool && (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                {tool.logo ? (
                  <img src={tool.logo} alt="" className="size-8 shrink-0 rounded object-contain" />
                ) : (
                  <span className="text-3xl" aria-hidden="true">{tool.logoEmoji}</span>
                )}
                <div>
                  <DialogTitle>{connected ? tool.name : `Associer ${tool.name}`}</DialogTitle>
                  <DialogDescription>{tool.description}</DialogDescription>
                </div>
              </div>
            </DialogHeader>
            {connected ? (
              <DisconnectView tool={tool} onDisconnected={() => { onOpenChange(false); onConnected?.() }} />
            ) : tool.apiKey ? (
              <ApiKeyForm tool={tool} onSuccess={() => { onOpenChange(false); onConnected?.() }} />
            ) : (
              <OAuthFlow tool={tool} onOpenChange={onOpenChange} />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
