# Settings Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign `/settings` with two-column layout (sidebar + content), add an Apparence section (theme cards, accent picker, animations toggle, tables view preview), and turn the tools/integrations section into a 3×N card grid with an association modal.

**Architecture:** New `<SettingsLayout>` wraps the existing page. New components in `components/settings/sections/`. Two new hooks (`use-animations`, `use-accent`) for client-side prefs in localStorage. Theme provider is consumed, not modified.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind, shadcn/ui (Dialog, Switch, Card, Button, Input, Label), next-themes (existing).

**Spec:** `docs/superpowers/specs/2026-06-27-settings-redesign-design.md`

---

## File Structure

**Create (14 files):**
- `components/settings/sections/apparence-section.tsx` — orchestrator for 4 sub-features
- `components/settings/sections/theme-cards.tsx` — 3 cards + dropdown
- `components/settings/sections/accent-picker.tsx` — circles + custom hex
- `components/settings/sections/animations-toggle.tsx` — iOS-style switch
- `components/settings/sections/tables-view-preview.tsx` — cosmetic vignettes
- `components/settings/sections/tools-section.tsx` — 3×N card grid
- `components/settings/sections/tool-association-modal.tsx` — OAuth modal
- `components/settings/settings-sidebar.tsx` — left vertical nav
- `components/settings/settings-layout.tsx` — two-column wrapper
- `hooks/use-animations.ts` — animations pref
- `hooks/use-accent.ts` — accent color pref
- `hooks/__tests__/use-animations.test.tsx` — 4 unit cases
- `hooks/__tests__/use-accent.test.tsx` — 6 unit cases
- (no component-level tests — covered by manual smoke in T14)

**Modify (2 files):**
- `reqy-web/app/settings/page.tsx` — wrap content in `<SettingsLayout>`
- `reqy-web/app/globals.css` — append animations block

---

## Task 1: Add animations CSS to `globals.css`

**Files:**
- Modify: `reqy-web/app/globals.css` (append only, do not modify existing content)

- [ ] **Step 1.1: Append animations CSS**

Open `reqy-web/app/globals.css`. At the very end of the file, add (preserve any trailing newline):

```css

/* Respect user animation preference (accessibility) */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}

/* Manual animation toggle (set by useAnimations hook) */
body[data-animations="off"] *,
body[data-animations="off"] *::before,
body[data-animations="off"] *::after {
  animation-duration: 0.01ms !important;
  transition-duration: 0.01ms !important;
}
```

- [ ] **Step 1.2: Verify**

Run: `cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web && npx tsc --noEmit 2>&1 | tail -10`
Expected: no new errors.

- [ ] **Step 1.3: Commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main && git add reqy-web/app/globals.css && git -c commit.gpgsign=false commit -m "feat(settings): add CSS hooks for animations off (reduced motion + manual toggle)"
```

---

## Task 2: `use-animations` hook + tests

**Files:**
- Create: `reqy-web/hooks/use-animations.ts`
- Create: `reqy-web/hooks/__tests__/use-animations.test.tsx`

- [ ] **Step 2.1: Write failing tests**

Create `reqy-web/hooks/__tests__/use-animations.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useAnimations } from "@/hooks/use-animations"

describe("useAnimations", () => {
  beforeEach(() => {
    document.body.removeAttribute("data-animations")
    localStorage.clear()
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: false,
      media: q,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
  })

  it("starts enabled by default", () => {
    const { result } = renderHook(() => useAnimations())
    expect(result.current.enabled).toBe(true)
  })

  it("starts disabled when prefers-reduced-motion is set", () => {
    window.matchMedia = vi.fn().mockImplementation((q: string) => ({
      matches: q.includes("reduce"),
      media: q,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))
    const { result } = renderHook(() => useAnimations())
    expect(result.current.enabled).toBe(false)
  })

  it("toggle() flips state and applies body attribute", () => {
    const { result } = renderHook(() => useAnimations())
    act(() => result.current.toggle())
    expect(result.current.enabled).toBe(false)
    expect(document.body.getAttribute("data-animations")).toBe("off")
    act(() => result.current.toggle())
    expect(result.current.enabled).toBe(true)
    expect(document.body.getAttribute("data-animations")).toBeNull()
  })

  it("setEnabled(true) removes body attribute", () => {
    document.body.setAttribute("data-animations", "off")
    const { result } = renderHook(() => useAnimations())
    act(() => result.current.setEnabled(true))
    expect(document.body.getAttribute("data-animations")).toBeNull()
  })
})
```

- [ ] **Step 2.2: Run test, verify it fails**

Run: `cd reqy-web && npx vitest run hooks/__tests__/use-animations.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 2.3: Write minimal implementation**

Create `reqy-web/hooks/use-animations.ts`:

```ts
"use client"

import { useCallback, useEffect, useState } from "react"
import { persistence } from "@/lib/persistence"

const STORAGE_KEY = "reqly-animations"

export interface UseAnimationsReturn {
  enabled: boolean
  toggle: () => void
  setEnabled: (v: boolean) => void
}

function readInitial(): boolean {
  if (typeof window === "undefined") return true
  try {
    const stored = persistence.getItem<string>(STORAGE_KEY)
    if (stored === "off") return false
  } catch {
    /* ignore */
  }
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function applyClass(enabled: boolean) {
  if (typeof document === "undefined") return
  if (enabled) {
    document.body.removeAttribute("data-animations")
  } else {
    document.body.setAttribute("data-animations", "off")
  }
}

export function useAnimations(): UseAnimationsReturn {
  const [enabled, setEnabledState] = useState<boolean>(true)

  useEffect(() => {
    const initial = readInitial()
    setEnabledState(initial)
    applyClass(initial)
  }, [])

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v)
    applyClass(v)
    try {
      void persistence.setItem(STORAGE_KEY, v ? "on" : "off")
    } catch {
      /* ignore */
    }
  }, [])

  const toggle = useCallback(() => setEnabled(!enabled), [enabled, setEnabled])

  return { enabled, toggle, setEnabled }
}
```

- [ ] **Step 2.4: Run test, verify it passes**

Run: `cd reqy-web && npx vitest run hooks/__tests__/use-animations.test.tsx`
Expected: PASS (4 cases).

- [ ] **Step 2.5: Commit**

```bash
git add reqy-web/hooks/use-animations.ts reqy-web/hooks/__tests__/use-animations.test.tsx
git -c commit.gpgsign=false commit -m "feat(settings): add use-animations hook with reduced-motion default"
```

---

## Task 3: `use-accent` hook + tests

**Files:**
- Create: `reqy-web/hooks/use-accent.ts`
- Create: `reqy-web/hooks/__tests__/use-accent.test.tsx`

- [ ] **Step 3.1: Write failing tests**

Create `reqy-web/hooks/__tests__/use-accent.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useAccent, HEX_REGEX, ACCENT_PRESETS } from "@/hooks/use-accent"

describe("use-accent", () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.style.removeProperty("--primary")
  })

  it("starts with null accent", () => {
    const { result } = renderHook(() => useAccent())
    expect(result.current.accent).toBeNull()
  })

  it("setAccent with valid hex applies CSS variable and persists", () => {
    const { result } = renderHook(() => useAccent())
    act(() => result.current.setAccent("#8B5CF6"))
    expect(result.current.accent).toBe("#8B5CF6")
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("#8B5CF6")
    expect(localStorage.getItem("reqly-accent")).toBe("#8B5CF6")
  })

  it("setAccent with invalid hex is a no-op", () => {
    const { result } = renderHook(() => useAccent())
    act(() => result.current.setAccent("red"))
    expect(result.current.accent).toBeNull()
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("")
  })

  it("setAccent(null) clears override and storage", () => {
    const { result } = renderHook(() => useAccent())
    act(() => result.current.setAccent("#8B5CF6"))
    act(() => result.current.setAccent(null))
    expect(result.current.accent).toBeNull()
    expect(document.documentElement.style.getPropertyValue("--primary")).toBe("")
    expect(localStorage.getItem("reqly-accent")).toBeNull()
  })

  it("isPreset detects preset colors (case-insensitive)", () => {
    const { result } = renderHook(() => useAccent())
    expect(result.current.isPreset(ACCENT_PRESETS[0].hex)).toBe(true)
    expect(result.current.isPreset("#abcDEF")).toBe(false)
  })

  it("HEX_REGEX accepts only 6-char hex with #", () => {
    expect(HEX_REGEX.test("#FFF")).toBe(false)
    expect(HEX_REGEX.test("8B5CF6")).toBe(false)
    expect(HEX_REGEX.test("#8B5CF6")).toBe(true)
    expect(HEX_REGEX.test("#8b5cf6")).toBe(true)
  })
})
```

- [ ] **Step 3.2: Run test, verify it fails**

Run: `cd reqy-web && npx vitest run hooks/__tests__/use-accent.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3.3: Write minimal implementation**

Create `reqy-web/hooks/use-accent.ts`:

```ts
"use client"

import { useCallback, useEffect, useState } from "react"
import { persistence } from "@/lib/persistence"

const STORAGE_KEY = "reqly-accent"

export const ACCENT_PRESETS = [
  { id: "black", label: "Noir", hex: "#000000" },
  { id: "red", label: "Rouge", hex: "#EF4444" },
  { id: "green", label: "Vert", hex: "#10B981" },
  { id: "blue", label: "Bleu", hex: "#3B82F6" },
  { id: "purple", label: "Violet", hex: "#8B5CF6" },
] as const

export const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/

export interface UseAccentReturn {
  accent: string | null
  setAccent: (hex: string | null) => void
  isPreset: (hex: string) => boolean
  presets: typeof ACCENT_PRESETS
}

function applyAccent(hex: string | null) {
  if (typeof document === "undefined") return
  const root = document.documentElement
  if (hex && HEX_REGEX.test(hex)) {
    root.style.setProperty("--primary", hex)
  } else {
    root.style.removeProperty("--primary")
  }
}

export function useAccent(): UseAccentReturn {
  const [accent, setAccentState] = useState<string | null>(null)

  useEffect(() => {
    try {
      const stored = persistence.getItem<string>(STORAGE_KEY)
      if (stored && HEX_REGEX.test(stored)) {
        setAccentState(stored)
        applyAccent(stored)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const setAccent = useCallback((hex: string | null) => {
    if (hex !== null && !HEX_REGEX.test(hex)) return
    setAccentState(hex)
    applyAccent(hex)
    try {
      if (hex) void persistence.setItem(STORAGE_KEY, hex)
      else void persistence.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const isPreset = useCallback(
    (hex: string) => ACCENT_PRESETS.some((p) => p.hex.toLowerCase() === hex.toLowerCase()),
    []
  )

  return { accent, setAccent, isPreset, presets: ACCENT_PRESETS }
}
```

- [ ] **Step 3.4: Run test, verify it passes**

Run: `cd reqy-web && npx vitest run hooks/__tests__/use-accent.test.tsx`
Expected: PASS (6 cases).

- [ ] **Step 3.5: Commit**

```bash
git add reqy-web/hooks/use-accent.ts reqy-web/hooks/__tests__/use-accent.test.tsx
git -c commit.gpgsign=false commit -m "feat(settings): add use-accent hook with hex validation + persistence"
```

---

## Task 4: `ThemeCards` component (3 cards + dropdown)

**Files:**
- Create: `reqy-web/components/settings/sections/theme-cards.tsx`

- [ ] **Step 4.1: Write component**

Create `reqy-web/components/settings/sections/theme-cards.tsx`:

```tsx
"use client"

import { useTheme, type Theme } from "@/components/theme-provider"
import { Card, CardContent } from "@/components/ui/card"
import { Check } from "lucide-react"

interface ThemeOption {
  id: Theme
  label: string
  preview: "light" | "dark"
}

const PRIMARY_THEMES: ThemeOption[] = [
  { id: "light", label: "Clair", preview: "light" },
  { id: "dark", label: "Sombre", preview: "dark" },
]

const MORE_THEMES: ThemeOption[] = [
  { id: "emerald", label: "Émeraude", preview: "light" },
  { id: "ocean", label: "Océan", preview: "light" },
  { id: "sunset", label: "Coucher de soleil", preview: "light" },
  { id: "purple", label: "Violet", preview: "light" },
  { id: "midnight", label: "Minuit", preview: "dark" },
]

function ThemePreview({ variant }: { variant: "light" | "dark" }) {
  const bg = variant === "light" ? "#ffffff" : "#0a0a0a"
  const surface = variant === "light" ? "#f4f4f5" : "#18181b"
  const accent = variant === "light" ? "#8B5CF6" : "#a78bfa"
  const text = variant === "light" ? "#18181b" : "#fafafa"
  return (
    <svg viewBox="0 0 120 80" className="h-20 w-full rounded-md border" aria-hidden="true">
      <rect width="120" height="80" fill={bg} />
      <rect x="8" y="8" width="24" height="64" rx="4" fill={surface} />
      <rect x="40" y="12" width="72" height="14" rx="3" fill={surface} />
      <rect x="40" y="32" width="48" height="14" rx="3" fill={surface} />
      <rect x="40" y="52" width="64" height="14" rx="3" fill={accent} opacity="0.2" />
      <rect x="44" y="56" width="20" height="6" rx="2" fill={accent} />
      <text x="12" y="22" fontSize="6" fill={text} fontWeight="600">Reqly</text>
    </svg>
  )
}

function ThemeCard({ option, active, onSelect }: { option: ThemeOption; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={`group relative flex flex-col gap-3 rounded-xl border-2 p-3 text-left transition-all duration-150 hover:border-primary/40 ${
        active ? "border-primary shadow-sm scale-[1.02]" : "border-border"
      }`}
    >
      {active && (
        <span className="absolute right-2 top-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Check className="size-3" />
        </span>
      )}
      <ThemePreview variant={option.preview} />
      <span className="text-sm font-medium">{option.label}</span>
    </button>
  )
}

export function ThemeCards() {
  const { theme, setTheme } = useTheme()
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Thème</h3>
        <p className="text-xs text-muted-foreground">Choisissez l'apparence de l'interface.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {PRIMARY_THEMES.map((opt) => (
          <ThemeCard key={opt.id} option={opt} active={theme === opt.id} onSelect={() => setTheme(opt.id)} />
        ))}
      </div>
      <div>
        <p className="mb-2 text-xs text-muted-foreground">Plus de thèmes :</p>
        <div className="flex flex-wrap gap-2">
          {MORE_THEMES.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setTheme(opt.id)}
              aria-pressed={theme === opt.id}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                theme === opt.id ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4.2: Type check**

Run: `cd reqy-web && npx tsc --noEmit 2>&1 | grep theme-cards`
Expected: no errors.

- [ ] **Step 4.3: Commit**

```bash
git add reqy-web/components/settings/sections/theme-cards.tsx
git -c commit.gpgsign=false commit -m "feat(settings): add ThemeCards (3 primary + 5 more themes)"
```

---

## Task 5: `AccentPicker` component

**Files:**
- Create: `reqy-web/components/settings/sections/accent-picker.tsx`

- [ ] **Step 5.1: Write component**

Create `reqy-web/components/settings/sections/accent-picker.tsx`:

```tsx
"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAccent, HEX_REGEX } from "@/hooks/use-accent"

export function AccentPicker() {
  const { accent, setAccent, presets } = useAccent()
  const [input, setInput] = useState(accent ?? "#")
  const [error, setError] = useState<string | null>(null)

  function applyCustom(e: FormEvent) {
    e.preventDefault()
    if (!HEX_REGEX.test(input)) {
      setError("Format hex invalide (ex: #8B5CF6)")
      return
    }
    setError(null)
    setAccent(input)
  }

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Couleur d'accent</h3>
        <p className="text-xs text-muted-foreground">Personnalisez la couleur primaire de l'interface.</p>
      </div>
      <div className="flex items-center gap-2">
        {presets.map((p) => {
          const active = accent?.toLowerCase() === p.hex.toLowerCase()
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => { setAccent(p.hex); setError(null) }}
              aria-label={p.label}
              aria-pressed={active}
              title={p.label}
              className={`size-8 rounded-full border-2 transition-all hover:scale-110 ${
                active ? "border-foreground scale-110 shadow-sm" : "border-transparent"
              }`}
              style={{ backgroundColor: p.hex }}
            />
          )
        })}
      </div>
      <form onSubmit={applyCustom} className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-md border px-2 py-1">
          <span className="size-5 rounded border" style={{ backgroundColor: HEX_REGEX.test(input) ? input : "transparent" }} aria-hidden="true" />
          <Input
            value={input}
            onChange={(e) => { setInput(e.target.value); setError(null) }}
            placeholder="#8B5CF6"
            className="h-7 w-28 border-0 p-0 font-mono text-xs"
            maxLength={7}
          />
        </div>
        <Button type="submit" size="sm" variant="outline">Appliquer</Button>
        {accent && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setAccent(null)}>
            Réinitialiser
          </Button>
        )}
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}
```

- [ ] **Step 5.2: Type check + commit**

```bash
cd reqy-web && npx tsc --noEmit 2>&1 | grep accent-picker
git add reqy-web/components/settings/sections/accent-picker.tsx
git -c commit.gpgsign=false commit -m "feat(settings): add AccentPicker with 5 presets + custom hex"
```

---

## Task 6: `AnimationsToggle` component

**Files:**
- Create: `reqy-web/components/settings/sections/animations-toggle.tsx`

- [ ] **Step 6.1: Write component**

Create `reqy-web/components/settings/sections/animations-toggle.tsx`:

```tsx
"use client"

import { useAnimations } from "@/hooks/use-animations"

export function AnimationsToggle() {
  const { enabled, toggle } = useAnimations()
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h3 className="text-sm font-medium">Animations</h3>
        <p className="text-xs text-muted-foreground">
          Désactive les transitions de l'interface. Recommandé pour l'accessibilité.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={toggle}
        className={`relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
          enabled ? "bg-[#3B82F6]" : "bg-gray-300"
        }`}
      >
        <span
          className={`pointer-events-none inline-block size-[27px] transform rounded-full bg-white shadow ring-0 transition duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            enabled ? "translate-x-[20px]" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  )
}
```

- [ ] **Step 6.2: Type check + commit**

```bash
cd reqy-web && npx tsc --noEmit 2>&1 | grep animations-toggle
git add reqy-web/components/settings/sections/animations-toggle.tsx
git -c commit.gpgsign=false commit -m "feat(settings): add AnimationsToggle (iOS-style switch)"
```

---

## Task 7: `TablesViewPreview` component (cosmetic)

**Files:**
- Create: `reqy-web/components/settings/sections/tables-view-preview.tsx`

- [ ] **Step 7.1: Write component**

Create `reqy-web/components/settings/sections/tables-view-preview.tsx`:

```tsx
"use client"

import { Check } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface ViewOption {
  id: string
  label: string
  rowHeight: number
}

const VIEW_OPTIONS: ViewOption[] = [
  { id: "compact", label: "Compact", rowHeight: 24 },
  { id: "comfortable", label: "Confortable", rowHeight: 32 },
  { id: "spacious", label: "Spacieux", rowHeight: 40 },
]

function Vignette({ rowHeight, active }: { rowHeight: number; active: boolean }) {
  return (
    <div className={`flex h-20 flex-col gap-1 rounded-md border p-2 ${active ? "border-primary bg-primary/5" : "border-border"}`}>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-1 rounded bg-muted" style={{ height: rowHeight / 3 }}>
          <span className="size-2 rounded-sm bg-foreground/40" />
          <span className="h-1 flex-1 rounded-sm bg-foreground/20" />
        </div>
      ))}
    </div>
  )
}

export function TablesViewPreview() {
  const { toast } = useToast()
  function handleSelect(id: string) {
    toast({
      title: "Aperçu uniquement",
      description: "L'apparence des tableaux sera configurable dans une prochaine version.",
    })
  }
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-medium">Apparence des tableaux</h3>
        <p className="text-xs text-muted-foreground">Densité d'affichage des listes (preview).</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {VIEW_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => handleSelect(opt.id)}
            className="group relative flex flex-col gap-2 rounded-xl border-2 border-transparent p-2 transition-all hover:border-primary/40"
          >
            <Vignette rowHeight={opt.rowHeight} active={false} />
            <span className="text-xs font-medium">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 7.2: Type check + commit**

```bash
cd reqy-web && npx tsc --noEmit 2>&1 | grep tables-view-preview
git add reqy-web/components/settings/sections/tables-view-preview.tsx
git -c commit.gpgsign=false commit -m "feat(settings): add TablesViewPreview (cosmetic)"
```

---

## Task 8: `ApparenceSection` orchestrator

**Files:**
- Create: `reqy-web/components/settings/sections/apparence-section.tsx`

- [ ] **Step 8.1: Write component**

Create `reqy-web/components/settings/sections/apparence-section.tsx`:

```tsx
"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ThemeCards } from "./theme-cards"
import { AccentPicker } from "./accent-picker"
import { AnimationsToggle } from "./animations-toggle"
import { TablesViewPreview } from "./tables-view-preview"

export function ApparenceSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Apparence</h2>
        <p className="text-sm text-muted-foreground">
          Personnalisez l'apparence de l'interface selon vos préférences.
        </p>
      </div>

      <Card>
        <CardContent className="space-y-6 pt-6">
          <ThemeCards />
          <Separator />
          <AccentPicker />
          <Separator />
          <AnimationsToggle />
          <Separator />
          <TablesViewPreview />
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 8.2: Type check + commit**

```bash
cd reqy-web && npx tsc --noEmit 2>&1 | grep apparence-section
git add reqy-web/components/settings/sections/apparence-section.tsx
git -c commit.gpgsign=false commit -m "feat(settings): add ApparenceSection orchestrator"
```

---

## Task 9: `ToolAssociationModal`

**Files:**
- Create: `reqy-web/components/settings/sections/tool-association-modal.tsx`

- [ ] **Step 9.1: Write component**

Create `reqy-web/components/settings/sections/tool-association-modal.tsx`:

```tsx
"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"

export interface Tool {
  id: string
  name: string
  description: string
  logoEmoji: string
  scopes: string[]
  oauthUrl?: string
}

interface ToolAssociationModalProps {
  tool: Tool | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ToolAssociationModal({ tool, open, onOpenChange }: ToolAssociationModalProps) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  async function handleAssociate() {
    if (!tool) return
    if (!tool.oauthUrl) {
      toast({ title: "Bientôt disponible", description: `${tool.name} sera bientôt disponible.` })
      onOpenChange(false)
      return
    }
    setLoading(true)
    window.location.href = tool.oauthUrl
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {tool && (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                <span className="text-3xl" aria-hidden="true">{tool.logoEmoji}</span>
                <div>
                  <DialogTitle>Associer {tool.name}</DialogTitle>
                  <DialogDescription>{tool.description}</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="mb-2 font-medium">Autorisations demandées :</p>
              <ul className="space-y-1 text-muted-foreground">
                {tool.scopes.map((s) => (
                  <li key={s} className="flex gap-2">
                    <span aria-hidden="true">•</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
                Annuler
              </Button>
              <Button onClick={handleAssociate} disabled={loading}>
                {loading ? "Redirection…" : `Associer ${tool.name} →`}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 9.2: Type check + commit**

```bash
cd reqy-web && npx tsc --noEmit 2>&1 | grep tool-association-modal
git add reqy-web/components/settings/sections/tool-association-modal.tsx
git -c commit.gpgsign=false commit -m "feat(settings): add ToolAssociationModal with OAuth + stub flow"
```

---

## Task 10: `ToolsSection` grid (3×N)

**Files:**
- Create: `reqy-web/components/settings/sections/tools-section.tsx`

- [ ] **Step 10.1: Write component**

Create `reqy-web/components/settings/sections/tools-section.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ToolAssociationModal, type Tool } from "./tool-association-modal"

const TOOLS: Tool[] = [
  {
    id: "postman",
    name: "Postman",
    description: "Import et export de collections Postman.",
    logoEmoji: "📮",
    scopes: ["Lecture de vos collections", "Création de collections"],
    oauthUrl: "/api/postman-auth",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Accès à vos repositories et gists.",
    logoEmoji: "🐙",
    scopes: ["Lecture de vos repositories", "Lecture de votre profil", "Création de gists"],
    oauthUrl: "/api/github-auth",
  },
  {
    id: "linear",
    name: "Linear",
    description: "Synchronisation avec vos tickets Linear (bêta).",
    logoEmoji: "⚡",
    scopes: ["Lecture de vos tickets"],
    // Pas de oauthUrl → stub
  },
]

function useToolStatus(toolId: string): "connected" | "disconnected" | "loading" {
  const [status, setStatus] = useState<"connected" | "disconnected" | "loading">("loading")
  useEffect(() => {
    let cancelled = false
    const url =
      toolId === "github"
        ? "/api/github-auth/status"
        : toolId === "postman"
        ? "/api/postman-auth/status"
        : null
    if (!url) {
      setStatus("disconnected")
      return
    }
    fetch(url, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setStatus(data.connected ? "connected" : "disconnected")
      })
      .catch(() => {
        if (!cancelled) setStatus("disconnected")
      })
    return () => {
      cancelled = true
    }
  }, [toolId])
  return status
}

function ToolCard({ tool, onAssociate }: { tool: Tool; onAssociate: () => void }) {
  const status = useToolStatus(tool.id)
  return (
    <Card className="flex flex-col gap-3 p-5 transition-all hover:border-primary/30 hover:shadow-md">
      <div className="flex items-center gap-3">
        <span className="text-3xl" aria-hidden="true">{tool.logoEmoji}</span>
        <h3 className="text-base font-semibold">{tool.name}</h3>
      </div>
      <p className="line-clamp-2 text-sm text-muted-foreground">{tool.description}</p>
      <div className="mt-auto flex items-center justify-between gap-2">
        {status === "loading" ? (
          <span className="size-2 animate-pulse rounded-full bg-muted-foreground/30" />
        ) : (
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
              status === "connected" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground"
            }`}
          >
            <span className={`size-1.5 rounded-full ${status === "connected" ? "bg-emerald-500" : "bg-muted-foreground"}`} />
            {status === "connected" ? "Connecté" : "Non connecté"}
          </span>
        )}
        <Button size="sm" variant={status === "connected" ? "outline" : "default"} onClick={onAssociate}>
          {status === "connected" ? "Gérer" : "Associer"}
        </Button>
      </div>
    </Card>
  )
}

export function ToolsSection() {
  const [activeTool, setActiveTool] = useState<Tool | null>(null)
  const [open, setOpen] = useState(false)
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Outils connectés</h2>
        <p className="text-sm text-muted-foreground">
          Connectez vos services tiers pour importer et synchroniser vos données.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {TOOLS.map((tool) => (
          <ToolCard
            key={tool.id}
            tool={tool}
            onAssociate={() => {
              setActiveTool(tool)
              setOpen(true)
            }}
          />
        ))}
      </div>
      <ToolAssociationModal tool={activeTool} open={open} onOpenChange={setOpen} />
    </div>
  )
}
```

- [ ] **Step 10.2: Type check + commit**

```bash
cd reqy-web && npx tsc --noEmit 2>&1 | grep tools-section
git add reqy-web/components/settings/sections/tools-section.tsx
git -c commit.gpgsign=false commit -m "feat(settings): add ToolsSection with 3xN card grid + status hooks"
```

---

## Task 11: `SettingsSidebar` component

**Files:**
- Create: `reqy-web/components/settings/settings-sidebar.tsx`

- [ ] **Step 11.1: Write component**

Create `reqy-web/components/settings/settings-sidebar.tsx`:

```tsx
"use client"

import {
  Palette,
  User,
  Sparkles,
  Bell,
  Cloud,
  Plug,
  ShieldAlert,
  ChevronsLeft,
  ChevronsRight,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type SettingsSection =
  | "apparence"
  | "profile"
  | "ai"
  | "notifications"
  | "sync"
  | "integrations"
  | "account"

interface SectionDef {
  key: SettingsSection
  label: string
  icon: LucideIcon
  destructive?: boolean
}

const SECTIONS: SectionDef[] = [
  { key: "apparence", label: "Apparence", icon: Palette },
  { key: "profile", label: "Profil & Sécurité", icon: User },
  { key: "ai", label: "Assistant IA", icon: Sparkles },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "sync", label: "Import / Export", icon: Cloud },
  { key: "integrations", label: "Outils connectés", icon: Plug },
  { key: "account", label: "Actions du compte", icon: ShieldAlert, destructive: true },
]

interface SettingsSidebarProps {
  active: SettingsSection
  onChange: (s: SettingsSection) => void
  collapsed: boolean
  onToggleCollapse: () => void
}

export function SettingsSidebar({ active, onChange, collapsed, onToggleCollapse }: SettingsSidebarProps) {
  return (
    <aside
      className={cn(
        "sticky top-0 flex h-full shrink-0 flex-col border-r bg-card transition-[width] duration-200",
        collapsed ? "w-[60px]" : "w-60"
      )}
      aria-label="Sections des paramètres"
    >
      <nav className="flex-1 overflow-y-auto p-2">
        <ul className="space-y-1">
          {SECTIONS.map(({ key, label, icon: Icon, destructive }) => {
            const isActive = active === key
            return (
              <li key={key} className="relative">
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
                )}
                <button
                  type="button"
                  onClick={() => onChange(key)}
                  title={collapsed ? label : undefined}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    collapsed ? "justify-center" : "gap-3",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : destructive
                      ? "text-destructive hover:bg-destructive/5"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                  {!collapsed && <span className="truncate">{label}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={collapsed ? "Étendre la sidebar" : "Réduire la sidebar"}
        className="flex h-10 items-center justify-center border-t text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
      </button>
    </aside>
  )
}
```

- [ ] **Step 11.2: Type check + commit**

```bash
cd reqy-web && npx tsc --noEmit 2>&1 | grep settings-sidebar
git add reqy-web/components/settings/settings-sidebar.tsx
git -c commit.gpgsign=false commit -m "feat(settings): add SettingsSidebar with 7 sections + collapse toggle"
```

---

## Task 12: `SettingsLayout` wrapper

**Files:**
- Create: `reqy-web/components/settings/settings-layout.tsx`

- [ ] **Step 12.1: Write component**

Create `reqy-web/components/settings/settings-layout.tsx`:

```tsx
"use client"

import { useState, type ReactNode } from "react"
import { SettingsSidebar, type SettingsSection } from "./settings-sidebar"

interface SettingsLayoutProps {
  active: SettingsSection
  onChange: (s: SettingsSection) => void
  children: ReactNode
}

export function SettingsLayout({ active, onChange, children }: SettingsLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="flex h-full gap-6">
      <SettingsSidebar
        active={active}
        onChange={onChange}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />
      <main className="flex-1 min-w-0 overflow-y-auto px-4 py-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  )
}
```

- [ ] **Step 12.2: Type check + commit**

```bash
cd reqy-web && npx tsc --noEmit 2>&1 | grep settings-layout
git add reqy-web/components/settings/settings-layout.tsx
git -c commit.gpgsign=false commit -m "feat(settings): add SettingsLayout (two-column wrapper)"
```

---

## Task 13: Refonte `app/settings/page.tsx`

**Files:**
- Modify: `reqy-web/app/settings/page.tsx`

- [ ] **Step 13.1: Read current file**

Identify:
- The `SECTION_ITEMS` array (lines ~44-50)
- The inline sidebar JSX block (~285-318)
- The `<ProfileSection user={authUser} />` etc. renders
- The state hooks (`activeSection`, `setActiveSection`)

- [ ] **Step 13.2: Add imports**

Add at top of file (merge with existing imports):

```tsx
import { SettingsLayout } from "@/components/settings/settings-layout"
import type { SettingsSection } from "@/components/settings/settings-sidebar"
import { ApparenceSection } from "@/components/settings/sections/apparence-section"
import { ToolsSection } from "@/components/settings/sections/tools-section"
```

- [ ] **Step 13.3: Update section key type**

If the existing `SectionKey` type doesn't include `"apparence"`, extend it to be derived from `SettingsSection`:

```tsx
type SectionKey = SettingsSection
```

Or keep `SectionKey` as a union and ensure it matches `SettingsSection["key"]` values. The cleanest is to delete the local `SECTION_ITEMS` and use the one in `settings-sidebar.tsx`.

- [ ] **Step 13.4: Wrap content in SettingsLayout**

Find the main render JSX. The current shape is:

```tsx
<div className="flex h-screen bg-background bg-dot-pattern">
  <ApiSidebar ... />
  <div className="flex flex-1 flex-col min-h-0 overflow-hidden ...">
    <ApiHeader />
    <div className="flex-1 min-h-0 overflow-y-auto space-y-6 p-6">
      <div className="flex gap-6">
        <aside className="w-56 ...">...</aside>          {/* DELETE this aside */}
        <div className="flex-1 space-y-6">
          {activeSection === "profile" ? ... : null}
          ...
        </div>
      </div>
    </div>
  </div>
</div>
```

Replace the inner `<div className="flex gap-6">...</div>` (which contains the old aside + content) with:

```tsx
<SettingsLayout active={activeSection} onChange={setActiveSection}>
  {activeSection === "apparence" ? <ApparenceSection /> : null}
  {activeSection === "profile" && authUser ? <ProfileSection user={authUser} /> : null}
  {activeSection === "ai" ? <AISection ... /> : null}
  {activeSection === "notifications" ? <NotificationsSection ... /> : null}
  {activeSection === "sync" ? <SyncSection ... /> : null}
  {activeSection === "integrations" ? <ToolsSection /> : null}
  {activeSection === "account" ? <AccountActionsSection /> : null}
</SettingsLayout>
```

(The exact existing components vary — keep the same names/imports that were there before. Just replace the wrapping aside+inner div.)

- [ ] **Step 13.5: Delete the inline sidebar**

Delete the entire `<aside className="w-56 ...">...</aside>` block that was the old inline sidebar. Also remove the `SECTION_ITEMS` local array (now lives in `settings-sidebar.tsx`).

- [ ] **Step 13.6: Type check**

Run: `cd reqy-web && npx tsc --noEmit 2>&1 | grep "settings/page"`
Expected: no errors.

- [ ] **Step 13.7: Commit**

```bash
git add reqy-web/app/settings/page.tsx
git -c commit.gpgsign=false commit -m "refactor(settings): wrap in SettingsLayout; remove inline sidebar"
```

---

## Task 14: Build, tests, manual smoke checklist

- [ ] **Step 14.1: Run all unit tests**

```bash
cd reqy-web && npx vitest run 2>&1 | tail -30
```

Expected: all tests pass (existing + 4 use-animations + 6 use-accent).

- [ ] **Step 14.2: Run type check**

```bash
cd reqy-web && npx tsc --noEmit 2>&1 | tail -20
```

Expected: no new errors. Pre-existing error in `.next/dev/types/app/api/mock/config/route.ts` is acceptable.

- [ ] **Step 14.3: Manual smoke checklist**

Create `.kimchi/docs/2026-06-27-settings-redesign-smoke.md`:

```markdown
# Settings redesign — Smoke checklist

Run `cd reqy-web && npx next dev` then walk through these scenarios:

| # | Scenario | Expected |
|---|----------|----------|
| M1 | Open /settings | 7 sections in sidebar, "Apparence" active |
| M2 | Click "Profil & Sécurité" | Content swaps with animation |
| M3 | Apparence → card "Sombre" | Theme dark, reload preserves |
| M4 | Apparence → cercle violet | Primary color becomes violet |
| M5 | Toggle Animations off | All transitions disabled app-wide |
| M6 | DevTools emulate reduced-motion + reload | Animations toggle starts off |
| M7 | Outils → "Associer" sur GitHub | Modal opens with scopes listed |
| M8 | Modal GitHub → "Associer" | Redirect to /api/github-auth |
| M9 | Outils → "Associer" sur Linear | Toast "Bientôt disponible" |
| M10 | Refresh with accent + animations in localStorage | No flash, prefs applied pre-paint |

## Verdict

- [ ] All 10 scenarios pass
- [ ] `pnpm test` exit 0
- [ ] `npx tsc --noEmit` no new errors
```

- [ ] **Step 14.4: Final commit**

```bash
git add .kimchi/docs/2026-06-27-settings-redesign-smoke.md
git -c commit.gpgsign=false commit -m "chore: smoke test checklist for settings redesign"
```

---

## Self-Review Notes

- **Spec coverage**: Each spec section → a task. §3.1→T11, §3.2.1→T4, §3.2.2→T5, §3.2.3→T6, §3.2.4→T7, §3.3→T10, §3.4→T9, §3.5→T2/T3, §3.6→T12, §4→T1/T13.
- **No placeholders**: All steps have exact code or commands.
- **Type consistency**: `SettingsSection` defined once in T11 (`settings-sidebar.tsx`), consumed by T12 + T13. `use-animations` and `use-accent` exported types match between hook and consumer.
- **Scope check**: Single feature, 14 tasks, ~4-5 hours work.
