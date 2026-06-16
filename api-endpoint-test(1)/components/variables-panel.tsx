"use client"

import { useState } from "react"
import { Copy, Check, Eye, EyeOff, Braces } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useRequestStore } from "@/hooks/use-request-store"
import { interpolate } from "@/lib/utils"

export function VariablesPanel() {
  const { environments, activeEnvironmentId } = useRequestStore()
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState("")
  const [showPreview, setShowPreview] = useState(false)

  const activeEnv = environments.find((e) => e.id === activeEnvironmentId)
  const vars = activeEnv?.variables?.filter((v) => v.enabled && v.key.trim()) || []

  const handleCopy = (key: string) => {
    navigator.clipboard.writeText(`{{${key}}}`)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1500)
  }

  const resolved = interpolate(previewUrl || "{{URL}}", vars)
  const hasUnresolved = previewUrl && resolved.includes("{{") && resolved.includes("}}")

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 text-xs font-normal",
            vars.length > 0 && "border-emerald-500/30 text-emerald-600"
          )}
        >
          <Braces className="size-3.5" />
          {vars.length > 0 ? `${vars.length} var` : "Variables"}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[380px] sm:max-w-[380px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Braces className="size-4 text-primary" />
            {activeEnv ? (
              <>
                <span>{activeEnv.name}</span>
                <span className="text-xs font-normal text-muted-foreground">
                  {vars.length} variable{vars.length !== 1 ? "s" : ""}
                </span>
              </>
            ) : (
              "No active environment"
            )}
          </SheetTitle>
        </SheetHeader>

        {activeEnv ? (
          <div className="mt-6 space-y-4">
            {/* URL Preview tool */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">URL Preview</label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => setShowPreview(!showPreview)}
                >
                  {showPreview ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                  {showPreview ? "Hide" : "Test"}
                </Button>
              </div>
              {showPreview && (
                <div className="space-y-2">
                  <Input
                    value={previewUrl}
                    onChange={(e) => setPreviewUrl(e.target.value)}
                    placeholder="{{BASE_URL}}/api/users"
                    className="h-8 font-mono text-xs"
                  />
                  <div className={cn(
                    "rounded-md border px-3 py-2 text-xs font-mono break-all",
                    hasUnresolved
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                  )}>
                    <span className="text-[10px] font-medium uppercase tracking-wider block mb-1">
                      {hasUnresolved ? "⚠ Unresolved" : "✓ Resolved"}
                    </span>
                    {resolved}
                  </div>
                </div>
              )}
            </div>

            {/* Variable list */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 block">
                Available Variables
              </label>
              <div className="space-y-1">
                {vars.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="rounded-full bg-muted/30 p-3 mb-2">
                      <Braces className="size-6 text-muted-foreground/30" />
                    </div>
                    <p className="text-sm font-medium text-foreground">
                      No variables defined
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                      Add variables in the environment settings to use them in your requests
                    </p>
                  </div>
                ) : (
                  vars.map((v) => (
                    <div
                      key={v.key}
                      className="group flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-accent transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <code className="text-xs font-semibold text-primary block truncate">
                          {'{{'}{v.key}{'}}'}
                        </code>
                        <code className="text-xs text-muted-foreground block truncate">
                          {v.value || <span className="italic">empty</span>}
                        </code>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopy(v.key)}
                        className="size-7 p-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        title={`Copy {{${v.key}}}`}
                      >
                        {copiedKey === v.key ? (
                          <Check className="size-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Usage hint */}
            <div className="rounded-lg border bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">How to use</p>
              <p>Type <code className="rounded bg-muted px-1 font-mono text-[10px]">{'{{KEY}}'}</code> in URL, headers, or body to reference a variable.</p>
              <p>It will be replaced with the variable value when the request is sent.</p>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-muted/30 p-3 mb-3">
              <Braces className="size-8 text-muted-foreground/30" />
            </div>
            <p className="text-sm font-medium text-foreground">No active environment</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
              Create an environment and set it active to start using variables in your requests.
            </p>
            <p className="text-xs text-muted-foreground/60 mt-3">
              Click the environment selector in the header to manage environments.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
