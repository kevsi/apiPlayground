"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface IntegrationsSectionProps {
  githubStatus: "loading" | "connected" | "disconnected" | "error"
  githubUser: { login: string; name?: string; avatar_url?: string } | null
  githubConnecting: boolean
  postmanStatus: "loading" | "connected" | "disconnected" | "error"
  postmanUser: { id: string; name?: string; email?: string } | null
  postmanApiKey: string
  postmanConnecting: boolean
  onConnectGithub: () => void
  onDisconnectGithub: () => void
  setPostmanApiKey: (val: string) => void
  onConnectPostman: () => void
  onDisconnectPostman: () => void
}

export default function IntegrationsSection({
  githubStatus, githubUser, githubConnecting,
  postmanStatus, postmanUser, postmanApiKey, postmanConnecting,
  onConnectGithub, onDisconnectGithub,
  setPostmanApiKey, onConnectPostman, onDisconnectPostman,
}: IntegrationsSectionProps) {
  return (
    <section className="rounded-3xl border border-border bg-card p-6 space-y-6">
      <div className="mb-4 flex items-center gap-3 text-foreground">
        <div className="size-5 rounded-2xl bg-primary/10 p-2 text-primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
            <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Z" />
            <path d="M8 12h8" />
            <path d="M12 8v8" />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold">Outils connectés</h2>
          <p className="text-sm text-muted-foreground">Configurez vos intégrations externes. GitHub et Postman sont pris en charge.</p>
        </div>
      </div>

      {/* GitHub Integration */}
      <div className="rounded-3xl border border-border p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/github.png" alt="GitHub" className="h-10 w-10 rounded-full bg-white p-1" />
            <div>
              <p className="text-sm font-semibold">GitHub</p>
              <p className="text-xs text-muted-foreground mt-1">Connectez-vous à GitHub pour éviter les limites de taux anonymes.</p>
            </div>
          </div>
          <div className={cn("rounded-full px-3 py-1 text-xs font-semibold", githubStatus === "connected" ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700")}>
            {githubStatus === "connected" ? "Connecté" : githubStatus === "loading" ? "Vérification..." : githubStatus === "error" ? "Erreur" : "Non connecté"}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            {githubStatus === "connected" && githubUser ? (
              <div className="flex items-center gap-3">
                {githubUser.avatar_url ? (
                  <img src={githubUser.avatar_url} alt="Avatar GitHub" className="h-10 w-10 rounded-full" />
                ) : null}
                <div>
                  <p className="text-sm font-semibold">{githubUser.login}</p>
                  {githubUser.name ? <p className="text-xs text-muted-foreground">{githubUser.name}</p> : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune connexion GitHub active.</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onConnectGithub} disabled={githubStatus === "connected" || githubConnecting}>
              {githubConnecting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="size-4 animate-spin" />
                  Connexion GitHub…
                </span>
              ) : (
                "Se connecter avec GitHub"
              )}
            </Button>
            <Button variant="secondary" onClick={onDisconnectGithub} disabled={githubStatus !== "connected"}>Déconnecter</Button>
            {githubStatus === "connected" ? (
              <span className="text-sm text-muted-foreground">GitHub est lié.</span>
            ) : githubStatus === "error" ? (
              <span className="text-sm text-destructive">Impossible de vérifier votre connexion GitHub.</span>
            ) : (
              <span className="text-sm text-muted-foreground">Aucune connexion GitHub active.</span>
            )}
          </div>
          {githubConnecting ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 flex items-center gap-2">
              <Loader2 className="size-4 animate-spin text-slate-500" />
              <span>Connexion GitHub en cours. Vérifiez la fenêtre GitHub ouverte, puis revenez ici.</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Postman Integration */}
      <div className="rounded-3xl border border-border p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <img src="/postman.png" alt="Postman" className="h-10 w-10 rounded-full bg-white p-1" />
              <div>
                <p className="text-sm font-semibold">Postman</p>
                <p className="text-xs text-muted-foreground mt-1">Connectez-vous à Postman pour importer/exporter vos collections.</p>
              </div>
            </div>
          </div>
          <div className={cn("rounded-full px-3 py-1 text-xs font-semibold", postmanStatus === "connected" ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700")}>
            {postmanStatus === "connected" ? "Connecté" : postmanStatus === "loading" ? "Vérification..." : postmanStatus === "error" ? "Erreur" : "Non connecté"}
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div>
            {postmanStatus === "connected" && postmanUser ? (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <img src="/postman.png" alt="Postman" className="h-10 w-10 rounded-full bg-white p-1" />
                <div>
                  <p className="text-sm font-semibold text-emerald-900">{postmanUser.name || "Utilisateur Postman"}</p>
                  <p className="text-xs text-emerald-700">{postmanUser.email || "Connecté"}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Aucune connexion Postman active.</p>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Clé API Postman</label>
              <Input
                type="password"
                value={postmanApiKey}
                onChange={(e) => setPostmanApiKey(e.target.value)}
                placeholder="Entrez votre clé API Postman"
                disabled={postmanStatus === "connected"}
              />
              <p className="text-xs text-muted-foreground">
                Récupérez votre clé depuis{' '}
                <span className="font-semibold">https://web.postman.co/settings/me/api-keys</span>.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={onConnectPostman} disabled={postmanStatus === "connected" || postmanConnecting}>
                {postmanConnecting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    Connexion…
                  </span>
                ) : (
                  "Se connecter avec Postman"
                )}
              </Button>
              <Button variant="secondary" onClick={onDisconnectPostman} disabled={postmanStatus !== "connected"}>Déconnecter</Button>
            </div>
            {postmanConnecting ? (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 flex items-center gap-2">
                <Loader2 className="size-4 animate-spin text-slate-500" />
                <span>Vérification de la clé Postman en cours…</span>
              </div>
            ) : null}
          </div>

          {postmanStatus === "connected" ? (
            <span className="text-sm text-muted-foreground">Postman est lié. Vous pouvez importer/exporter depuis l'interface collections.</span>
          ) : (
            <span className="text-sm text-muted-foreground">Connectez-vous pour activer l'intégration Postman.</span>
          )}
        </div>
      </div>
    </section>
  )
}
