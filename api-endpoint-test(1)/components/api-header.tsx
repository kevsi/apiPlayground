"use client"

import { Search, Bell, Users } from "lucide-react"
import { Input } from "@/components/ui/input"
import { EnvironmentSelector } from "@/components/environment-selector"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { useRequestStore } from "@/hooks/use-request-store"

export function ApiHeader() {
  const { notifications, markNotificationRead, clearNotifications, requestSystemNotificationPermission, systemNotificationPermission } = useRequestStore()

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
        <EnvironmentSelector />
        
        <button className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <Users className="size-5" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Bell className="size-5" />
              {notifications && notifications.some((n) => !n.read) && (
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[300px]">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Notifications</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(systemNotificationPermission !== "granted" && systemNotificationPermission !== "unsupported") && (
              <div className="p-3 border-b">
                <button
                  className="text-sm text-primary"
                  onClick={async () => {
                    try {
                      await requestSystemNotificationPermission()
                      // no-op here; store updates permission
                    } catch {
                      // intentionally empty
                    }
                  }}
                >
                  Activer notifications système
                </button>
              </div>
            )}
            {(!notifications || notifications.length === 0) ? (
              <div className="p-3 text-sm text-muted-foreground">Aucune notification</div>
            ) : (
              notifications.map((n) => (
                <DropdownMenuItem key={n.id} onClick={() => markNotificationRead(n.id)} className="flex flex-col items-start gap-1">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-sm font-medium">{n.title}</span>
                    <span className="text-xs text-muted-foreground">{new Date(n.createdAt).toLocaleTimeString()}</span>
                  </div>
                  {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <div className="p-2">
              <button className="text-xs text-muted-foreground" onClick={() => clearNotifications()}>Effacer</button>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
