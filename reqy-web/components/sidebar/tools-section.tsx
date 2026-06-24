"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Play, Code2, Users, Package } from "lucide-react"
import { cn } from "@/lib/utils"

const TOOLS = [
  { href: "/runner", label: "Runner", icon: Play, color: "text-blue-500" },
  { href: "/graphql", label: "GraphQL", icon: Code2, color: "text-purple-500" },
  { href: "/workspaces", label: "Workspaces", icon: Users, color: "text-green-500" },
  { href: "/sdks", label: "SDKs", icon: Package, color: "text-orange-500" },
]

export function ToolsSection() {
  const pathname = usePathname()

  return (
    <div className="border-b pb-2 mb-2" data-testid="tools-section">
      <div className="px-3 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Tools
      </div>
      <nav className="flex flex-col gap-0.5">
        {TOOLS.map(({ href, label, icon: Icon, color }) => {
          const active = pathname?.startsWith(href) ?? false
          return (
            <Link
              key={href}
              href={href}
              data-testid={`tools-link-${label.toLowerCase()}`}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors",
                active
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Icon className={cn("w-4 h-4", active ? "" : color)} />
              <span>{label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
