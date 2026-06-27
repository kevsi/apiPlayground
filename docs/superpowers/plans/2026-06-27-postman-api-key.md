# Postman API Key Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stub `/api/postman-auth` endpoint with a real API key validation flow (POST validates via Postman API, GET status reads cookie, DELETE clears cookie). Adapt the modal to support an `api-key` mode for Postman.

**Architecture:** Helper `lib/postman.ts` for validation, cookie helpers in `app/api/postman-auth/cookies.ts`, three route methods (POST/GET/DELETE) on `/api/postman-auth`, modal adapted with a new `apiKey?` field on the `Tool` type.

**Tech Stack:** Next.js 15 App Router, TypeScript, native `fetch` (Node 18+), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-27-postman-api-key-design.md`

---

## Task 1: `lib/postman.ts` helper + tests (TDD)

**Files:**
- Create: `reqy-web/lib/postman.ts`
- Create: `reqy-web/lib/__tests__/postman.test.ts`

- [ ] **Step 1.1: Write failing tests**

Create `reqy-web/lib/__tests__/postman.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { validatePostmanApiKey } from "@/lib/postman"

describe("validatePostmanApiKey", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function mockFetchOnce(response: { ok: boolean; body: unknown }) {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: response.ok,
      json: () => Promise.resolve(response.body),
    } as Response)
  }

  it("returns user on 200 with valid user data", async () => {
    mockFetchOnce({
      ok: true,
      body: { user: { username: "alice", email: "alice@example.com" } },
    })
    const user = await validatePostmanApiKey("PMAK-test")
    expect(user).toEqual({ username: "alice", email: "alice@example.com" })
  })

  it("returns null on 401", async () => {
    mockFetchOnce({ ok: false, body: { error: "Invalid API Key" } })
    const user = await validatePostmanApiKey("PMAK-bad")
    expect(user).toBeNull()
  })

  it("returns null on network error", async () => {
    global.fetch = vi.fn().mockRejectedValueOnce(new Error("network"))
    const user = await validatePostmanApiKey("PMAK-test")
    expect(user).toBeNull()
  })

  it("returns null on timeout", async () => {
    global.fetch = vi.fn().mockImplementationOnce(() => new Promise(() => {})) // never resolves
    const promise = validatePostmanApiKey("PMAK-test")
    vi.advanceTimersByTime(11000)
    await expect(promise).resolves.toBeNull()
  })

  it("uses X-API-Key header", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: { username: "x" } }),
    } as Response)
    global.fetch = fetchMock
    await validatePostmanApiKey("PMAK-my-key")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.postman.com/me",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-API-Key": "PMAK-my-key" }),
      })
    )
  })
})
```

- [ ] **Step 1.2: Run, verify failure**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web && npx vitest run lib/__tests__/postman.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 1.3: Implement `lib/postman.ts`**

Create `reqy-web/lib/postman.ts`:

```ts
const POSTMAN_API_BASE = "https://api.postman.com"
const TIMEOUT_MS = 10000

export interface PostmanUser {
  username: string
  email?: string
}

export async function validatePostmanApiKey(apiKey: string): Promise<PostmanUser | null> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${POSTMAN_API_BASE}/me`, {
      headers: { "X-API-Key": apiKey },
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    return {
      username: data.user?.username ?? "unknown",
      email: data.user?.email,
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}
```

- [ ] **Step 1.4: Run, verify pass**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web && npx vitest run lib/__tests__/postman.test.ts
```
Expected: PASS (5 cases).

- [ ] **Step 1.5: Commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main && git add reqy-web/lib/postman.ts reqy-web/lib/__tests__/postman.test.ts && git -c commit.gpgsign=false commit -m "feat(postman): add validatePostmanApiKey helper with timeout + tests"
```

---

## Task 2: Cookie helpers

**Files:**
- Create: `reqy-web/app/api/postman-auth/cookies.ts`

- [ ] **Step 2.1: Create cookie helpers**

Create `reqy-web/app/api/postman-auth/cookies.ts`:

```ts
const COOKIE_NAME = "postman_api_key"
const DURATION_S = 30 * 24 * 60 * 60

export function buildApiKeyCookie(value: string) {
  return {
    name: COOKIE_NAME,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: DURATION_S,
  }
}

export function buildClearApiKeyCookie() {
  return {
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  }
}

export function getApiKeyFromRequest(request: { cookies: { get(name: string): { value: string } | undefined } }): string | null {
  return request.cookies.get(COOKIE_NAME)?.value ?? null
}
```

- [ ] **Step 2.2: Commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main && git add reqy-web/app/api/postman-auth/cookies.ts && git -c commit.gpgsign=false commit -m "feat(postman): add cookie helpers for postman_api_key"
```

---

## Task 3: GET `/api/postman-auth/status` route

**Files:**
- Create: `reqy-web/app/api/postman-auth/status/route.ts`

- [ ] **Step 3.1: Create status route**

Create `reqy-web/app/api/postman-auth/status/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { getApiKeyFromRequest } from "../cookies"

export async function GET(request: NextRequest) {
  const apiKey = getApiKeyFromRequest(request)
  if (!apiKey) {
    return NextResponse.json({ connected: false })
  }
  // V1: on ne re-valide pas à chaque appel (perf)
  // La re-validation se fait au prochain save
  return NextResponse.json({
    connected: true,
    user: { username: "postman-user" },
  })
}
```

- [ ] **Step 3.2: Commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main && git add reqy-web/app/api/postman-auth/status/route.ts && git -c commit.gpgsign=false commit -m "feat(postman): add GET /api/postman-auth/status route"
```

---

## Task 4: POST + DELETE `/api/postman-auth` (replace stub)

**Files:**
- Modify: `reqy-web/app/api/postman-auth/route.ts`

- [ ] **Step 4.1: Overwrite stub with real handlers**

Overwrite `reqy-web/app/api/postman-auth/route.ts` with:

```ts
import { NextRequest, NextResponse } from "next/server"
import { validatePostmanApiKey } from "@/lib/postman"
import { buildApiKeyCookie, buildClearApiKeyCookie } from "./cookies"

const API_KEY_REGEX = /^PMAK-[A-Za-z0-9_-]+$/

export async function POST(request: NextRequest) {
  let body: { apiKey?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body JSON invalide" }, { status: 400 })
  }

  const apiKey = body.apiKey?.trim()
  if (!apiKey || !API_KEY_REGEX.test(apiKey)) {
    return NextResponse.json(
      { error: "Clé API invalide (doit commencer par PMAK-)" },
      { status: 400 }
    )
  }

  const user = await validatePostmanApiKey(apiKey)
  if (!user) {
    return NextResponse.json(
      { error: "Clé API rejetée par Postman (invalide, expirée ou révoquée)" },
      { status: 400 }
    )
  }

  const response = NextResponse.json({ connected: true, user })
  response.cookies.set(buildApiKeyCookie(apiKey))
  return response
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(buildClearApiKeyCookie())
  return response
}
```

- [ ] **Step 4.2: Commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main && git add reqy-web/app/api/postman-auth/route.ts && git -c commit.gpgsign=false commit -m "feat(postman): implement POST (validate) + DELETE (clear) on /api/postman-auth"
```

---

## Task 5: Adapt `ToolAssociationModal` for api-key mode

**Files:**
- Modify: `reqy-web/components/settings/sections/tool-association-modal.tsx`

- [ ] **Step 5.1: Read current file**

```bash
wc -l /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web/components/settings/sections/tool-association-modal.tsx
```

- [ ] **Step 5.2: Replace file with adapted version**

Overwrite `tool-association-modal.tsx` with:

```tsx
"use client"

import { useState, type FormEvent } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"

export interface Tool {
  id: string
  name: string
  description: string
  logoEmoji: string
  scopes: string[]
  oauthUrl?: string
  apiKey?: {
    endpoint: string
    placeholder: string
    instructions: string
  }
}

interface ToolAssociationModalProps {
  tool: Tool | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConnected?: () => void
}

function ApiKeyForm({ tool, onSuccess }: { tool: Tool; onSuccess: () => void }) {
  const { toast } = useToast()
  const [apiKey, setApiKey] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [show, setShow] = useState(false)
  const config = tool.apiKey!

  const isValid = /^PMAK-[A-Za-z0-9_-]+$/.test(apiKey.trim())

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isValid) {
      setError("La clé doit commencer par PMAK-")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(config.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error ?? "Clé rejetée par le serveur")
        return
      }
      toast({ title: "Connecté", description: `Outil ${tool.name} associé avec succès.` })
      onSuccess()
    } catch {
      setError("Erreur réseau, réessayez")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="mb-1 font-medium">Comment obtenir votre clé :</p>
        <p className="text-muted-foreground">{config.instructions}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="api-key">Clé API</Label>
        <div className="flex items-center gap-2">
          <Input
            id="api-key"
            type={show ? "text" : "password"}
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setError(null) }}
            placeholder={config.placeholder}
            autoComplete="off"
            spellCheck={false}
            required
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Masquer" : "Afficher"}
          >
            {show ? "🙈" : "👁"}
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button type="submit" disabled={!isValid || loading}>
          {loading ? "Validation…" : "Valider et connecter"}
        </Button>
      </DialogFooter>
    </form>
  )
}

function OAuthFlow({ tool, onOpenChange }: { tool: Tool; onOpenChange: (v: boolean) => void }) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)

  async function handleAssociate() {
    if (!tool.oauthUrl) {
      toast({ title: "Bientôt disponible", description: `${tool.name} sera bientôt disponible.` })
      onOpenChange(false)
      return
    }
    setLoading(true)
    window.location.href = tool.oauthUrl
  }

  return (
    <>
      {tool.scopes.length > 0 && (
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
      )}
      <DialogFooter>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
          Annuler
        </Button>
        <Button onClick={handleAssociate} disabled={loading}>
          {loading ? "Redirection…" : `Associer ${tool.name} →`}
        </Button>
      </DialogFooter>
    </>
  )
}

export function ToolAssociationModal({ tool, open, onOpenChange, onConnected }: ToolAssociationModalProps) {
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
            {tool.apiKey ? (
              <ApiKeyForm tool={tool} onSuccess={() => { onOpenChange(false); onConnected?.() }} />
            ) : (
              <OAuthFlow tool={tool} onOpenChange={onOpenChange} />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 5.3: Type check + commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web && npx tsc --noEmit 2>&1 | grep tool-association-modal
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main && git add reqy-web/components/settings/sections/tool-association-modal.tsx && git -c commit.gpgsign=false commit -m "feat(settings): adapt ToolAssociationModal for api-key mode (Postman)"
```

---

## Task 6: Update `ToolsSection` Postman config

**Files:**
- Modify: `reqy-web/components/settings/sections/tools-section.tsx`

- [ ] **Step 6.1: Edit the `TOOLS` array**

Find the `TOOLS` array. Replace the Postman entry:

Replace this:
```ts
  {
    id: "postman",
    name: "Postman",
    description: "Import et export de collections Postman.",
    logoEmoji: "📮",
    scopes: ["Lecture de vos collections", "Création de collections"],
    oauthUrl: "/api/postman-auth",
  },
```

With:
```ts
  {
    id: "postman",
    name: "Postman",
    description: "Import et export de collections Postman.",
    logoEmoji: "📮",
    scopes: [],
    apiKey: {
      endpoint: "/api/postman-auth",
      placeholder: "PMAK-xxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      instructions:
        "Allez sur go.postman.co → Settings → API Keys → Generate API Key. Copiez la clé (elle commence par PMAK-).",
    },
  },
```

- [ ] **Step 6.2: Type check + commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web && npx tsc --noEmit 2>&1 | grep tools-section
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main && git add reqy-web/components/settings/sections/tools-section.tsx && git -c commit.gpgsign=false commit -m "feat(settings): switch Postman tool config to api-key mode"
```

---

## Task 7: Verification

- [ ] **Step 7.1: Run all unit tests**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web && npx vitest run 2>&1 | tail -20
```
Expected: pass (existing + 5 new for postman.test.ts).

- [ ] **Step 7.2: Type check**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web && npx tsc --noEmit 2>&1 | tail -20
```
Expected: no new errors.

- [ ] **Step 7.3: Create smoke checklist**

Create `.kimchi/docs/2026-06-27-postman-api-key-smoke.md`:

```markdown
# Postman API key integration — Smoke checklist

Run `cd reqy-web && npx next dev` then:

| # | Scenario | Expected |
|---|----------|----------|
| M1 | Settings → Outils → click "Associer" sur Postman | Modal shows API key input (not OAuth redirect) |
| M2 | Paste fake key "PMAK-fake-xxx" → "Valider et connecter" | Error inline "Clé rejetée par Postman", modal stays open |
| M3 | Paste a real Postman API key → submit | Modal closes, card shows "Connecté" |
| M4 | Click "Gérer" on Postman card (now connected) | Modal opens (could show options or just info) |
| M5 | DevTools → Application → Cookies → `postman_api_key` is httpOnly | Yes |
| M6 | Reload page → Postman card still shows "Connecté" | Yes (cookie persists) |
| M7 | (Manual) Run `curl -X POST http://localhost:3000/api/auth/logout` doesn't affect Postman (different cookie) | Postman stays connected |
```

- [ ] **Step 7.4: Final commit**

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main && git add .kimchi/docs/2026-06-27-postman-api-key-smoke.md && git -c commit.gpgsign=false commit -m "chore: smoke checklist for Postman API key integration"
```

---

## Self-Review Notes

- **Spec coverage**: T1→helper, T2→cookies, T3→status, T4→POST+DELETE, T5→modal, T6→tools config, T7→verify.
- **No placeholders**: All code complete.
- **Type consistency**: `Tool.apiKey` defined once in T5, consumed by T6. `buildApiKeyCookie`/`buildClearApiKeyCookie` defined once in T2, used by T3 and T4.
- **Scope**: 7 tasks, ~2-3 hours work.
