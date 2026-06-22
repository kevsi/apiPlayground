"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase-client"
import { isTauriAvailable } from "@/lib/tauri"

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
        const code = searchParams.get("code")
        const errorParam = searchParams.get("error")
        const errorDesc = searchParams.get("error_description")
        const errorCode = searchParams.get("error_code")
        const hashParams = new URLSearchParams(hash.slice(1))
        const accessToken = hashParams.get("access_token")
        const refreshToken = hashParams.get("refresh_token")
        const source = searchParams.get("source")
        const debug = `URL: ${fullUrl}\nSearch: ${search}\nHash: ${hash}\nuseSearchParams code: ${code ?? "(absent)"}\nHash access_token: ${accessToken ? "(présent)" : "(absent)"}\nHash refresh_token: ${refreshToken ? "(présent)" : "(absent)"}`
        setDebugInfo(debug)

        if (typeof window !== "undefined" && !isTauriAvailable() && source === "desktop" && window.location.hash.includes("access_token")) {
          window.location.href = "reqly://auth/callback" + window.location.hash
          return
        }

        if (errorParam || errorCode) {
          setError(`${errorDesc || errorParam || errorCode || "Erreur OAuth inconnue"}\n\nDebug:\n${debug}`)
          return
        }

        const supabase = getSupabaseBrowserClient()
        let session: { access_token: string; refresh_token?: string; expires_at?: number } | null = null
        let user: { id: string; email?: string | null; user_metadata?: Record<string, unknown>; app_metadata?: Record<string, unknown> } | null = null

        // 1. Essayer d'abord le flux PKCE (code dans la query string)
        if (code) {
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
          if (exchangeError || !data.session || !data.user) {
            setError(`${exchangeError?.message || "Échec de l'échange du code"}\n\nDebug:\n${debug}`)
            return
          }
          session = data.session
          user = data.user
        } else {
          // 2. Fallback : flux Implicit (token dans le hash)
          // getSession lit automatiquement le hash si detectSessionInUrl est activé
          const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

          if (!sessionError && sessionData.session) {
            session = sessionData.session
            user = sessionData.session.user
          } else if (accessToken && refreshToken) {
            // Fallback manuel : extraire le hash et définir la session explicitement
            const { data: setData, error: setSessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            })
            if (setSessionError || !setData.session) {
              setError(`${setSessionError?.message || "Échec de la définition de la session depuis le hash"}\n\nDebug:\n${debug}`)
              return
            }
            session = setData.session
            user = setData.session.user
          } else {
            setError(`Code ou session manquant.\n\nDebug:\n${debug}`)
            return
          }
        }

        if (!session || !user) {
          setError(`Session ou utilisateur manquant après authentification.\n\nDebug:\n${debug}`)
          return
        }

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

        // Rechargement complet pour que la page settings lise le cookie frais
        if (typeof window !== "undefined") {
          window.location.replace("/settings#account")
        }
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
