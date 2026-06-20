"use client"

import { CheckCircle, Clock, Copy, Download, Folder, MoreHorizontal, Save, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { RequestTab } from "@/lib/request-executor"
import { getMethodBadgeClass, getMethodPanelClass } from "@/lib/request-tab-utils"

interface RequestActiveToolbarProps {
  activeTab: RequestTab
  savedIndicator: boolean
  collectionRequestStatus: string | null
  onNameChange: (name: string) => void
  onOpenCollections: () => void
  onDuplicateTab: () => void
  onSave: () => void
  onOpenHistory: () => void
  onExport: () => void
  onOpenChaining: () => void
}

export function RequestActiveToolbar({
  activeTab,
  savedIndicator,
  collectionRequestStatus,
  onNameChange,
  onOpenCollections,
  onDuplicateTab,
  onSave,
  onOpenHistory,
  onExport,
  onOpenChaining,
}: RequestActiveToolbarProps) {
  return (
    <div className={cn("flex items-center gap-3 border-b px-3 py-1.5 transition-colors duration-200 overflow-x-auto", getMethodPanelClass(activeTab.method))}>
      <div className={cn("flex items-center justify-center rounded-lg border-2 px-2 py-1 text-xs sm:px-3.5 sm:py-1.5 sm:text-sm font-bold font-mono tracking-wide select-none shrink-0", getMethodBadgeClass(activeTab.method))}>
        {activeTab.method}
      </div>

      <div className="flex flex-col min-w-0 flex-1">
        <input
          value={activeTab.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Request Name"
          className="w-full rounded-md border border-transparent bg-muted/20 px-2 py-1 text-sm font-semibold text-foreground outline-none transition-all duration-150 placeholder:text-muted-foreground/40 focus:border-input/50 focus:bg-muted/40"
        />
        {activeTab.endpoint && (
          <span className="text-[11px] font-mono text-muted-foreground/50 truncate mt-0.5 hidden sm:inline">
            {activeTab.endpoint}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 max-sm:hidden">
        {savedIndicator && (
          <div className="flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-[11px] font-medium text-emerald-500 animate-fade-in">
            <CheckCircle className="size-3" />
            Saved
          </div>
        )}
        {collectionRequestStatus && (
          <div className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium animate-fade-in border-primary/20 bg-primary/5 text-primary">
            <span className="size-1.5 rounded-full bg-primary animate-pulse" />
            <span>{collectionRequestStatus}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 ml-auto">
        <div className="items-center gap-0.5 max-[768px]:hidden flex">
          <Button variant="ghost" size="icon" onClick={onOpenCollections} className="size-8 text-muted-foreground/60 hover:text-foreground" title="Collections">
            <Folder className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDuplicateTab} className="size-8 text-muted-foreground/60 hover:text-foreground" title="Duplicate request">
            <Copy className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onSave}
            className={cn("size-8 transition-all duration-200", !activeTab.isSaved ? "text-orange-500 hover:text-orange-600" : "text-muted-foreground/60 hover:text-foreground")}
            title="Save (Ctrl+S)"
          >
            <Save className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onOpenHistory} className="size-8 text-muted-foreground/60 hover:text-foreground" title="Request history">
            <Clock className="size-4" />
          </Button>
        </div>
        <div className="hidden max-[768px]:inline-flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={onOpenCollections} className="text-xs gap-2"><Folder className="size-3.5" />Collections</DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicateTab} className="text-xs gap-2"><Copy className="size-3.5" />Duplicate</DropdownMenuItem>
              <DropdownMenuItem onClick={onSave} className="text-xs gap-2"><Save className="size-3.5" />{activeTab.isSaved ? "Resave" : "Save"}</DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenHistory} className="text-xs gap-2"><Clock className="size-3.5" />History</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onExport} className="text-xs gap-2"><Download className="size-3.5" />Export JSON</DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenChaining} className="text-xs gap-2"><Zap className="size-3.5" />Chaining</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}
