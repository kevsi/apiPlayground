"use client"

import { useEffect, useCallback } from "react"

export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  meta?: boolean
  shift?: boolean
  alt?: boolean
  action: () => void
  description: string
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore if typing in an input/textarea
      const target = event.target as HTMLElement
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        // Allow Escape to work in inputs
        if (event.key !== "Escape") {
          return
        }
      }

      for (const shortcut of shortcuts) {
        const ctrlMatch = shortcut.ctrl
          ? event.ctrlKey || event.metaKey
          : !event.ctrlKey && !event.metaKey
        const shiftMatch = shortcut.shift ? event.shiftKey : !event.shiftKey
        const altMatch = shortcut.alt ? event.altKey : !event.altKey

        if (event.key.toLowerCase() === shortcut.key.toLowerCase() && ctrlMatch && shiftMatch && altMatch) {
          event.preventDefault()
          shortcut.action()
          return
        }
      }
    },
    [shortcuts]
  )

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [handleKeyDown])
}

// Common shortcuts configuration
export const defaultShortcuts = {
  sendRequest: { key: "Enter", ctrl: true, description: "Send request" },
  newTab: { key: "t", ctrl: true, description: "New request tab" },
  closeTab: { key: "w", ctrl: true, description: "Close current tab" },
  toggleSidebar: { key: "b", ctrl: true, description: "Toggle sidebar" },
  toggleCollections: { key: "e", ctrl: true, description: "Toggle collections" },
  toggleHistory: { key: "h", ctrl: true, description: "Toggle history" },
  saveRequest: { key: "s", ctrl: true, description: "Save request" },
  search: { key: "k", ctrl: true, description: "Search" },
  formatJson: { key: "f", ctrl: true, shift: true, description: "Format JSON" },
}
