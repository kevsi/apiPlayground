"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Send, Braces } from "lucide-react"
import { cn } from "@/lib/utils"

interface MessageComposerProps {
  disabled: boolean
  onSend: (message: string) => void
}

export function MessageComposer({ disabled, onSend }: MessageComposerProps) {
  const [input, setInput] = useState("")
  const [rows, setRows] = useState(3)
  const lastSentRef = useRef<string>("")
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = useCallback(() => {
    const trimmed = input.trim()
    if (!trimmed) return
    lastSentRef.current = trimmed
    onSend(trimmed)
    setInput("")
    setRows(3)
  }, [input, onSend])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault()
        handleSend()
      }
      if (e.key === "ArrowUp" && !input) {
        e.preventDefault()
        setInput(lastSentRef.current)
      }
    },
    [handleSend, input]
  )

  const handleFormat = useCallback(() => {
    try {
      const parsed = JSON.parse(input)
      setInput(JSON.stringify(parsed, null, 2))
    } catch {
      // Not valid JSON, do nothing
    }
  }, [input])

  const autoResize = useCallback(() => {
    if (inputRef.current) {
      const lineCount = inputRef.current.value.split("\n").length
      setRows(Math.min(Math.max(lineCount, 3), 8))
    }
  }, [])

  useEffect(() => {
    autoResize()
  }, [input, autoResize])

  return (
    <div className="px-3 pb-3">
      <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2 transition-all duration-200 focus-within:border-primary/30 focus-within:shadow-[0_0_0_2px] focus-within:shadow-primary/10">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message..."
          disabled={disabled}
          rows={rows}
          className="flex-1 w-full border-0 bg-transparent px-0 py-1 text-sm font-mono placeholder:text-muted-foreground/30 outline-none resize-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-50"
        />
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled || !input.trim()}
            onClick={handleFormat}
            className={cn(
              "h-6 gap-1 text-xs font-medium text-muted-foreground/50",
              "hover:text-foreground transition-colors"
            )}
          >
            <Braces className="size-3" />
            Format
          </Button>
          <Button
            size="sm"
            disabled={disabled || !input.trim()}
            onClick={handleSend}
            className="h-7 gap-1.5 px-3 text-xs font-medium"
          >
            <Send className="size-3.5" />
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}
