"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Plus, Trash2, Info } from "lucide-react"
import { isTauriAvailable } from "@/lib/tauri"

interface HeaderRow {
  id: string
  key: string
  value: string
}

interface WsHeadersPanelProps {
  headers: Record<string, string>
  onChange: (headers: Record<string, string>) => void
  disabled: boolean
}

export function WsHeadersPanel({ headers, onChange, disabled }: WsHeadersPanelProps) {
  const [rows, setRows] = useState<HeaderRow[]>(() =>
    Object.entries(headers).map(([key, value]) => ({
      id: crypto.randomUUID(),
      key,
      value,
    }))
  )

  const emitChange = useCallback(
    (newRows: HeaderRow[]) => {
      const obj: Record<string, string> = {}
      for (const row of newRows) {
        if (row.key.trim()) obj[row.key.trim()] = row.value
      }
      onChange(obj)
    },
    [onChange]
  )

  const addRow = useCallback(() => {
    const newRows = [...rows, { id: crypto.randomUUID(), key: "", value: "" }]
    setRows(newRows)
    emitChange(newRows)
  }, [rows, emitChange])

  const removeRow = useCallback(
    (id: string) => {
      const newRows = rows.filter((r) => r.id !== id)
      setRows(newRows)
      emitChange(newRows)
    },
    [rows, emitChange]
  )

  const updateRow = useCallback(
    (id: string, field: "key" | "value", val: string) => {
      const newRows = rows.map((r) => (r.id === id ? { ...r, [field]: val } : r))
      setRows(newRows)
      emitChange(newRows)
    },
    [rows, emitChange]
  )

  return (
    <div className="border-b border-border/60 px-4 py-3">
      {!isTauriAvailable() && (
        <div className="flex items-start gap-2 mb-2 rounded-md bg-amber-500/5 border border-amber-500/10 px-2 py-1.5">
          <Info className="size-3.5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[10px] text-amber-700 leading-tight">
            Custom headers are only supported in desktop mode (Tauri). In web mode, WebSocket connections use browser defaults.
          </p>
        </div>
      )}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/40">
          Upgrade Headers
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={addRow}
          disabled={disabled || !isTauriAvailable()}
          className="h-6 gap-1 text-xs font-medium text-muted-foreground/50 hover:text-foreground"
        >
          <Plus className="size-3" />
          Add header
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground/30 italic">
            No custom headers. The connection will use defaults.
          </p>
        )}
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2">
            <Input
              value={row.key}
              onChange={(e) => updateRow(row.id, "key", e.target.value)}
              placeholder="Header name"
              disabled={disabled}
              className="h-7 flex-1 text-xs font-mono"
            />
            <Input
              value={row.value}
              onChange={(e) => updateRow(row.id, "value", e.target.value)}
              placeholder="Value"
              disabled={disabled}
              className="h-7 flex-[2] text-xs font-mono"
            />
            <button
              onClick={() => removeRow(row.id)}
              disabled={disabled}
              className="flex size-6 items-center justify-center rounded text-muted-foreground/30 hover:text-destructive transition-colors disabled:opacity-30"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
