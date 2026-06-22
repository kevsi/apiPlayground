"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { isTauriAvailable } from "@/lib/tauri"

/**
 * Hook qui écoute les deep links Tauri (reqly://) via le plugin deep-link.
 * Quand un lien reqly://auth/callback arrive, redirige vers /auth/callback
 * en préservant le hash (#access_token=...) pour que la page de callback
 * puisse traiter les tokens Supabase.
 */
export function useDeepLink() {
  const router = useRouter()

  useEffect(() => {
    if (!isTauriAvailable()) return

    let unlisten: (() => void) | undefined

    async function setup() {
      try {
        const { getCurrent, onOpenUrl } = await import("@tauri-apps/plugin-deep-link")

        // 1. Vérifier si l'app a été démarrée via un deep link
        const currentUrls = await getCurrent()
        if (currentUrls && currentUrls.length > 0) {
          for (const url of currentUrls) {
            if (url.startsWith("reqly://auth/callback")) {
              redirectToCallback(url)
              return
            }
          }
        }

        // 2. Écouter les futurs deep links
        unlisten = await onOpenUrl((urls) => {
          for (const url of urls) {
            if (url.startsWith("reqly://auth/callback")) {
              redirectToCallback(url)
              return
            }
          }
        })
      } catch {
        // Plugin indisponible — ignorer silencieusement
      }
    }

    setup()

    return () => {
      unlisten?.()
    }
  }, [router])
}

function redirectToCallback(url: string) {
  try {
    // Préserver les éventuels query params et le hash du custom scheme
    const urlObj = new URL(url)
    const search = urlObj.search
    const hash = urlObj.hash
    if (typeof window !== "undefined") {
      window.location.replace(`/auth/callback${search}${hash}`)
    }
  } catch {
    // Ignorer les erreurs de parsing
  }
}
