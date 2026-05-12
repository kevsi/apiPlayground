"use client"

import { NavLink } from "react-router-dom"
import {
  LayoutDashboard,
  Zap,
  Key,
  BarChart3,
  Sparkles,
  FileText,
  Settings,
  ChevronDown,
} from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard", key: "dashboard" },
  { icon: Zap, label: "API Endpoints", href: "/", key: "api-endpoints" },
  { icon: Key, label: "API Keys", href: "/api-keys", key: "api-keys" },
  { icon: BarChart3, label: "Analytics", href: "/analytics", key: "analytics" },
  { icon: Sparkles, label: "AI Insights", href: "/ai-insights", key: "ai-insights" },
  { icon: FileText, label: "Documentation", href: "/documentation", key: "documentation" },
  { icon: Settings, label: "Settings", href: "/settings", key: "settings" },
]

interface ApiSidebarProps {
  activePage?: string
}

export function ApiSidebar({ activePage = "api-endpoints" }: ApiSidebarProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex h-screen w-64 flex-col border-r border-border bg-sidebar">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-4 py-4">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary">
          <Zap className="size-5 text-primary-foreground" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">Zendeeps Space</span>
          <span className="text-xs text-muted-foreground">Pro | 12 Members</span>
        </div>
        <ChevronDown className="ml-auto size-4 text-muted-foreground" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = item.key === activePage
            return (
              <li key={item.label}>
                <NavLink
                  to={item.href}
                  className={({ isActive: isRouteActive }) =>
                    cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      isActive || isRouteActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )
                  }
                >
                  <item.icon className={cn("size-4", isActive && "text-primary")} />
                  {item.label}
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* AI Assistant */}
      <div className="px-3 py-2">
        <button className="flex w-full items-center gap-3 rounded-lg bg-gradient-to-r from-secondary to-accent px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:opacity-90">
          <div className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70">
            <Sparkles className="size-4 text-primary-foreground" />
          </div>
          <span>Ask Monu AI</span>
          <span className="ml-auto flex size-2 rounded-full bg-red-500" />
        </button>
      </div>

      {/* User Profile */}
      <div className="border-t border-border px-3 py-3">
        <div className="flex items-center gap-3">
          <Avatar className="size-9">
            <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=nurul" alt="Nurul" />
            <AvatarFallback>NZ</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">Nurul&apos;s Zone</span>
            <span className="text-xs text-muted-foreground">nurul@zendeeps.com</span>
          </div>
          <ChevronDown className="ml-auto size-4 text-muted-foreground" />
        </div>
      </div>
    </aside>
  )
}
