"use client"

import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { RequestTabsManager } from "@/components/request-tabs-manager"
import { useState } from "react"
import { cn } from "@/lib/utils"

export default function ApiTestingDashboard() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar — on lui passe collapsed + setter */}
      <ApiSidebar activePage="api-endpoints" collapsed={collapsed} onCollapse={setCollapsed} />

      {/* Main content — suit la largeur de la sidebar */}
      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden transition-all duration-300 ease-in-out",
          collapsed ? "ml-[60px]" : "ml-64"
        )}
      >
        <ApiHeader />
        <RequestTabsManager />
      </div>
    </div>
  )
}
