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
    <div className="flex h-screen bg-background">
      {/* Sidebar — on lui passe collapsed + setter */}
      <ApiSidebar activePage="api-endpoints" collapsed={isCollapsed} onCollapse={toggleSidebar} />

      {/* Main content — suit la largeur de la sidebar */}
      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden transition-all duration-300 ease-in-out",
          isCollapsed ? "ml-[60px]" : "ml-64",
          "max-[916px]:ml-[60px]"
        )}
      >
        <ApiHeader />
        <RequestTabsManager />
      </div>
    </div>
  )
}
