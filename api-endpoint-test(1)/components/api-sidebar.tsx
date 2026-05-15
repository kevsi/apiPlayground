"use client"

import Link from "next/link"
import {
  LayoutDashboard,
  Zap,
  Key,
  BarChart3,
  Sparkles,
  FileText,
  Settings,
  ChevronDown,
  Folder,
  FolderCode,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { useState } from "react"

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", key: "dashboard" },
  { icon: Zap, label: "API Endpoints", href: "/", key: "api-endpoints" },
  { icon: Folder, label: "Collections", href: "/collections", key: "collections" },
  { icon: FolderCode, label: "Projects", href: "/my-projects", key: "projects" },
  { icon: Key, label: "API Keys", href: "/api-keys", key: "api-keys" },
  { icon: BarChart3, label: "Analytics", href: "/analytics", key: "analytics" },
  { icon: Sparkles, label: "AI Insights", href: "/ai-insights", key: "ai-insights" },
  { icon: FileText, label: "Documentation", href: "/documentation", key: "documentation" },
  { icon: Settings, label: "Settings", href: "/settings", key: "settings" },
]

interface ApiSidebarProps {
  activePage?: string
  collapsed?: boolean
  onCollapse?: (v: boolean) => void
}

export function ApiSidebar({ activePage = "api-endpoints", collapsed: controlledCollapsed, onCollapse }: ApiSidebarProps) {
  const [internalCollapsed, setInternalCollapsed] = useState(false)
  const collapsed = controlledCollapsed ?? internalCollapsed
  const setCollapsed = (v: boolean) => {
    setInternalCollapsed(v)
    onCollapse?.(v)
  }

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex h-screen flex-col border-r border-border bg-sidebar transition-all duration-300 ease-in-out",
        collapsed ? "w-[60px]" : "w-64"
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center border-b border-border px-3 py-4 transition-all duration-300",
        collapsed ? "justify-center" : "gap-3 px-4"
      )}>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary">
          <Zap className="size-5 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="flex flex-col overflow-hidden">
            <span className="truncate text-sm font-semibold text-foreground">Zendeeps Space</span>
            <span className="truncate text-xs text-muted-foreground">Pro | 12 Members</span>
          </div>
        )}
        {!collapsed && <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = item.key === activePage
            return (
              <li key={item.label}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "flex items-center rounded-lg px-2 py-2 text-sm font-medium transition-colors",
                    collapsed ? "justify-center" : "gap-3 px-3",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <item.icon className={cn("size-4 shrink-0", isActive && "text-primary")} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* AI Assistant */}
      {!collapsed ? (
        <div className="px-3 py-2">
          <button className="flex w-full items-center gap-3 rounded-lg bg-gradient-to-r from-secondary to-accent px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:opacity-90">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
              <Sparkles className="size-4 text-primary-foreground" />
            </div>
            <span>Ask Monu AI</span>
            <span className="ml-auto flex size-2 rounded-full bg-red-500" />
          </button>
        </div>
      ) : (
        <div className="px-2 py-2">
          <button
            title="Ask Monu AI"
            className="flex w-full items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/70 p-2 transition-colors hover:opacity-90"
          >
            <Sparkles className="size-4 text-primary-foreground" />
          </button>
        </div>
      )}

      {/* User Profile */}
      <div className="border-t border-border px-2 py-3">
        {!collapsed ? (
          <div className="flex items-center gap-3 px-1">
            <Avatar className="size-8 shrink-0">
              <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=nurul" alt="Nurul" />
              <AvatarFallback>NZ</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-foreground">Nurul&apos;s Zone</span>
              <span className="truncate text-xs text-muted-foreground">nurul@zendeeps.com</span>
            </div>
            <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
          </div>
        ) : (
          <div className="flex justify-center">
            <Avatar className="size-8">
              <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=nurul" alt="Nurul" />
              <AvatarFallback>NZ</AvatarFallback>
            </Avatar>
          </div>
        )}
      </div>

      {/* Collapse toggle button */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-[72px] flex size-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronsRight className="size-3.5" />
        ) : (
          <ChevronsLeft className="size-3.5" />
        )}
      </button>
    </aside>
  )
}
