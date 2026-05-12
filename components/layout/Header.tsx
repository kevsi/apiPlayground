"use client"

import { Search, Bell, Users } from "lucide-react"
import { Input } from "@/components/ui/input"

export function ApiHeader() {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-background px-6">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="flex size-8 items-center justify-center rounded border border-border">
          <div className="size-4 rounded-sm bg-foreground" />
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search APIs, endpoints, logs..."
            className="h-9 w-72 bg-muted/50 pl-9 text-sm"
          />
        </div>
        <button className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <Users className="size-5" />
        </button>
        <button className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <Bell className="size-5" />
        </button>
      </div>
    </header>
  )
}
