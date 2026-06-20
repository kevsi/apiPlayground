"use client"

import { createContext, useContext, useEffect, useState, useMemo } from "react"
import { persistence } from "@/lib/persistence"

export type Theme = "light" | "dark" | "emerald" | "ocean" | "sunset" | "purple" | "midnight"

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: "light",
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "reqly-theme",
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(defaultTheme)
  const [mounted, setMounted] = useState(false)

  // Sync React state with DOM/persistence after hydration
  useEffect(() => {
    const t = window.setTimeout(() => {
      setMounted(true)
      const stored = persistence.getItem<Theme>(storageKey) as Theme | null
      if (stored) {
        setTheme(stored)
      } else {
        // Detect system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        setTheme(prefersDark ? 'dark' : 'light')
      }
    }, 0)
    return () => window.clearTimeout(t)
  }, [storageKey])

  // Sync DOM class & persist whenever theme changes
  useEffect(() => {
    if (!mounted) return
    const root = document.documentElement
    root.classList.remove("light", "dark", "emerald", "ocean", "sunset", "purple", "midnight")
    root.classList.add(theme)
    try { void persistence.setItem(storageKey, theme) } catch { /* ignore */ }
  }, [theme, mounted, storageKey])

  const ctxValue = useMemo(() => ({ theme, setTheme }), [theme, setTheme])

  return (
    <ThemeProviderContext.Provider value={ctxValue}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider")

  return context
}
