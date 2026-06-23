"use client"

import Link from "next/link"
import {
  LayoutDashboard,
  Zap,
  Sparkles,
  FileText,
  Settings,
  ChevronDown,
  Folder,
  FolderCode,
  FlaskConical,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { AppIcon } from "@/components/app-icon"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { useState } from "react"
import { WorkspaceJoinDialog } from "@/components/workspace-join-dialog"
import { useSyncState } from "@/hooks/store/sync-state"

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", key: "dashboard" },
  { icon: Zap, label: "API Endpoints", href: "/", key: "api-endpoints" },
  { icon: Folder, label: "Collections", href: "/collections", key: "collections" },
  { icon: FolderCode, label: "Projects", href: "/my-projects", key: "projects" },
  { icon: FlaskConical, label: "Mock Server", href: "/mocks", key: "mocks" },
  { icon: Sparkles, label: "AI Assistant", href: "/ai-insights", key: "ai-insights" },
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
  const syncWorkspaceId = useSyncState((s) => s.workspaceId)
  const syncEnabled = useSyncState((s) => s.enabled)

  return (
    <aside
      aria-label="Main navigation"
      className={cn(
        "group/sidebar fixed inset-y-0 left-0 z-30 flex h-screen flex-col border-r bg-sidebar transition-[width] duration-200 ease-out will-change-auto",
        collapsed ? "w-[60px]" : "w-64"
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center border-b border-sidebar-border px-3 py-4",
        collapsed ? "justify-center" : "gap-3 px-4"
      )}>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-primary/80 shadow-sm">
          <AppIcon aria-hidden="true" className="size-5" />
        </div>
        {!collapsed && (
          <div className="flex flex-col overflow-hidden">
            <span className="truncate text-sm font-semibold text-foreground">Reqly</span>
            <span className="inline-flex items-center gap-1 truncate rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              <span className="size-1.5 rounded-full bg-primary" />
              Pro
            </span>
          </div>
        )}
        {!collapsed && <ChevronDown aria-hidden="true" className="ml-auto size-4 shrink-0 text-muted-foreground/60" />}
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 overflow-y-auto overflow-x-hidden px-2 scrollbar-discreet", collapsed ? "py-2" : "py-4")}>
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = item.key === activePage
            return (
              <li key={item.label} className="relative">
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary shadow-sm shadow-primary/50" />
                )}
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={cn(
                    "group/nav-item relative flex items-center rounded-lg px-2 py-2 text-sm font-medium transition-all duration-150",
                    collapsed ? "justify-center" : "gap-3 px-3",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                  )}
                >
                  <item.icon aria-hidden="true" className={cn(
                    "size-[18px] shrink-0",
                    isActive && "text-primary",
                    !isActive && "group-hover/nav-item:text-foreground"
                  )} />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {isActive && (
                    <span className={cn(
                      "rounded-full bg-primary shadow-sm shadow-primary/50",
                      collapsed
                        ? "absolute -right-0.5 top-1/2 -translate-y-1/2 size-2"
                        : "ml-auto flex size-1.5"
                    )} />
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Sync section */}
      {!collapsed && (
        <div className="flex items-center gap-1 border-t border-sidebar-border px-2 py-2">
          <WorkspaceJoinDialog />
          {syncWorkspaceId && syncEnabled && (
            <span className="text-[10px] text-muted-foreground truncate" title={syncWorkspaceId}>
              ws: {syncWorkspaceId.slice(0, 8)}
            </span>
          )}
        </div>
      )}

      {/* AI Assistant */}
      <div className={cn("py-2", collapsed ? "px-2" : "px-3")}>
        <Link
          href="/ai-insights"
          className={cn(
            "group/ai relative flex items-center rounded-lg bg-gradient-to-r from-primary/10 via-primary/5 to-accent/30 px-3 py-2.5 text-sm font-medium text-foreground transition-all duration-200 hover:from-primary/15 hover:via-primary/10 hover:to-accent/50 hover:animate-pulse-glow",
            collapsed ? "justify-center px-2" : "gap-3"
          )}
        >
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 shadow-sm shadow-primary/20">
            <Sparkles aria-hidden="true" className="size-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <>
              <span className="font-medium">Ask Monu AI</span>
              <span className="ml-auto flex size-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50 group-hover/ai:animate-pulse" />
            </>
          )}
        </Link>
      </div>

      {/* User Profile */}
      <div className="border-t border-sidebar-border px-2 py-3">
        {!collapsed ? (
          <div className="group/profile flex items-center gap-3 rounded-lg px-2 py-2 transition-all duration-200 hover:bg-accent/30 cursor-pointer">
            <Avatar className="size-8 shrink-0 ring-2 ring-transparent transition-all duration-200 group-hover/profile:ring-primary/30">
              <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=nurul" alt="Nurul" />
              <AvatarFallback>NZ</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium text-foreground">Nurul&apos;s Zone</span>
              <span className="truncate text-xs text-muted-foreground">nurul@reqly.com</span>
            </div>
            <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground/60 transition-transform duration-200 group-hover/profile:translate-y-0.5" />
          </div>
        ) : (
          <div className="flex justify-center">
            <Avatar className="size-8 ring-2 ring-transparent transition-all duration-200 hover:ring-primary/30 hover:scale-105 cursor-pointer">
              <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=nurul" alt="Nurul" />
              <AvatarFallback>NZ</AvatarFallback>
            </Avatar>
          </div>
        )}
      </div>

      {/* Collapse toggle button — always visible on hover */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-label="Collapse sidebar"
        className="absolute -right-3 top-[72px] flex size-6 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-accent hover:text-foreground hover:shadow-md hover:shadow-primary/10 active:scale-90 opacity-0 group-hover/sidebar:opacity-100 max-md:hidden z-10"
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronsRight className="size-3.5 transition-transform duration-200 hover:translate-x-0.5" />
        ) : (
          <ChevronsLeft className="size-3.5 transition-transform duration-200 hover:-translate-x-0.5" />
        )}
      </button>
    </aside>
  )
}
