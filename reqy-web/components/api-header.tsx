"use client"

import { useState, useEffect, useCallback } from "react"
import { Search, Bell, FileJson, Clock, Command } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { EnvironmentSelector } from "@/components/environment-selector"
import { VariablesPanel } from "@/components/variables-panel"
import { WorkspaceSelector } from "@/components/workspace-selector"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { SyncStatus } from "@/components/sync-status"

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog"
import {
  Command as CommandPalette,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Wifi, Radio, Network, Braces } from "lucide-react"
import { WebSocketPanel } from "@/components/websocket-panel"
import { SSEPanel } from "@/components/sse-panel"
import { CaptureProxyPanel } from "@/components/capture-proxy-panel"
import { GraphQLPanel } from "@/components/graphql-panel"
import { useRequestStore } from "@/hooks/use-request-store"
import { useRouter } from "next/navigation"

export function ApiHeader() {
  const { notifications, markNotificationRead, clearNotifications, requestSystemNotificationPermission, systemNotificationPermission, history } = useRequestStore()
  const router = useRouter()
  const [searchOpen, setSearchOpen] = useState(false)
  const [wsOpen, setWsOpen] = useState(false)
  const [sseOpen, setSseOpen] = useState(false)
  const [proxyOpen, setProxyOpen] = useState(false)
  const [graphqlOpen, setGraphqlOpen] = useState(false)

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault()
      setSearchOpen(true)
    }
  }, [])

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])

  return (
    <header className="flex h-12 items-center justify-between border-b border-border bg-gradient-to-r from-background via-muted/10 to-background px-4">
      {/* Logo + Workspace */}
      <div className="flex items-center gap-2">
        <div className="group/logo flex size-8 items-center justify-center rounded-lg border border-border bg-muted/30 transition-all duration-200 hover:border-primary/30 hover:bg-primary/5">
          <div className="size-4 rounded-sm bg-foreground transition-all duration-200 group-hover/logo:bg-primary" />
        </div>
        <WorkspaceSelector />
      </div>

      {/* Search — Ctrl+K palette */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSearchOpen(true)}
          aria-label="Search"
          className="group/search relative transition-all duration-200 hover:scale-[1.02]"
          title="Search (Ctrl+K)"
        >
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/60 pointer-events-none transition-colors group-hover/search:text-muted-foreground" />
          <div className="flex h-9 w-full max-w-80 items-center rounded-lg border border-input bg-muted/30 pl-9 pr-3 shrink min-w-0 text-sm text-muted-foreground transition-all duration-200 group-hover/search:border-muted-foreground/30 group-hover/search:bg-muted/50 group-focus-within/search:border-primary/50 group-focus-within/search:ring-1 group-focus-within/search:ring-primary/20">
            <span className="flex-1 text-left text-muted-foreground/70">Search APIs, endpoints...</span>
            <kbd className="hidden sm:inline-flex h-5 select-none items-center gap-1 rounded-md border border-border bg-muted/50 px-1.5 font-mono text-[10px] font-medium text-muted-foreground/70">
              <Command className="size-3" />K
            </kbd>
          </div>
        </button>

        <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
          <CommandInput placeholder="Search open tabs, history, pages..." />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup heading="Tools">
              <CommandItem onSelect={() => { setWsOpen(true); setSearchOpen(false) }}>
                <Wifi className="mr-2 size-4" />
                <span>Open WebSocket Panel</span>
              </CommandItem>
              <CommandItem onSelect={() => { setSseOpen(true); setSearchOpen(false) }}>
                <Radio className="mr-2 size-4" />
                <span>Open SSE Panel</span>
              </CommandItem>
              <CommandItem onSelect={() => { setProxyOpen(true); setSearchOpen(false) }}>
                <Network className="mr-2 size-4" />
                <span>Open Capture Proxy</span>
              </CommandItem>
              <CommandItem onSelect={() => { setGraphqlOpen(true); setSearchOpen(false) }}>
                <Braces className="mr-2 size-4" />
                <span>Open GraphQL Playground</span>
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="History">
              {history.slice(0, 10).map((item) => (
                <CommandItem key={item.id} onSelect={() => setSearchOpen(false)}>
                  <Clock className="mr-2 size-4" />
                  <span>{item.method} {item.url}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </CommandDialog>
        <Dialog open={wsOpen} onOpenChange={setWsOpen}>
          <DialogContent className="max-w-3xl h-[80vh]">
            <WebSocketPanel />
          </DialogContent>
        </Dialog>
        <Dialog open={sseOpen} onOpenChange={setSseOpen}>
          <DialogContent className="max-w-3xl h-[80vh]">
            <SSEPanel />
          </DialogContent>
        </Dialog>
        <Dialog open={proxyOpen} onOpenChange={setProxyOpen}>
          <DialogContent className="max-w-4xl h-[85vh]">
            <CaptureProxyPanel />
          </DialogContent>
        </Dialog>
        <Dialog open={graphqlOpen} onOpenChange={setGraphqlOpen}>
          <DialogContent className="max-w-4xl h-[85vh]">
            <GraphQLPanel />
          </DialogContent>
        </Dialog>
        <EnvironmentSelector />
        <VariablesPanel />
        <ThemeSwitcher />
        <SyncStatus />

        <div className="flex items-center gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Notifications"
                className="group/notif relative flex size-9 items-center justify-center rounded-lg text-muted-foreground/70 transition-all duration-200 hover:bg-accent hover:text-foreground border border-transparent hover:border-border"
                title={notifications && notifications.some((n) => !n.read) ? "Unread notifications" : "Notifications"}
              >
                <Bell className="size-5" />
                {notifications && notifications.some((n) => !n.read) && (
                  <span className="absolute -top-0.5 -right-0.5 flex size-2.5 items-center justify-center">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60" />
                    <span className="relative inline-flex size-2 rounded-full bg-destructive" />
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[320px] animate-scale-in">
              <DropdownMenuLabel className="flex items-center justify-between px-4 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notifications</span>
                {notifications && notifications.length > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {notifications.filter((n) => !n.read).length} new
                  </span>
                )}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {(systemNotificationPermission !== "granted" && systemNotificationPermission !== "unsupported") && (
                <div className="border-b border-border p-3">
                  <button
                    className="w-full rounded-md bg-primary/5 px-3 py-2 text-sm font-medium text-primary transition-all duration-200 hover:bg-primary/10"
                    onClick={async () => {
                      try {
                        await requestSystemNotificationPermission()
                      } catch {
                        // intentionally empty
                      }
                    }}
                  >
                    Enable system notifications
                  </button>
                </div>
              )}
              {(!notifications || notifications.length === 0) ? (
                <div className="flex flex-col items-center gap-2 p-6 text-sm text-muted-foreground">
                  <Bell className="size-8 text-muted-foreground/30" />
                  <span>No notifications yet</span>
                </div>
              ) : (
                <div className="max-h-[280px] overflow-y-auto">
                  {notifications.map((n) => (
                    <DropdownMenuItem key={n.id} onClick={() => markNotificationRead(n.id)} className="flex flex-col items-start gap-1.5 px-4 py-3 border-b border-border last:border-b-0">
                      <div className="flex items-center justify-between w-full">
                        <span className={cn("text-sm", !n.read ? "font-semibold text-foreground" : "font-medium text-muted-foreground")}>
                          {n.title}
                        </span>
                        <span className="text-[11px] text-muted-foreground/60">{new Date(n.createdAt).toLocaleTimeString()}</span>
                      </div>
                      {n.body && <div className="text-xs text-muted-foreground/80 leading-relaxed">{n.body}</div>}
                      {!n.read && <span className="mt-1 size-1.5 rounded-full bg-primary" />}
                    </DropdownMenuItem>
                  ))}
                </div>
              )}
              <DropdownMenuSeparator />
              <div className="p-2">
                <button
                  className="w-full rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground"
                  onClick={() => clearNotifications()}
                >
                  Clear all notifications
                </button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  )
}
