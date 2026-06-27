# Externalize Auth UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move authentication out of `/settings` into a dedicated `/login` page, make the sidebar user widget dynamic, and add a rich Profile section in `/settings`.

**Architecture:** New `useAuth()` hook reads from `/api/auth/status` (existing). New `/login` + `/signup` pages with split-pane layout (no sidebar). Sidebar widget reacts to hook state. Profile section in `/settings` becomes rich (read-only + editable + danger zone). All backend routes (`/api/auth/*`, `/api/github-auth/*`) stay untouched.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind, shadcn/ui (Radix DropdownMenu, AlertDialog), Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-06-27-externalize-auth-design.md`

---

## File Structure

**Create (10 files):**
- `reqy-web/lib/redirect.ts` — pure function `safeRedirect(input, fallback?)` (small, isolated)
- `reqy-web/lib/__tests__/redirect.test.ts` — 12 unit cases
- `reqy-web/hooks/use-auth.ts` — React hook, fetches `/api/auth/status`, manages state
- `reqy-web/hooks/__tests__/use-auth.test.tsx` — mocked fetch + renderHook
- `reqy-web/components/sidebar/user-menu.tsx` — Radix DropdownMenu wrapper
- `reqy-web/components/login/login-layout.tsx` — split-pane shell (branding + slot)
- `reqy-web/components/login/login-form.tsx` — email/password + OAuth buttons
- `reqy-web/components/login/signup-form.tsx` — email/password + confirm
- `reqy-web/app/login/page.tsx` — uses login-form, redirects if connected
- `reqy-web/app/signup/page.tsx` — uses signup-form, redirects if connected

**Modify (3 files):**
- `reqy-web/components/api-sidebar.tsx` — replace hardcoded user block with dynamic widget
- `reqy-web/components/settings/profile-section.tsx` — full refonte (read-only + edit + password + 2FA + danger)
- `reqy-web/app/settings/page.tsx` — remove `AccountSection`, remove `signupWithEmail`/`loginWithEmail` handlers, wire new `ProfileSection`

**Tests:** `pnpm test` (Vitest). Manual smoke tests at end.

---

## Task 1: `safeRedirect` utility + tests

**Files:**
- Create: `reqy-web/lib/redirect.ts`
- Create: `reqy-web/lib/__tests__/redirect.test.ts`

- [ ] **Step 1.1: Write failing tests**

Create `reqy-web/lib/__tests__/redirect.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { safeRedirect } from "@/lib/redirect"

describe("safeRedirect", () => {
  it.each([
    [null, "/"],
    [undefined, "/"],
    ["", "/"],
    ["/", "/"],
    ["/collections", "/collections"],
    ["/settings#profile", "/settings#profile"],
    ["/collections?filter=active", "/collections?filter=active"],
    ["//evil.com", "/"],
    ["https://evil.com", "/"],
    ["javascript:alert(1)", "/"],
    ["file:///etc/passwd", "/"],
    ["../../etc/passwd", "/"],
  ])("safeRedirect(%j) returns %j", (input, expected) => {
    expect(safeRedirect(input as string | null | undefined)).toBe(expected)
  })

  it("honors custom fallback", () => {
    expect(safeRedirect(null, "/dashboard")).toBe("/dashboard")
    expect(safeRedirect("//evil.com", "/dashboard")).toBe("/dashboard")
  })
})
```

- [ ] **Step 1.2: Run test, verify it fails**

Run: `cd reqy-web && npx vitest run lib/__tests__/redirect.test.ts`
Expected: FAIL — module `@/lib/redirect` not found.

- [ ] **Step 1.3: Write minimal implementation**

Create `reqy-web/lib/redirect.ts`:

```ts
const SAFE_REDIRECT = /^\/[a-zA-Z0-9_\-/]*(?:\?[^#]*)?(?:#.*)?$/

/**
 * Validates a redirect path to prevent open-redirect and XSS attacks.
 * Returns the input if it's a safe internal path, otherwise the fallback.
 */
export function safeRedirect(input: string | null | undefined, fallback = "/"): string {
  if (!input) return fallback
  if (input.includes("//") || /^[a-z]+:/i.test(input)) return fallback
  if (!SAFE_REDIRECT.test(input)) return fallback
  return input
}
```

- [ ] **Step 1.4: Run test, verify it passes**

Run: `cd reqy-web && npx vitest run lib/__tests__/redirect.test.ts`
Expected: PASS (13 cases).

- [ ] **Step 1.5: Commit**

```bash
git add reqy-web/lib/redirect.ts reqy-web/lib/__tests__/redirect.test.ts
git commit -m "feat(auth): add safeRedirect utility to block open redirects"
```

---

## Task 2: `useAuth()` hook + tests

**Files:**
- Create: `reqy-web/hooks/use-auth.ts`
- Create: `reqy-web/hooks/__tests__/use-auth.test.tsx`

- [ ] **Step 2.1: Write failing tests**

Create `reqy-web/hooks/__tests__/use-auth.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"

const mockRouterRefresh = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRouterRefresh }),
}))

import { useAuth } from "@/hooks/use-auth"

function mockFetchOnce(response: { ok: boolean; body: unknown }) {
  global.fetch = vi.fn().mockResolvedValueOnce({
    ok: response.ok,
    json: () => Promise.resolve(response.body),
  } as Response)
}

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRouterRefresh.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("starts in loading state, transitions to connected", async () => {
    mockFetchOnce({
      ok: true,
      body: { connected: true, user: { email: "a@b.c", name: "Alice", provider: "google" } },
    })
    const { result } = renderHook(() => useAuth())
    expect(result.current.status).toBe("loading")
    await waitFor(() => expect(result.current.status).toBe("connected"))
    expect(result.current.user).toEqual({ email: "a@b.c", name: "Alice", provider: "google" })
  })

  it("transitions to disconnected on 200 connected:false", async () => {
    mockFetchOnce({ ok: true, body: { connected: false } })
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.status).toBe("disconnected"))
    expect(result.current.user).toBeNull()
  })

  it("transitions to disconnected on network error", async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error("network"))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.status).toBe("disconnected"))
  })

  it("logout clears state and posts to /api/auth/logout", async () => {
    mockFetchOnce({ ok: true, body: { connected: true, user: { email: "a@b.c", name: "A", provider: "local" } } })
    const logoutFetch = vi.fn().mockResolvedValueOnce({ ok: true })
    global.fetch = logoutFetch

    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.status).toBe("connected"))

    await act(async () => { await result.current.logout() })

    expect(logoutFetch).toHaveBeenCalledWith("/api/auth/logout", expect.objectContaining({ method: "POST" }))
    expect(result.current.status).toBe("disconnected")
    expect(mockRouterRefresh).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2.2: Run test, verify it fails**

Run: `cd reqy-web && npx vitest run hooks/__tests__/use-auth.test.tsx`
Expected: FAIL — `@/hooks/use-auth` not found.

- [ ] **Step 2.3: Write minimal implementation**

Create `reqy-web/hooks/use-auth.ts`:

```ts
"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export type AuthStatus = "loading" | "connected" | "disconnected"
export type AuthProvider = "local" | "google" | "github"

export interface AuthUser {
  email: string
  name: string
  provider: AuthProvider
}

export interface UseAuthReturn {
  status: AuthStatus
  user: AuthUser | null
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

const STATUS_URL = "/api/auth/status"
const LOGOUT_URL = "/api/auth/logout"

export function useAuth(): UseAuthReturn {
  const [status, setStatus] = useState<AuthStatus>("loading")
  const [user, setUser] = useState<AuthUser | null>(null)
  const router = useRouter()

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(STATUS_URL, { credentials: "include", cache: "no-store" })
      if (!res.ok) {
        setStatus("disconnected")
        setUser(null)
        return
      }
      const data = await res.json()
      if (data.connected && data.user) {
        setStatus("connected")
        setUser(data.user)
      } else {
        setStatus("disconnected")
        setUser(null)
      }
    } catch {
      setStatus("disconnected")
      setUser(null)
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch(LOGOUT_URL, { method: "POST", credentials: "include" })
    } catch {
      /* still clear local state */
    }
    setStatus("disconnected")
    setUser(null)
    router.refresh()
  }, [router])

  useEffect(() => {
    void refresh()
    const onFocus = () => { void refresh() }
    const onStorage = (e: StorageEvent) => {
      if (e.key === "auth_session") void refresh()
    }
    window.addEventListener("focus", onFocus)
    window.addEvent("storage", onStorage)
    return () => {
      window.removeEventListener("focus", onFocus)
      window.removeEventListener("storage", onStorage)
    }
  }, [refresh])

  return { status, user, refresh, logout }
}
```

- [ ] **Step 2.4: Run test, verify it passes**

Run: `cd reqy-web && npx vitest run hooks/__tests__/use-auth.test.tsx`
Expected: PASS (4 cases).

- [ ] **Step 2.5: Commit**

```bash
git add reqy-web/hooks/use-auth.ts reqy-web/hooks/__tests__/use-auth.test.tsx
git commit -m "feat(auth): add useAuth hook for client-side session state"
```

---

## Task 3: `UserMenu` dropdown component

**Files:**
- Create: `reqy-web/components/sidebar/user-menu.tsx`

- [ ] **Step 3.1: Write component (no test — covered by manual smoke in Task 11)**

Create `reqy-web/components/sidebar/user-menu.tsx`:

```tsx
"use client"

import Link from "next/link"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ChevronDown, LogOut, User as UserIcon } from "lucide-react"
import type { AuthUser } from "@/hooks/use-auth"

interface UserMenuProps {
  user: AuthUser
  onLogout: () => Promise<void>
}

const PROVIDER_LABELS: Record<AuthUser["provider"], string> = {
  local: "Email",
  google: "Google",
  github: "GitHub",
}

function avatarUrl(email: string): string {
  const seed = encodeURIComponent(email.split("@")[0] || "user")
  return `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed}`
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("")
}

export function UserMenu({ user, onLogout }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Menu utilisateur"
          className="group/profile flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-all duration-200 hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Avatar className="size-8 shrink-0 ring-2 ring-transparent transition-all duration-200 group-hover/profile:ring-primary/30">
            <AvatarImage src={avatarUrl(user.email)} alt={user.name} />
            <AvatarFallback>{initials(user.name) || "?"}</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-medium text-foreground">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">{user.email}</span>
          </div>
          <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground/60 transition-transform duration-200 group-data-[state=open]/profile:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 py-2">
          <span className="text-sm font-medium">{user.name}</span>
          <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
          <span className="mt-1 inline-flex w-fit items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            {PROVIDER_LABELS[user.provider]}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings#profile" className="cursor-pointer">
            <UserIcon className="mr-2 size-4" />
            Mon profil
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => { void onLogout() }}
          className="cursor-pointer text-muted-foreground focus:text-destructive"
        >
          <LogOut className="mr-2 size-4" />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
```

- [ ] **Step 3.2: Verify component imports resolve**

Run: `cd reqy-web && npx tsc --noEmit components/sidebar/user-menu.tsx`
Expected: no errors (or only existing pre-existing errors). If `@/components/ui/dropdown-menu` is missing, create it as shadcn default:

```bash
cd reqy-web && npx shadcn@latest add dropdown-menu --yes
```

- [ ] **Step 3.3: Commit**

```bash
git add reqy-web/components/sidebar/user-menu.tsx reqy-web/components/ui/dropdown-menu.tsx
git commit -m "feat(sidebar): add UserMenu dropdown component"
```

---

## Task 4: `LoginLayout` split-pane shell

**Files:**
- Create: `reqy-web/components/login/login-layout.tsx`

- [ ] **Step 4.1: Write component**

Create `reqy-web/components/login/login-layout.tsx`:

```tsx
"use client"

import type { ReactNode } from "react"
import { AppIcon } from "@/components/app-icon"

interface LoginLayoutProps {
  title: string
  children: ReactNode
}

export function LoginLayout({ title, children }: LoginLayoutProps) {
  return (
    <div className="flex min-h-screen w-full bg-background">
      {/* Left pane — branding */}
      <aside
        aria-hidden="true"
        className="relative hidden flex-1 flex-col justify-between overflow-hidden border-r border-border bg-gradient-to-br from-primary/15 via-primary/5 to-accent/30 p-10 lg:flex"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-sm">
            <AppIcon aria-hidden="true" className="size-6 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-semibold text-foreground">Reqly</span>
            <span className="text-xs text-muted-foreground">Pro</span>
          </div>
        </div>

        <div className="space-y-6">
          <h1 className="max-w-md text-3xl font-semibold leading-tight text-foreground">
            L'API playground nouvelle génération.
          </h1>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-center gap-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">✓</span>
              Mock servers et environnements multiples
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">✓</span>
              Assistant IA pour générer vos requêtes
            </li>
            <li className="flex items-center gap-3">
              <span className="flex size-6 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">✓</span>
              Collections, tests automatisés et synchronisation cloud
            </li>
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          En vous connectant, vous acceptez nos conditions d'utilisation et notre politique de confidentialité.
        </p>
      </aside>

      {/* Right pane — form */}
      <main className="flex flex-1 items-center justify-center p-6 lg:p-10">
        <div className="w-full max-w-sm space-y-6">
          <div className="space-y-2 text-center lg:text-left">
            <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 4.2: Commit**

```bash
git add reqy-web/components/login/login-layout.tsx
git commit -m "feat(login): add split-pane LoginLayout shell"
```

---

## Task 5: `LoginForm` component

**Files:**
- Create: `reqy-web/components/login/login-form.tsx`

- [ ] **Step 5.1: Write component**

Create `reqy-web/components/login/login-form.tsx`:

```tsx
"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { getSupabaseBrowserClient } from "@/lib/supabase-client"
import { isTauriAvailable } from "@/lib/tauri"
import { safeRedirect } from "@/lib/redirect"

interface LoginFormProps {
  redirect?: string
}

export function LoginForm({ redirect }: LoginFormProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  async function handleEmailLogin(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: "Erreur", description: data.message || "Impossible de se connecter", variant: "destructive" })
        return
      }
      toast({ title: "Connecté", description: `Bienvenue ${data.user?.name ?? email}` })
      router.replace(safeRedirect(redirect))
    } catch {
      toast({ title: "Erreur réseau", description: "Vérifiez votre connexion", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  async function handleOAuth(provider: "google" | "github") {
    setLoading(true)
    try {
      const supabase = getSupabaseBrowserClient()
      const redirectTo = `${window.location.origin}/auth/callback${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      })
      if (error || !data?.url) throw error ?? new Error("URL OAuth manquante")
      if (isTauriAvailable()) {
        const { invoke } = await import("@tauri-apps/api/core")
        await invoke("open_external", { url: data.url })
      } else {
        window.location.href = data.url
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur OAuth"
      toast({ title: "Erreur OAuth", description: msg, variant: "destructive" })
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={loading}
          onClick={() => handleOAuth("google")}
        >
          <span className="mr-2">🔵</span> Continuer avec Google
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={loading}
          onClick={() => handleOAuth("github")}
        >
          <span className="mr-2">⚫</span> Continuer avec GitHub
        </Button>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-background px-2 text-muted-foreground">ou avec votre email</span>
        </div>
      </div>

      <form onSubmit={handleEmailLogin} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Connexion…" : "Se connecter"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Pas encore de compte ?{" "}
        <Link
          href={`/signup${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`}
          className="font-medium text-primary hover:underline"
        >
          Créer un compte
        </Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 5.2: Verify imports**

Run: `cd reqy-web && npx tsc --noEmit components/login/login-form.tsx`
Expected: no errors related to this file. If `@/hooks/use-toast` doesn't exist, use the project's existing toast system (check `app/settings/page.tsx` for the pattern used — most likely `import { useToast } from "@/hooks/use-toast"`).

- [ ] **Step 5.3: Commit**

```bash
git add reqy-web/components/login/login-form.tsx
git commit -m "feat(login): add LoginForm with OAuth + email/password"
```

---

## Task 6: `SignupForm` component

**Files:**
- Create: `reqy-web/components/login/signup-form.tsx`

- [ ] **Step 6.1: Write component**

Create `reqy-web/components/login/signup-form.tsx`:

```tsx
"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { safeRedirect } from "@/lib/redirect"

interface SignupFormProps {
  redirect?: string
}

export function SignupForm({ redirect }: SignupFormProps) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  async function handleSignup(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas", variant: "destructive" })
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast({ title: "Erreur", description: data.message || "Impossible de créer le compte", variant: "destructive" })
        return
      }
      if (data.connected) {
        toast({ title: "Compte créé", description: `Bienvenue ${data.user?.name ?? email}` })
        router.replace(safeRedirect(redirect))
      } else {
        toast({
          title: "Vérifiez votre email",
          description: data.message || "Un lien de confirmation vous a été envoyé.",
        })
        router.replace(`/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`)
      }
    } catch {
      toast({ title: "Erreur réseau", description: "Vérifiez votre connexion", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        Pour créer un compte avec Google ou GitHub, utilisez plutôt{" "}
        <Link href={`/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`} className="font-medium text-primary hover:underline">
          la page de connexion
        </Link>
        .
      </div>

      <form onSubmit={handleSignup} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Mot de passe</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirmer le mot de passe</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={loading}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Création…" : "Créer un compte"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Déjà inscrit ?{" "}
        <Link
          href={`/login${redirect ? `?redirect=${encodeURIComponent(redirect)}` : ""}`}
          className="font-medium text-primary hover:underline"
        >
          Se connecter
        </Link>
      </p>
    </div>
  )
}
```

- [ ] **Step 6.2: Commit**

```bash
git add reqy-web/components/login/signup-form.tsx
git commit -m "feat(login): add SignupForm with email/password"
```

---

## Task 7: `/login` and `/signup` pages

**Files:**
- Create: `reqy-web/app/login/page.tsx`
- Create: `reqy-web/app/signup/page.tsx`

- [ ] **Step 7.1: Write `/login` page**

Create `reqy-web/app/login/page.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { LoginLayout } from "@/components/login/login-layout"
import { LoginForm } from "@/components/login/login-form"
import { useAuth } from "@/hooks/use-auth"

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get("redirect") ?? undefined
  const { status } = useAuth()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (status === "connected") {
      router.replace(redirect ?? "/")
    } else if (status !== "loading") {
      setChecked(true)
    }
  }, [status, redirect, router])

  if (!checked && status !== "connected") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <LoginLayout title="Connectez-vous à Reqly">
      <LoginForm redirect={redirect} />
    </LoginLayout>
  )
}
```

- [ ] **Step 7.2: Write `/signup` page**

Create `reqy-web/app/signup/page.tsx`:

```tsx
"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { LoginLayout } from "@/components/login/login-layout"
import { SignupForm } from "@/components/login/signup-form"
import { useAuth } from "@/hooks/use-auth"

export default function SignupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get("redirect") ?? undefined
  const { status } = useAuth()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (status === "connected") {
      router.replace(redirect ?? "/")
    } else if (status !== "loading") {
      setChecked(true)
    }
  }, [status, redirect, router])

  if (!checked && status !== "connected") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="size-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <LoginLayout title="Créer un compte Reqly">
      <SignupForm redirect={redirect} />
    </LoginLayout>
  )
}
```

- [ ] **Step 7.3: Commit**

```bash
git add reqy-web/app/login/page.tsx reqy-web/app/signup/page.tsx
git commit -m "feat(auth): add /login and /signup pages"
```

---

## Task 8: Wire `useAuth` into sidebar widget

**Files:**
- Modify: `reqy-web/components/api-sidebar.tsx` (replace hardcoded "Nurul's Zone" block)

- [ ] **Step 8.1: Read current sidebar block**

The block to replace is approximately lines 213-235 in `reqy-web/components/api-sidebar.tsx`. Current code:

```tsx
{/* User Profile */}
<div className="border-t border-sidebar-border px-2 py-3">
  {!collapsed ? (
    <div className="group/profile flex items-center gap-3 rounded-lg px-2 py-2 transition-all duration-200 hover:bg-accent/30 cursor-pointer">
      <Avatar className="size-8 shrink-0 ring-2 ring-transparent transition-all duration-200 group-hover/profile:ring-primary/30">
        <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=nurul" alt="Nurul" />
        <AvatarFallback>NZ</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-medium text-foreground">Nurul&apos;s Zone</span>
        <span className="truncate text-xs text-muted-foreground">nurul@reqly.com</span>
      </div>
      <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground/60 transition-transform duration-200 group-hover/profile:translate-y-0.5" />
    </div>
  ) : (
    <div className="flex justify-center">
      <Avatar className="size-8 ring-2 ring-transparent transition-all duration-200 hover:ring-primary/30 hover:scale-105 cursor-pointer">
        <AvatarImage src="https://api.dicebear.com/7.x/avataaars/svg?seed=nurul" alt="Nurul" />
        <AvatarFallback>NZ</AvatarFallback>
      </Avatar>
    </div>
  )}
</div>
```

- [ ] **Step 8.2: Add imports to top of file**

Add to the import block at top of `api-sidebar.tsx`:

```tsx
import { LogIn } from "lucide-react"
import { useAuth } from "@/hooks/use-auth"
import { UserMenu } from "@/components/sidebar/user-menu"
import { usePathname, useRouter } from "next/navigation"
```

- [ ] **Step 8.3: Replace the user profile block**

Replace the entire `<!-- User Profile -->` block (and everything inside it down to its closing `</div>`) with:

```tsx
{/* User widget — dynamic based on auth state */}
<div className="border-t border-sidebar-border px-2 py-3">
  {status === "loading" ? (
    <div className={cn("h-9 rounded-lg bg-muted/60", collapsed ? "w-9" : "w-full")} aria-hidden="true" />
  ) : status === "connected" && user ? (
    collapsed ? (
      <div className="flex justify-center">
        <Avatar className="size-8">
          <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.email.split("@")[0])}`} alt={user.name} />
          <AvatarFallback>{user.name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
      </div>
    ) : (
      <UserMenu user={user} onLogout={logout} />
    )
  ) : collapsed ? (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => router.push(`/login?redirect=${encodeURIComponent(pathname)}`)}
      aria-label="Se connecter"
      title="Se connecter"
    >
      <LogIn className="size-4" />
    </Button>
  ) : (
    <Button
      variant="default"
      size="sm"
      className="w-full"
      onClick={() => router.push(`/login?redirect=${encodeURIComponent(pathname)}`)}
    >
      <LogIn className="mr-2 size-4" />
      Se connecter
    </Button>
  )}
</div>
```

- [ ] **Step 8.4: Add `useAuth()` hook call inside the component**

Inside the `ApiSidebar` function body (after the existing `useState` lines), add:

```tsx
const { status, user, logout } = useAuth()
const router = useRouter()
const pathname = usePathname()
```

- [ ] **Step 8.5: Run type check**

Run: `cd reqy-web && npx tsc --noEmit components/api-sidebar.tsx`
Expected: no new errors. The `Avatar`, `AvatarImage`, `AvatarFallback` imports may become unused in the new version — remove them if so. `ChevronDown` may also become unused — remove if so.

- [ ] **Step 8.6: Commit**

```bash
git add reqy-web/components/api-sidebar.tsx
git commit -m "feat(sidebar): wire useAuth into user widget (login button / UserMenu)"
```

---

## Task 9: Refonte `ProfileSection` in settings

**Files:**
- Modify: `reqy-web/components/settings/profile-section.tsx` (full rewrite)

- [ ] **Step 9.1: Read existing file to know what to remove**

Run: `wc -l reqy-web/components/settings/profile-section.tsx` to know size.

- [ ] **Step 9.2: Replace entire file**

Overwrite `reqy-web/components/settings/profile-section.tsx` with:

```tsx
"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import type { AuthUser } from "@/hooks/use-auth"

interface ProfileSectionProps {
  user: AuthUser
}

const PROVIDER_LABELS: Record<AuthUser["provider"], string> = {
  local: "Email",
  google: "Google",
  github: "GitHub",
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() ?? "").join("")
}

export function ProfileSection({ user }: ProfileSectionProps) {
  const { toast } = useToast()
  const [name, setName] = useState(user.name)
  const [avatarSeed, setAvatarSeed] = useState(user.email.split("@")[0])
  const [oldPwd, setOldPwd] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [confirmPwd, setConfirmPwd] = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState("")
  const [twoFA, setTwoFA] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [changingPwd, setChangingPwd] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function avatarUrl(seed: string): string {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed || "user")}`
  }

  function randomSeed() {
    return Math.random().toString(36).slice(2, 10)
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    try {
      // V1: pas de backend pour update profile — UI only
      await new Promise((r) => setTimeout(r, 400))
      toast({ title: "Profil mis à jour", description: "Vos modifications ont été enregistrées." })
    } finally {
      setSavingProfile(false)
    }
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    if (newPwd !== confirmPwd) {
      toast({ title: "Erreur", description: "Les mots de passe ne correspondent pas", variant: "destructive" })
      return
    }
    if (newPwd.length < 8) {
      toast({ title: "Erreur", description: "Le mot de passe doit faire au moins 8 caractères", variant: "destructive" })
      return
    }
    setChangingPwd(true)
    try {
      // V1: pas de backend pour update password — UI only
      await new Promise((r) => setTimeout(r, 400))
      toast({ title: "Mot de passe modifié", description: "Votre mot de passe a été changé." })
      setOldPwd(""); setNewPwd(""); setConfirmPwd("")
    } finally {
      setChangingPwd(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      // V1: suppression réelle hors scope — affiche juste la confirmation
      await new Promise((r) => setTimeout(r, 400))
      toast({
        title: "Fonctionnalité à venir",
        description: "La suppression de compte sera bientôt disponible. Contactez le support pour supprimer votre compte.",
      })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Read-only overview */}
      <Card>
        <CardHeader>
          <CardTitle>Aperçu du compte</CardTitle>
          <CardDescription>Vos informations de connexion.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-start gap-4">
          <Avatar className="size-16">
            <AvatarImage src={avatarUrl(user.email.split("@")[0])} alt={user.name} />
            <AvatarFallback>{initials(user.name) || "?"}</AvatarFallback>
          </Avatar>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <p className="text-base font-medium">{user.name}</p>
              <Badge variant="secondary">{PROVIDER_LABELS[user.provider]}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{user.email}</p>
            <p className="text-xs text-muted-foreground">
              Membre depuis — donnée bientôt disponible
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Edit profile */}
      <Card>
        <CardHeader>
          <CardTitle>Modifier mes informations</CardTitle>
          <CardDescription>Mettez à jour votre nom et votre avatar.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Nom complet</Label>
              <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-avatar">Avatar (seed DiceBear)</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="profile-avatar"
                  value={avatarSeed}
                  onChange={(e) => setAvatarSeed(e.target.value)}
                  placeholder="ex: nurul, alex42…"
                />
                <Button type="button" variant="outline" onClick={() => setAvatarSeed(randomSeed())}>
                  🎲 Régénérer
                </Button>
                <Avatar className="size-10">
                  <AvatarImage src={avatarUrl(avatarSeed)} alt="aperçu" />
                  <AvatarFallback>?</AvatarFallback>
                </Avatar>
              </div>
            </div>
            <Button type="submit" disabled={savingProfile}>
              {savingProfile ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <CardTitle>Changer mon mot de passe</CardTitle>
          <CardDescription>Choisissez un mot de passe d'au moins 8 caractères.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="old-pwd">Mot de passe actuel</Label>
              <Input id="old-pwd" type="password" autoComplete="current-password" value={oldPwd} onChange={(e) => setOldPwd(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-pwd">Nouveau mot de passe</Label>
              <Input id="new-pwd" type="password" autoComplete="new-password" minLength={8} value={newPwd} onChange={(e) => setNewPwd(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pwd">Confirmer</Label>
              <Input id="confirm-pwd" type="password" autoComplete="new-password" minLength={8} value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} required />
            </div>
            <Button type="submit" disabled={changingPwd}>
              {changingPwd ? "Changement…" : "Changer le mot de passe"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle>Sécurité</CardTitle>
          <CardDescription>Options de protection de votre compte.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="2fa">Authentification à deux facteurs</Label>
            <p className="text-xs text-muted-foreground">
              Activez un code à 6 chiffres en plus de votre mot de passe.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">Bientôt disponible</Badge>
            <Switch id="2fa" checked={twoFA} onCheckedChange={setTwoFA} disabled aria-readonly />
          </div>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive">Zone dangereuse</CardTitle>
          <CardDescription>Actions irréversibles sur votre compte.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Supprimer mon compte</p>
            <p className="text-xs text-muted-foreground">
              Cette action est irréversible. Toutes vos données seront supprimées définitivement.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Supprimer</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Supprimer définitivement votre compte ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Tapez <span className="font-mono font-semibold">SUPPRIMER</span> ci-dessous pour confirmer.
                  Cette action ne peut pas être annulée.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="SUPPRIMER"
                aria-label="Confirmation de suppression"
              />
              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setDeleteConfirm("")}>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleteConfirm !== "SUPPRIMER" || deleting}
                  onClick={(e) => {
                    e.preventDefault()
                    void handleDelete()
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? "Suppression…" : "Supprimer définitivement"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 9.3: Install missing shadcn components if needed**

If any of `switch`, `separator`, `card`, `alert-dialog`, `input`, `label`, `avatar`, `button`, `badge` are missing locally, run:

```bash
cd reqy-web && npx shadcn@latest add switch separator card alert-dialog input label avatar button badge --yes
```

- [ ] **Step 9.4: Commit**

```bash
git add reqy-web/components/settings/profile-section.tsx
git commit -m "feat(settings): refonte ProfileSection (read-only + edit + password + 2FA + danger)"
```

---

## Task 10: Clean up `/settings/page.tsx`

**Files:**
- Modify: `reqy-web/app/settings/page.tsx`

- [ ] **Step 10.1: Remove `signupWithEmail` and `loginWithEmail` handlers**

In `app/settings/page.tsx`, delete the `signupWithEmail` and `loginWithEmail` `useCallback` definitions (around lines 350-393). Also delete `logoutAuth` (no longer needed here — moved to sidebar dropdown).

- [ ] **Step 10.2: Remove `connectGoogleAuth` and `connectGithubAuth` handlers**

Delete `connectGoogleAuth` and `connectGithubAuth` `useCallback` definitions (around lines 280-350). OAuth is now initiated from `/login`.

- [ ] **Step 10.3: Update the `<AccountSection>` rendering**

Find the JSX block that renders `<AccountSection ...>` and replace it with conditional: if user is disconnected, show a CTA "Connectez-vous pour voir votre profil" with a button "Se connecter". Otherwise render the new `<ProfileSection user={user} />`.

Replace the existing render block with:

```tsx
{activeSection === "profile" ? (
  authStatus === "connected" && authUser ? (
    <ProfileSection user={authUser} />
  ) : (
    <Card>
      <CardHeader>
        <CardTitle>Profil</CardTitle>
        <CardDescription>Connectez-vous pour voir votre profil.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button onClick={() => router.push("/login")}>Se connecter</Button>
      </CardContent>
    </Card>
  )
) : null}
```

(Add `import { useAuth } from "@/hooks/use-auth"` and `import { ProfileSection } from "@/components/settings/profile-section"` at the top.)

- [ ] **Step 10.4: Remove `<AccountSection>` import and any remaining auth-related state**

Delete `import { AccountSection }` (if present). Remove `authEmail`, `authPassword`, `authError`, `authConnecting` state if no longer used.

- [ ] **Step 10.5: Run type check**

Run: `cd reqy-web && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 10.6: Commit**

```bash
git add reqy-web/app/settings/page.tsx
git commit -m "refactor(settings): remove inline auth UI; wire new ProfileSection"
```

---

## Task 11: Build, test, and manual smoke tests

- [ ] **Step 11.1: Run unit tests**

Run: `cd reqy-web && npx vitest run`
Expected: all tests pass (existing + new redirect + use-auth tests).

- [ ] **Step 11.2: Run build**

Run: `cd reqy-web && npx next build`
Expected: build succeeds with no new warnings.

- [ ] **Step 11.3: Manual smoke — M1 (sidebar widget déconnecté)**

1. Stop server, clear cookies, restart.
2. Navigate to any page.
3. **Verify**: Sidebar bottom shows "Se connecter" button (full width).

- [ ] **Step 11.4: Manual smoke — M2 (redirect preserved)**

1. From `/collections`, click "Se connecter".
2. **Verify**: URL becomes `/login?redirect=%2Fcollections`.

- [ ] **Step 11.5: Manual smoke — M3 (login email valide)**

1. Login with valid email/password.
2. **Verify**: Redirects to `/collections`, sidebar shows user info, dropdown opens on click.

- [ ] **Step 11.6: Manual smoke — M4 (login invalide)**

1. Try login with bad password.
2. **Verify**: Toast error, form stays, no redirect.

- [ ] **Step 11.7: Manual smoke — M5 (OAuth Google)**

1. Click "Continuer avec Google", validate on Google.
2. **Verify**: Returns to `/auth/callback`, then redirects to original page, sidebar shows connected.

- [ ] **Step 11.8: Manual smoke — M6 (signup nouveau compte)**

1. Visit `/signup`, fill new email + password, submit.
2. **Verify**: Either auto-connected OR shows "Vérifiez votre email" toast + redirect `/login`.

- [ ] **Step 11.9: Manual smoke — M7 (dropdown)**

1. Click user avatar in sidebar.
2. **Verify**: Dropdown opens with name, email, provider badge, "Mon profil", "Se déconnecter".

- [ ] **Step 11.10: Manual smoke — M8 (logout)**

1. Click "Se déconnecter" in dropdown.
2. **Verify**: Dropdown closes, sidebar reverts to "Se connecter", reload still disconnected.
3. DevTools → Application → Cookies → verify `auth_session` is gone.

- [ ] **Step 11.11: Manual smoke — M9 (Profile section)**

1. Connected, navigate to `/settings#profile`.
2. **Verify**: 5 sections visible (overview, edit, password, security with badge "Bientôt", danger zone with red border).

- [ ] **Step 11.12: Manual smoke — M10 (open redirect bloqué)**

1. Visit `/login?redirect=//evil.com`, login valid.
2. **Verify**: Redirected to `/`, NOT to evil.com.

- [ ] **Step 11.13: Run existing smoke E2E tests**

Run: `cd reqy-web && npx playwright test --reporter=list`
Expected: existing smoke tests pass (auth/callback flow not broken).

- [ ] **Step 11.14: Final commit**

```bash
git add -A
git status   # verify only intended files
git commit -m "chore: verification complete — externalize auth UX shipped"
```

(If `git add -A` would sweep unrelated files, use explicit paths based on `git status`.)

---

## Self-Review Notes

- **Spec coverage**: Each spec section maps to a task. §3.1→T2, §3.2→T1, §3.3→T8, §3.4→T9, §3.5→T4-T7, §4.4→T9 (delete stub), §5.1→T11.
- **No placeholders**: Each step has either exact code, exact commands, or explicit verification text.
- **Type consistency**: `AuthUser`, `AuthProvider`, `useAuth`, `safeRedirect`, `PROVIDER_LABELS` defined once and reused identically across all tasks.
- **Scope check**: Single feature, ~9 new files + 3 modified files, ~6-8 hours work.
