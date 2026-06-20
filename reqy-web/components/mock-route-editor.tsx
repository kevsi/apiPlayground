"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectItem, SelectTrigger, SelectValue, SelectContent } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
import { Plus, X } from "lucide-react"
import type { MockRoute, MockRouteRateLimit, MockRouteVariant, HttpMethod } from "@/lib/mock-types"

const HTTP_METHODS: Array<MockRoute["method"]> = ["GET", "POST", "PUT", "PATCH", "DELETE"]

interface HeaderEntry {
  key: string
  value: string
}

export interface MockRouteFormData {
  name: string
  method: HttpMethod
  pathPattern: string
  responseStatus: number
  responseHeaders: Record<string, string>
  responseBody: string
  contentType: string
  delay: number
  enabled: boolean
  rateLimit?: MockRouteRateLimit
  variants?: MockRouteVariant[]
  matchQueryParams?: Record<string, string>
  matchHeaders?: Record<string, string>
}

interface MockRouteEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: MockRouteFormData) => void
  initialData?: MockRoute | null
}

export function MockRouteEditor({ open, onOpenChange, onSave, initialData }: MockRouteEditorProps) {
  const [name, setName] = useState("")
  const [method, setMethod] = useState<MockRoute["method"]>("GET")
  const [pathPattern, setPathPattern] = useState("")
  const [responseStatus, setResponseStatus] = useState("200")
  const [contentType, setContentType] = useState("application/json")
  const [responseBody, setResponseBody] = useState("")
  const [delay, setDelay] = useState("0")
  const [enabled, setEnabled] = useState(true)

  // Custom headers (excluding content-type which is handled separately)
  const [customHeaders, setCustomHeaders] = useState<HeaderEntry[]>([])

  // Rate limiting
  const [rateLimitEnabled, setRateLimitEnabled] = useState(false)
  const [rateLimitMax, setRateLimitMax] = useState("10")
  const [rateLimitWindow, setRateLimitWindow] = useState("60")

  // Variants (scenarios)
  interface VariantEntry {
    id: string
    name: string
    weight: string
    status: string
    body: string
    contentType: string
    delay: string
  }
  const [variants, setVariants] = useState<VariantEntry[]>([])

  // Match conditions
  const [matchQueryEntries, setMatchQueryEntries] = useState<HeaderEntry[]>([])
  const [matchHeaderEntries, setMatchHeaderEntries] = useState<HeaderEntry[]>([])

  // parse headers from stored data into editable entries
  // parse headers from stored data into editable entries
  useEffect(() => {
    if (!open) return
    const updateTimeout = window.setTimeout(() => {
      setName(initialData?.name ?? "")
      setMethod(initialData?.method ?? "GET")
      setPathPattern(initialData?.pathPattern ?? "")
      setResponseStatus(String(initialData?.responseStatus ?? 200))
      setContentType(initialData?.contentType ?? "application/json")
      setResponseBody(initialData?.responseBody ?? "")
      setDelay(String(initialData?.delay ?? 0))
      setEnabled(initialData?.enabled ?? true)

      // Rate limit
      setRateLimitEnabled(initialData?.rateLimit?.enabled ?? false)
      setRateLimitMax(String(initialData?.rateLimit?.maxRequests ?? 10))
      setRateLimitWindow(String(initialData?.rateLimit?.windowSeconds ?? 60))

      // Variants
      if (initialData?.variants && initialData.variants.length > 0) {
        setVariants(
          initialData.variants.map((v) => ({
            id: v.id,
            name: v.name,
            weight: String(v.weight),
            status: String(v.responseStatus),
            body: v.responseBody,
            contentType: v.contentType,
            delay: String(v.delay),
          }))
        )
      } else {
        setVariants([])
      }

      // Parse headers: exclude content-type (managed separately), keep others
      if (initialData?.responseHeaders) {
        const entries: HeaderEntry[] = Object.entries(initialData.responseHeaders)
          .filter(([k]) => k.toLowerCase() !== "content-type")
          .map(([key, value]) => ({ key, value }))
        setCustomHeaders(entries)
      } else {
        setCustomHeaders([])
      }

      // Match conditions
      if (initialData?.matchQueryParams) {
        setMatchQueryEntries(
          Object.entries(initialData.matchQueryParams).map(([key, value]) => ({ key, value }))
        )
      } else {
        setMatchQueryEntries([])
      }

      if (initialData?.matchHeaders) {
        setMatchHeaderEntries(
          Object.entries(initialData.matchHeaders).map(([key, value]) => ({ key, value }))
        )
      } else {
        setMatchHeaderEntries([])
      }
    }, 0)

    return () => window.clearTimeout(updateTimeout)
  }, [open, initialData])

  const updateVariant = (index: number, field: keyof VariantEntry, val: string) => {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: val } : v)))
  }

  const removeVariant = (index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index))
  }

  const addVariant = () => {
    const id = `var-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setVariants((prev) => [
      ...prev,
      { id, name: `Variant ${prev.length + 1}`, weight: "1", status: "200", body: "", contentType: "application/json", delay: "0" },
    ])
  }

  const addHeader = () => setCustomHeaders((prev) => [...prev, { key: "", value: "" }])

  const updateHeader = (index: number, field: keyof HeaderEntry, val: string) => {
    setCustomHeaders((prev) => prev.map((h, i) => (i === index ? { ...h, [field]: val } : h)))
  }

  const removeHeader = (index: number) => setCustomHeaders((prev) => prev.filter((_, i) => i !== index))

  const addMatchQueryEntry = () => setMatchQueryEntries((prev) => [...prev, { key: "", value: "" }])

  const updateMatchQueryEntry = (index: number, field: keyof HeaderEntry, val: string) => {
    setMatchQueryEntries((prev) => prev.map((h, i) => (i === index ? { ...h, [field]: val } : h)))
  }

  const removeMatchQueryEntry = (index: number) => setMatchQueryEntries((prev) => prev.filter((_, i) => i !== index))

  const addMatchHeaderEntry = () => setMatchHeaderEntries((prev) => [...prev, { key: "", value: "" }])

  const updateMatchHeaderEntry = (index: number, field: keyof HeaderEntry, val: string) => {
    setMatchHeaderEntries((prev) => prev.map((h, i) => (i === index ? { ...h, [field]: val } : h)))
  }

  const removeMatchHeaderEntry = (index: number) => setMatchHeaderEntries((prev) => prev.filter((_, i) => i !== index))

  const handleSave = () => {
    const status = parseInt(responseStatus, 10)
    if (!name.trim() || !pathPattern.trim()) return
    if (isNaN(status) || status < 100 || status > 599) return

    // Build responseHeaders from content-type + custom headers
    const headers: Record<string, string> = { "content-type": contentType }
    for (const h of customHeaders) {
      if (h.key.trim()) {
        headers[h.key.trim()] = h.value
      }
    }

    // Build rate limit config
    const rateLimit: MockRouteRateLimit | undefined = rateLimitEnabled
      ? { enabled: true, maxRequests: Math.max(1, parseInt(rateLimitMax, 10) || 10), windowSeconds: Math.max(1, parseInt(rateLimitWindow, 10) || 60) }
      : undefined

    // Build variants
    const parsedVariants: MockRouteVariant[] | undefined = variants.length > 0
      ? variants.map((v) => ({
          id: v.id,
          name: v.name || `Variant ${variants.indexOf(v) + 1}`,
          weight: Math.max(1, parseInt(v.weight, 10) || 1),
          responseStatus: Math.max(100, Math.min(599, parseInt(v.status, 10) || 200)),
          responseHeaders: { "content-type": v.contentType },
          responseBody: v.body,
          contentType: v.contentType || "application/json",
          delay: Math.max(0, parseInt(v.delay, 10) || 0),
        }))
      : undefined

    // Build match conditions
    const matchQP: Record<string, string> | undefined = matchQueryEntries.length > 0
      ? Object.fromEntries(
          matchQueryEntries.filter((e) => e.key.trim()).map((e) => [e.key.trim(), e.value])
        )
      : undefined
    const matchHdrs: Record<string, string> | undefined = matchHeaderEntries.length > 0
      ? Object.fromEntries(
          matchHeaderEntries.filter((e) => e.key.trim()).map((e) => [e.key.trim(), e.value])
        )
      : undefined

    onSave({
      name: name.trim(),
      method,
      pathPattern: pathPattern.trim(),
      responseStatus: status,
      responseHeaders: headers,
      responseBody,
      contentType,
      delay: Math.max(0, parseInt(delay, 10) || 0),
      enabled,
      rateLimit,
      variants: parsedVariants,
      matchQueryParams: matchQP,
      matchHeaders: matchHdrs,
    })
  }

  const isValid = name.trim() && pathPattern.trim() && !isNaN(parseInt(responseStatus, 10))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialData ? "Modifier la route mock" : "Nouvelle route mock"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="general">Général</TabsTrigger>
            <TabsTrigger value="response">Réponse</TabsTrigger>
            <TabsTrigger value="conditions">Conditions</TabsTrigger>
            <TabsTrigger value="scenarios">Scénarios</TabsTrigger>
            <TabsTrigger value="security">Avancé</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 py-4 focus-visible:outline-none focus-visible:ring-0">
            {/* Name */}
            <div className="grid gap-2">
              <Label htmlFor="mock-name">Nom</Label>
              <Input
                id="mock-name"
                placeholder="Users list"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Method */}
              <div className="grid gap-2">
                <Label htmlFor="mock-method">Méthode</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as MockRoute["method"])}>
                  <SelectTrigger id="mock-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HTTP_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Path pattern */}
              <div className="grid gap-2">
                <Label htmlFor="mock-path">Chemin</Label>
                <Input
                  id="mock-path"
                  placeholder="/api/users/:id"
                  value={pathPattern}
                  onChange={(e) => setPathPattern(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Status */}
              <div className="grid gap-2">
                <Label htmlFor="mock-status">Status code par défaut</Label>
                <Input
                  id="mock-status"
                  placeholder="200"
                  value={responseStatus}
                  onChange={(e) => setResponseStatus(e.target.value.replace(/\D/g, "").slice(0, 3))}
                />
              </div>

              {/* Delay */}
              <div className="grid gap-2">
                <Label htmlFor="mock-delay">Délai simulé (ms)</Label>
                <Input
                  id="mock-delay"
                  type="number"
                  min={0}
                  max={30000}
                  placeholder="0"
                  value={delay}
                  onChange={(e) => setDelay(e.target.value.replace(/\D/g, ""))}
                />
              </div>
            </div>

            {/* Enabled */}
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="mock-enabled"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="size-4 rounded border-border"
              />
              <Label htmlFor="mock-enabled" className="cursor-pointer">Activer cette route</Label>
            </div>
          </TabsContent>

          <TabsContent value="response" className="space-y-4 py-4 focus-visible:outline-none focus-visible:ring-0">
            {/* Content type */}
            <div className="grid gap-2">
              <Label htmlFor="mock-content-type">Content-Type par défaut</Label>
              <Select value={contentType} onValueChange={setContentType}>
                <SelectTrigger id="mock-content-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="application/json">application/json</SelectItem>
                  <SelectItem value="text/plain">text/plain</SelectItem>
                  <SelectItem value="text/html">text/html</SelectItem>
                  <SelectItem value="application/xml">application/xml</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Response body */}
            <div className="grid gap-2">
              <Label htmlFor="mock-body">Corps de la réponse par défaut</Label>
              <Textarea
                id="mock-body"
                placeholder='{ "message": "Hello" }'
                value={responseBody}
                onChange={(e) => setResponseBody(e.target.value)}
                className="min-h-[180px] font-mono text-xs"
              />
            </div>

            {/* Custom headers */}
            <div className="grid gap-3 pt-4 border-t">
              <div className="flex items-center justify-between">
                <Label>En-têtes personnalisés</Label>
                <Button type="button" variant="outline" size="sm" onClick={addHeader} className="h-7 gap-1 text-xs">
                  <Plus className="size-3" />
                  Ajouter
                </Button>
              </div>
              {customHeaders.length === 0 && (
                <p className="text-xs text-muted-foreground">Aucun en-tête supplémentaire.</p>
              )}
              {customHeaders.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Nom de l'en-tête"
                    value={h.key}
                    onChange={(e) => updateHeader(i, "key", e.target.value)}
                    className="flex-1 font-mono text-xs"
                  />
                  <span className="text-muted-foreground shrink-0">:</span>
                  <Input
                    placeholder="Valeur"
                    value={h.value}
                    onChange={(e) => updateHeader(i, "value", e.target.value)}
                    className="flex-1 font-mono text-xs"
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeHeader(i)} className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-red-600">
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="conditions" className="space-y-6 py-4 focus-visible:outline-none focus-visible:ring-0">
            {/* Match query params */}
            <div className="grid gap-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <Label className="font-medium">Paramètres d&apos;URL requis</Label>
                <Button type="button" variant="outline" size="sm" onClick={addMatchQueryEntry} className="h-7 gap-1 text-xs">
                  <Plus className="size-3" />
                  Ajouter
                </Button>
              </div>
              {matchQueryEntries.length === 0 && (
                <p className="text-xs text-muted-foreground">Aucune condition sur l&apos;URL.</p>
              )}
              {matchQueryEntries.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="Paramètre" value={e.key} onChange={(v) => updateMatchQueryEntry(i, "key", v.target.value)} className="flex-1 font-mono text-xs" />
                  <span className="text-muted-foreground shrink-0">=</span>
                  <Input placeholder="Valeur (ou *)" value={e.value} onChange={(v) => updateMatchQueryEntry(i, "value", v.target.value)} className="flex-1 font-mono text-xs" />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeMatchQueryEntry(i)} className="h-8 w-8 p-0 shrink-0 hover:text-red-600">
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Match headers */}
            <div className="grid gap-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <Label className="font-medium">En-têtes HTTP requis</Label>
                <Button type="button" variant="outline" size="sm" onClick={addMatchHeaderEntry} className="h-7 gap-1 text-xs">
                  <Plus className="size-3" />
                  Ajouter
                </Button>
              </div>
              {matchHeaderEntries.length === 0 && (
                <p className="text-xs text-muted-foreground">Aucune condition sur les en-têtes.</p>
              )}
              {matchHeaderEntries.map((e, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="En-tête" value={e.key} onChange={(v) => updateMatchHeaderEntry(i, "key", v.target.value)} className="flex-1 font-mono text-xs" />
                  <span className="text-muted-foreground shrink-0">:</span>
                  <Input placeholder="Valeur (ou *)" value={e.value} onChange={(v) => updateMatchHeaderEntry(i, "value", v.target.value)} className="flex-1 font-mono text-xs" />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeMatchHeaderEntry(i)} className="h-8 w-8 p-0 shrink-0 hover:text-red-600">
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="scenarios" className="space-y-4 py-4 focus-visible:outline-none focus-visible:ring-0">
            <div className="flex items-center justify-between">
              <Label className="font-medium">Variantes dynamiques</Label>
              <Button type="button" variant="outline" size="sm" onClick={addVariant} className="h-7 gap-1 text-xs">
                <Plus className="size-3" />
                Ajouter une variante
              </Button>
            </div>
            {variants.length === 0 ? (
              <div className="text-center py-8 rounded-lg border border-dashed border-border bg-muted/20">
                <p className="text-sm text-muted-foreground">Aucune variante.</p>
                <p className="text-xs text-muted-foreground mt-1">La réponse par défaut sera toujours utilisée.</p>
              </div>
            ) : (
              <div className="grid gap-3">
                {variants.map((v, i) => (
                  <div key={v.id} className="grid gap-3 rounded-lg border bg-muted/30 p-3 relative group">
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeVariant(i)} className="absolute top-2 right-2 h-6 w-6 p-0 text-muted-foreground hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      <X className="size-3.5" />
                    </Button>
                    <div className="grid grid-cols-4 gap-2 pr-6">
                      <div className="grid gap-1 col-span-2">
                        <Label className="text-[10px] text-muted-foreground">Nom</Label>
                        <Input value={v.name} onChange={(e) => updateVariant(i, "name", e.target.value)} className="h-7 text-xs" />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[10px] text-muted-foreground">Poids</Label>
                        <Input type="number" min={1} value={v.weight} onChange={(e) => updateVariant(i, "weight", e.target.value.replace(/\D/g, ""))} className="h-7 text-xs" />
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[10px] text-muted-foreground">Status</Label>
                        <Input type="number" min={100} max={599} value={v.status} onChange={(e) => updateVariant(i, "status", e.target.value.replace(/\D/g, "").slice(0, 3))} className="h-7 text-xs" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-1">
                        <Label className="text-[10px] text-muted-foreground">Content-Type</Label>
                        <select value={v.contentType} onChange={(e) => updateVariant(i, "contentType", e.target.value)} className="h-7 rounded-md border border-input bg-background px-2 text-xs">
                          <option value="application/json">application/json</option>
                          <option value="text/plain">text/plain</option>
                          <option value="text/html">text/html</option>
                        </select>
                      </div>
                      <div className="grid gap-1">
                        <Label className="text-[10px] text-muted-foreground">Délai (ms)</Label>
                        <Input type="number" min={0} value={v.delay} onChange={(e) => updateVariant(i, "delay", e.target.value.replace(/\D/g, ""))} className="h-7 text-xs" />
                      </div>
                    </div>
                    <div className="grid gap-1">
                      <Label className="text-[10px] text-muted-foreground">Corps de la réponse</Label>
                      <textarea value={v.body} onChange={(e) => updateVariant(i, "body", e.target.value)} className="min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-xs font-mono resize-y" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="security" className="space-y-4 py-4 focus-visible:outline-none focus-visible:ring-0">
            <div className="grid gap-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="font-medium text-base">Rate limiting</Label>
                  <p className="text-xs text-muted-foreground mt-1">Limitez le nombre de requêtes pour simuler des quotas.</p>
                </div>
                <Switch
                  checked={rateLimitEnabled}
                  onCheckedChange={setRateLimitEnabled}
                  className="data-[state=checked]:bg-emerald-500"
                />
              </div>
              
              {rateLimitEnabled && (
                <div className="grid grid-cols-2 gap-4 mt-2 pt-4 border-t">
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Requêtes max</Label>
                    <Input
                      type="number"
                      min={1}
                      value={rateLimitMax}
                      onChange={(e) => setRateLimitMax(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">Fenêtre (secondes)</Label>
                    <Input
                      type="number"
                      min={1}
                      value={rateLimitWindow}
                      onChange={(e) => setRateLimitWindow(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={handleSave} disabled={!isValid}>
            {initialData ? "Enregistrer" : "Créer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
