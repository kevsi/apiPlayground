"use client"

import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react"
import { useIsMobile } from "@/hooks/use-mobile"

interface SidebarContextType {
  isCollapsed: boolean
  toggleSidebar: () => void
  collapseSidebar: () => void
  expandSidebar: () => void
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(true)

  const isNarrow = useIsMobile(916)

  // Load from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed")
    if (stored) {
      const t = window.setTimeout(() => setIsCollapsed(JSON.parse(stored)), 0)
      return () => window.clearTimeout(t)
    }
    return
  }, [])

  // Close sidebar automatically on narrower desktop widths
  useEffect(() => {
    if (isNarrow) {
      const t = window.setTimeout(() => setIsCollapsed(true), 0)
      return () => window.clearTimeout(t)
    }
  }, [isNarrow])

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", JSON.stringify(isCollapsed))
  }, [isCollapsed])

  const toggleSidebar = () => setIsCollapsed((prev) => !prev)
  const collapseSidebar = () => setIsCollapsed(true)
  const expandSidebar = () => setIsCollapsed(false)

  const ctxValue = useMemo(
    () => ({ isCollapsed, toggleSidebar, collapseSidebar, expandSidebar }),
    [isCollapsed, toggleSidebar, collapseSidebar, expandSidebar]
  )

  return (
    <SidebarContext.Provider value={ctxValue}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return context
}
