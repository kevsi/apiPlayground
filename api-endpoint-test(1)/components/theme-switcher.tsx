"use client"

import { Palette, Check } from "lucide-react"
import { useTheme, type Theme } from "./theme-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const themes: { value: Theme; label: string; colors: string[] }[] = [
  { value: "light", label: "Light", colors: ["#ffffff", "#f5f5f5", "#10b981"] },
  { value: "dark", label: "Dark", colors: ["#1a1a1a", "#262626", "#10b981"] },
  { value: "emerald", label: "Emerald", colors: ["#ecfdf5", "#d1fae5", "#059669"] },
  { value: "ocean", label: "Ocean", colors: ["#eff6ff", "#dbeafe", "#2563eb"] },
  { value: "sunset", label: "Sunset", colors: ["#fff7ed", "#ffedd5", "#ea580c"] },
  { value: "purple", label: "Purple", colors: ["#faf5ff", "#f3e8ff", "#9333ea"] },
  { value: "midnight", label: "Midnight", colors: ["#050505", "#131313", "#5b50db"] },
]

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent">
          <Palette className="size-4" />
          <span className="hidden sm:inline">Theme</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {themes.map((t) => (
          <DropdownMenuItem
            key={t.value}
            onClick={() => setTheme(t.value)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <div className="flex -space-x-1">
                {t.colors.map((color, i) => (
                  <div
                    key={i}
                    className="size-4 rounded-full border border-border"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <span>{t.label}</span>
            </div>
            {theme === t.value && <Check className="size-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
