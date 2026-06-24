"use client"

import { X, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { GraphqlTab } from "@/lib/types"

interface Props {
  tabs: GraphqlTab[]
  activeTabId: string
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
}

export function GraphqlTabBar({ tabs, activeTabId, onSelect, onAdd, onClose }: Props) {
  return (
    <div
      className="flex items-center gap-1 border-b bg-card px-2 py-1 overflow-x-auto hide-scrollbar"
      data-testid="graphql-tab-bar"
    >
      {tabs.map((tab) => {
        const isActive = activeTabId === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            className={cn(
              "group flex items-center gap-2 px-3 py-1.5 text-xs rounded-md border transition-colors min-w-[120px] max-w-[200px]",
              isActive
                ? "bg-background border-border text-foreground"
                : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/50",
            )}
            data-testid={`graphql-tab-${tab.id}`}
            data-active={isActive}
          >
            <span className="text-[10px] font-bold text-pink-500/80 shrink-0">GQL</span>
            <span className="truncate flex-1 text-left">
              {tab.name}
              {tab.dirty && !tab.saved && (
                <span className="ml-1 text-amber-500">●</span>
              )}
            </span>
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation()
                onClose(tab.id)
              }}
              className="shrink-0 opacity-60 hover:opacity-100 hover:text-red-500"
              data-testid={`graphql-tab-close-${tab.id}`}
            >
              <X className="w-3 h-3" />
            </span>
          </button>
        )
      })}
      <button
        onClick={onAdd}
        className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 shrink-0"
        data-testid="graphql-tab-add"
      >
        <Plus className="w-3 h-3" /> New
      </button>
    </div>
  )
}
