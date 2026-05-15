"use client"

import { Keyboard } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

const shortcuts = [
  { category: "General", items: [
    { keys: ["Ctrl", "K"], description: "Search" },
    { keys: ["Ctrl", "B"], description: "Toggle sidebar" },
    { keys: ["Esc"], description: "Close modal / Cancel" },
  ]},
  { category: "Requests", items: [
    { keys: ["Ctrl", "Enter"], description: "Send request" },
    { keys: ["Ctrl", "T"], description: "New request tab" },
    { keys: ["Ctrl", "W"], description: "Close current tab" },
    { keys: ["Ctrl", "S"], description: "Save request" },
    { keys: ["Ctrl", "D"], description: "Duplicate request" },
  ]},
  { category: "Panels", items: [
    { keys: ["Ctrl", "E"], description: "Toggle collections panel" },
    { keys: ["Ctrl", "H"], description: "Toggle history panel" },
    { keys: ["Ctrl", "Shift", "F"], description: "Format JSON" },
  ]},
  { category: "Navigation", items: [
    { keys: ["Ctrl", "1-9"], description: "Switch to tab 1-9" },
    { keys: ["Ctrl", "["], description: "Previous tab" },
    { keys: ["Ctrl", "]"], description: "Next tab" },
  ]},
]

interface KeyboardShortcutsModalProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function KeyboardShortcutsModal({ open, onOpenChange }: KeyboardShortcutsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
          <Keyboard className="size-4" />
          <span className="hidden sm:inline">Shortcuts</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="size-5" />
            Keyboard Shortcuts
          </DialogTitle>
        </DialogHeader>
        <div className="mt-4 space-y-6">
          {shortcuts.map((section) => (
            <div key={section.category}>
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                {section.category}
              </h3>
              <div className="space-y-2">
                {section.items.map((shortcut, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
                  >
                    <span className="text-sm text-muted-foreground">
                      {shortcut.description}
                    </span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, j) => (
                        <span key={j}>
                          <kbd className="rounded bg-background px-2 py-1 text-xs font-semibold text-foreground shadow-sm border border-border">
                            {key}
                          </kbd>
                          {j < shortcut.keys.length - 1 && (
                            <span className="mx-1 text-muted-foreground">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Press <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">?</kbd> anywhere to open this dialog
        </p>
      </DialogContent>
    </Dialog>
  )
}
