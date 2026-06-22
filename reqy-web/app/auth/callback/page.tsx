"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase-client"

function AuthCallbackHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<string>("")

  useEffect(() => {
    async function handleCallback() {
      try {
        // Capture l'URL complète pour le debug (window.location est la source de vérité)
        const fullUrl = typeof window !== "undefined" ? window.location.href : ""
        const search = typeof window !== "undefined" ? window.location.search : ""
        const hash = typeof window !== "undefined" ? window.location.hash : ""
        const debug = `URL: ${fullUrl}\nSearch: ${search}\nHash: ${hash}\nuseSearchParams code: ${searchParams.get("code") ?? "(absent)"}`
        setDebugInfo(debug)

        // Utilise useSearchParams pour lire les paramètres (plus robuste avec App Router)
        const code = searchParams.get("code")
        const errorParam = searchParams.get("error")
        const errorDesc = searchParams.get("error_description")
        const errorCode = searchParams.get("error_code")

        if (errorParam || errorCode) {
          setError(`${errorDesc || errorParam || errorCode || "Erreur OAuth inconnue"}\n\nDebug:\n${debug}`)
          return
        }

        if (!code) {
          setError(`Code d'authentification manquant.\n\nDebug:\n${debug}`)
          return
        }

        const supabase = getSupabaseBrowserClient()
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

        if (exchangeError || !data.session || !data.user) {
          setError(`${exchangeError?.message || "Échec de l'échange du code"}\n\nDebug:\n${debug}`)
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
          setError(`${body.error || "Échec de la création de la session"}\n\nDebug:\n${debug}`)
          return
        }

        router.push("/settings#account")
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inattendue")
      }
    }

    handleCallback()
  }, [router, searchParams])

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-2xl border border-border bg-card p-8 text-center max-w-lg">
          <h1 className="text-lg font-semibold text-destructive">Erreur d'authentification</h1>
          <p className="mt-2 text-sm text-muted-foreground whitespace-pre-line">{error}</p>
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
      <div className="text-center max-w-lg">
        <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Authentification en cours...</p>
        {debugInfo && (
          <pre className="mt-4 rounded-lg bg-muted p-4 text-left text-xs text-muted-foreground overflow-auto">
            {debugInfo}
          </pre>
        )}
      </div>
    </div>
  )
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="text-sm text-muted-foreground">Chargement...</p>
          </div>
        </div>
      }
    >
      <AuthCallbackHandler />
    </Suspense>
  )
}
