"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export type AuthStatus = "loading" | "connected" | "disconnected"
export type AuthProvider = "local" | "google" | "github"

export interface AuthUser {
  email: string
  name: string
  provider: AuthProvider
}

export interface UseAuthReturn {
  status: AuthStatus
  user: AuthUser | null
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const STATUS_URL = "/api/auth/status"
const LOGOUT_URL = "/api/auth/logout"

export function useAuth(): UseAuthReturn {
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [user, setUser] = useState<AuthUser | null>(null)
  const router = useRouter()

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(STATUS_URL, { credentials: "include", cache: "no-store" })
      if (!res.ok) {
        setStatus("disconnected")
        setUser(null)
        return
      }
      const data = await res.json()
      if (data.connected && data.user) {
        setStatus("connected")
        setUser(data.user)
      } else {
        setStatus("disconnected")
        setUser(null)
      }
    } catch {
      setStatus("disconnected")
      setUser(null)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch(LOGOUT_URL, { method: "POST", credentials: "include" })
    } catch {
      /* still clear local state */
    }
    setStatus("disconnected")
    setUser(null)
    router.refresh()
  }, [router])

  useEffect(() => {
    void refresh()
    const onFocus = () => { void refresh() }
    const onStorage = (e: StorageEvent) => {
      if (e.key === "auth_session") void refresh()
    }
    window.addEventListener("focus", onFocus)
    window.addEventListener("storage", onStorage)
    return () => {
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("storage", onStorage)
    }
  }, [refresh])

  return { status, user, refresh, logout }
}
