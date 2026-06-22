"use client"

import { Loader2, ShieldAlert, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

interface AccountSectionProps {
  authStatus: "loading" | "connected" | "disconnected" | "error"
  authUser: { email: string; name: string; provider: string } | null
  authEmail: string
  authPassword: string
  authError: string | null
  authConnecting: boolean
  onEmailChange: (val: string) => void
  onPasswordChange: (val: string) => void
  onLogin: () => void
  onSignup: () => void
  onConnectGoogle: () => void
  onConnectGithub: () => void
  onLogout: () => void
  onDeactivate: () => void
  onDelete: () => void
}

export default function AccountSection({
  authStatus, authUser, authEmail, authPassword, authError, authConnecting,
  onEmailChange, onPasswordChange,
  onLogin, onSignup, onConnectGoogle, onConnectGithub,
  onLogout, onDeactivate, onDelete,
}: AccountSectionProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <ShieldAlert className="size-5 text-primary" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base">Actions du compte</CardTitle>
            <CardDescription>Gérez votre compte et votre connexion à l'application.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Sous-card Connexion */}
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <p className="text-sm font-semibold">Connexion</p>
            <div className={cn("rounded-full px-3 py-1 text-xs font-semibold", authStatus === "connected" ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700")}>
              {authStatus === "connected" ? "Connecté" : authStatus === "loading" ? "Vérification..." : authStatus === "error" ? "Erreur" : "Non connecté"}
            </div>
          </div>

          {authStatus === "connected" && authUser ? (
            <>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-emerald-200 grid place-items-center text-emerald-900 font-semibold">
                  {authUser.name?.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold">{authUser.name}</p>
                  <p className="text-xs text-muted-foreground">{authUser.email}</p>
                  <p className="text-xs text-muted-foreground">Fournisseur : {authUser.provider}</p>
                </div>
              </div>
              <CardFooter className="border-t pt-4 mt-4 px-0">
                <Button onClick={onLogout}>Se déconnecter</Button>
              </CardFooter>
            </>
          ) : (
            <Collapsible defaultOpen>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="flex items-center gap-2 px-0 hover:px-2 transition-all">
                  <span className="text-sm">Formulaire de connexion</span>
                  <ChevronsUpDown className="size-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-4 space-y-4">
                <div className="space-y-3 rounded-3xl border border-border bg-muted p-4">
                  <div className="grid gap-3">
                    <label className="text-sm font-medium">Email</label>
                    <Input
                      type="email"
                      value={authEmail}
                      onChange={(e) => onEmailChange(e.target.value)}
                      placeholder="votre@example.com"
                    />
                    <label className="text-sm font-medium">Mot de passe</label>
                    <Input
                      type="password"
                      value={authPassword}
                      onChange={(e) => onPasswordChange(e.target.value)}
                      placeholder="8 caractères minimum"
                    />
                    {authError ? <p className="text-sm text-destructive">{authError}</p> : null}
                    <div className="flex flex-wrap items-center gap-2">
                      <Button onClick={onLogin} disabled={authConnecting}>
                        {authConnecting ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="size-4 animate-spin" />
                            Connexion…
                          </span>
                        ) : "Se connecter"}
                      </Button>
                      <Button variant="secondary" onClick={onSignup} disabled={authConnecting}>
                        {authConnecting ? "Création de compte…" : "Créer un compte"}
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="secondary" onClick={onConnectGoogle} disabled={authConnecting}>
                        {authConnecting ? "Connexion Google…" : "Se connecter avec Google"}
                      </Button>
                      <Button variant="secondary" onClick={onConnectGithub} disabled={authConnecting}>
                        {authConnecting ? "Connexion GitHub…" : "Se connecter avec GitHub"}
                      </Button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">La connexion est gérée par Supabase Auth : email/password, Google et GitHub.</p>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>

        <Separator />

        {/* Danger zone */}
        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Désactiver mon compte</p>
                <p className="text-xs text-muted-foreground mt-1">Le compte sera réactivé lorsque vous vous reconnecterez.</p>
              </div>
              <Button variant="ghost" onClick={onDeactivate}>Désactiver</Button>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">Supprimer mon compte</p>
                <p className="text-xs text-muted-foreground mt-1">Suppression permanente et irréversible.</p>
              </div>
              <Button variant="destructive" onClick={onDelete}>Supprimer</Button>
            </div>
          </div>
        </div>

      </CardContent>
    </Card>
  )
}