"use client"

import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { useSidebar } from "@/contexts/sidebar-context"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { ShortcutsRegistrar } from "@/hooks/use-shortcuts"

// Maps URL segment → ApiSidebar `activePage` value.
// Centralised here so adding a new page only requires updating one mapping.
const ACTIVE_PAGE_MAP: Record<string, string> = {
  "": "api-endpoints",
  "dashboard": "dashboard",
  "collections": "collections",
  "mocks": "mocks",
  "settings": "settings",
  "runner": "runner",
  "ai-insights": "ai-insights",
  "documentation": "documentation",
  "workspaces": "workspaces",
  "graphql": "graphql",
  "my-projects": "projects", // URL /my-projects but sidebar expects "projects"
  "sdks": "sdks",
  "websocket": "websocket",
  "git": "git",
  "sse": "sse",
}

function getActivePage(pathname: string): string {
  const segment = pathname.split("/")[1] ?? ""
  return ACTIVE_PAGE_MAP[segment] ?? "api-endpoints"
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { isCollapsed, toggleSidebar } = useSidebar()
  const pathname = usePathname()
  const activePage = getActivePage(pathname)

  return (
    <div className="flex h-screen bg-background bg-dot-pattern">
      <ApiSidebar activePage={activePage} collapsed={isCollapsed} onCollapse={toggleSidebar} />

      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden transition-[margin] duration-200 ease-out main-content relative",
          isCollapsed ? "ml-[60px]" : "ml-64",
          "max-[916px]:ml-[60px]"
        )}
      >
        <ShortcutsRegistrar />
        <ApiHeader />
        {children}
      </div>
    </div>
  )
}
