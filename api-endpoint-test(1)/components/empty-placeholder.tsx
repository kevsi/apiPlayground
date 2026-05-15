"use client"

import { ApiSidebar } from "@/components/api-sidebar"
import { ApiHeader } from "@/components/api-header"
import { useState } from "react"
import { cn } from "@/lib/utils"

export function EmptyPlaceholder({ title, description, icon: Icon, activePage }: { title: string, description: string, icon: any, activePage: string }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-screen bg-background">
      <ApiSidebar activePage={activePage} collapsed={collapsed} onCollapse={setCollapsed} />
      <div
        className={cn(
          "flex flex-1 flex-col overflow-hidden transition-all duration-300 ease-in-out",
          collapsed ? "ml-[60px]" : "ml-64"
        )}
      >
        <ApiHeader />
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-500">
          <div className="size-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6 shadow-sm">
            <Icon className="size-10" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-3 text-foreground">{title}</h1>
          <p className="text-muted-foreground max-w-md text-lg">{description}</p>
        </div>
      </div>
    </div>
  )
}
