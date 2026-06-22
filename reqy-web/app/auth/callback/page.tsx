"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase-client"

export default function AuthCallbackPage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function handleCallback() {
      try {
        const params = new URLSearchParams(window.location.search)
        const code = params.get("code")
        const errorParam = params.get("error")
        const errorDesc = params.get("error_description")

        if (errorParam) {
          setError(errorDesc || errorParam)
          return
        }

        if (!code) {
          setError("Code d'authentification manquant")
          return
        }

        const supabase = getSupabaseBrowserClient()
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

        if (exchangeError || !data.session || !data.user) {
          setError(exchangeError?.message || "Échec de l'échange du code")
          return
        }

        const user = data.user
        const session = data.session

        const res = await fetch("/api/auth/exchange", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Utilisateur",
            provider: user.app_metadata?.provider || "local",
            userId: user.id,
            accessToken: session.access_token,
            refreshToken: session.refresh_token,
            expiresAt: session.expires_at,
          }),
          credentials: "include",
        })

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setError(body.error || "Échec de la création de la session")
          return
        }

        router.push("/settings#account")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inattendue")
      }
    }

    handleCallback()
  }, [router])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <h1 className="text-lg font-semibold text-destructive">Erreur d'authentification</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => router.push("/settings#account")}
            className="mt-4 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Retour aux paramètres
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Authentification en cours...</p>
      </div>
    </div>
  )
}
