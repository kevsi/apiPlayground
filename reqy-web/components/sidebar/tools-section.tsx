"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Play, Code2, Users, Package } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useSidebar } from "@/contexts/sidebar-context"

const TOOLS = [
  { href: "/runner", label: "Runner", icon: Play, color: "text-blue-500" },
  { href: "/graphql", label: "GraphQL", icon: Code2, color: "text-purple-500" },
  { href: "/workspaces", label: "Workspaces", icon: Users, color: "text-green-500" },
  { href: "/sdks", label: "SDKs", icon: Package, color: "text-orange-500" },
]

export function ToolsSection() {
  const pathname = usePathname()
  const { isCollapsed } = useSidebar()

  return (
    <div
      className={cn("border-t pt-2 mt-2", !isCollapsed && "pb-2 mb-2")}
      data-testid="tools-section"
    >
      {!isCollapsed && (
        <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Tools
        </div>
      )}
      <nav className={cn("flex flex-col", isCollapsed ? "gap-1" : "gap-0.5")}>
        {TOOLS.map(({ href, label, icon: Icon, color }) => {
          const active = pathname?.startsWith(href) ?? false
          const linkContent = (
            <Link
              href={href}
              data-testid={`tools-link-${label.toLowerCase()}`}
              title={isCollapsed ? label : undefined}
              className={cn(
                "flex items-center rounded-md text-sm transition-colors",
                isCollapsed ? "justify-center px-2 py-2" : "gap-2 px-3 py-1.5",
                active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Icon className={cn(isCollapsed ? "w-5 h-5" : "w-4 h-4", active ? "" : color)} />
              {!isCollapsed && <span>{label}</span>}
            </Link>
          )

          if (!isCollapsed) return <div key={href}>{linkContent}</div>

          return (
            <Tooltip key={href}>
              <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
              <TooltipContent side="right" sideOffset={6}>
                {label}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </nav>
    </div>
  )
}
