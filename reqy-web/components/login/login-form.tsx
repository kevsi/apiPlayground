"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { getSupabaseBrowserClient } from "@/lib/supabase-client"
import { isTauriAvailable } from "@/lib/tauri"
import { safeRedirect } from "@/lib/redirect"

interface LoginFormProps {
  redirect?: string
}

export function LoginForm({ redirect }: LoginFormProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  async function handleEmailLogin(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: "Erreur", description: data.message || "Impossible de se connecter", variant: "destructive" })
        return
      }
      toast({ title: "Connecté", description: `Bienvenue ${data.user?.name ?? email}` })
      router.replace(safeRedirect(redirect))
    } catch {
      toast({ title: "Erreur réseau", description: "Vérifiez votre connexion", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  async function handleOAuth(provider: "google" | "github") {
    setLoading(true)
    try {
      const supabase = getSupabaseBrowserClient()
      const redirectTo = `${window.location.origin}/auth/callback${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      })
      if (error || !data?.url) throw error ?? new Error("URL OAuth manquante")
      if (isTauriAvailable()) {
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("open_external", { url: data.url })
      } else {
        window.location.href = data.url
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur OAuth"
      toast({ title: "Erreur OAuth", description: msg, variant: "destructive" })
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={loading}
          onClick={() => handleOAuth("google")}
        >
          <span className="mr-2">🔵</span> Continuer avec Google
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={loading}
          onClick={() => handleOAuth("github")}
        >
          <span className="mr-2">⚫</span> Continuer avec GitHub
        </Button>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-2 text-muted-foreground">ou avec votre email</span>
        </div>
      </div>

      <form onSubmit={handleEmailLogin} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Connexion…" : "Se connecter"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Pas encore de compte ?{" "}
        <Link
          href={`/signup${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`}
          className="font-medium text-primary hover:underline"
        >
          Créer un compte
        </Link>
      </p>
    </div>
  )
}
