"use client"

import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { GraphqlTabsManager } from "@/components/graphql/graphql-tabs-manager"
import { useSidebar } from "@/contexts/sidebar-context"
import { cn } from "@/lib/utils"

export default function GraphqlPage() {
  const { isCollapsed, toggleSidebar } = useSidebar()

  return (
    <div className="flex h-screen bg-background bg-dot-pattern">
      <ApiSidebar activePage="graphql" collapsed={isCollapsed} onCollapse={toggleSidebar} />
      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden transition-[margin] duration-200 ease-out main-content relative",
          isCollapsed ? "ml-[60px]" : "ml-64",
          "max-[916px]:ml-[60px]",
        )}
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent pointer-events-none" />
        <ApiHeader />
        <main
          className="flex-1 overflow-hidden flex flex-col"
          data-testid="graphql-page"
        >
          <GraphqlTabsManager />
        </main>
      </div>
    </div>
  )
}
