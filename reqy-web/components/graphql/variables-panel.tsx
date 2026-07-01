"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, AlertCircle } from "lucide-react"
import { JsonTextarea } from "@/components/json-textarea"
import { cn } from "@/lib/utils"

interface Props {
  value: string
  onChange: (v: string) => void
  defaultOpen?: boolean
  /**
   * When true, skip rendering the panel's own header (the chevron + title)
   * so the section can be hosted inside a CollapsibleSection that already
   * provides a header.
   */
  hideHeader?: boolean
  /** Extra className for the inner wrapper when hideHeader is true. */
  className?: string
}

export function VariablesPanel({ value, onChange, defaultOpen = false, hideHeader = false, className }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  let error: string | null = null
  if (value.trim() && value.trim() !== "{}") {
    try {
      JSON.parse(value)
    } catch (e) {
      error = e instanceof Error ? e.message : "Invalid JSON"
    }
  }
  return (
    <div className={cn("border-b", hideHeader && "border-b-0", className)} data-testid="graphql-variables-panel">
      {!hideHeader && (
        <button
          type="button"
          className="flex items-center gap-1 w-full p-2 text-xs font-medium hover:bg-accent/30"
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          Variables
          {error && <AlertCircle className="w-3 h-3 text-red-500 ml-1" />}
        </button>
      )}
      {open && (
        <div className={cn("p-2 space-y-1", hideHeader && "p-3")}>
          <JsonTextarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder='{ "id": 1 }'
            className="text-xs min-h-24"
            data-testid="graphql-variables-textarea"
          />
          {error && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
