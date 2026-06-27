"use client"

import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { RequestTabsManager } from "@/components/request-tabs-manager"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { useSidebar } from "@/contexts/sidebar-context"

export default function ApiTestingDashboard() {
  const { isCollapsed, toggleSidebar } = useSidebar()

  return (
    <div className="flex h-screen bg-background bg-dot-pattern">
      {/* Sidebar — on lui passe collapsed + setter */}
      <ApiSidebar activePage="api-endpoints" collapsed={isCollapsed} onCollapse={toggleSidebar} />

      {/* Main content — suit la largeur de la sidebar */}
      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden transition-[margin] duration-200 ease-out main-content relative",
          isCollapsed ? "ml-[60px]" : "ml-64"
        )}
      >
        {/* Subtle top accent bar */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent pointer-events-none" />
        <ApiHeader />
        {/* Zone scrollable — RequestTabsManager peut dépasser du viewport (panels, logs, etc.) */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <RequestTabsManager />
        </div>
      </div>
    </div>
  )
}
