"use client"

import { useCallback, useRef, useState } from "react"
import { Upload, Download, FileJson, X, AlertTriangle, CheckCircle2, Loader2, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { useRequestStore, type Collection, type Environment, type VariableMapping } from "@/hooks/use-request-store"
import { exportBundleSchema, formatZodError } from "@/lib/import-schemas"

/* ─────────────────────────────────────────────────────────────────────
   Types
───────────────────────────────────────────────────────────────────── */
interface ExportBundle {
  version: "1.0"
  exportedAt: string
  collections: Collection[]
  environments: Environment[]
  variableMappings: VariableMapping[]
}

type ConflictStrategy = "keep" | "overwrite" | "rename"

interface Conflict {
  type: "collection" | "environment"
  name: string
  existingId: string
  incomingId: string
}

/* ─────────────────────────────────────────────────────────────────────
   Export helpers
───────────────────────────────────────────────────────────────────── */
function buildBundle(collections: Collection[], environments: Environment[], variableMappings: VariableMapping[]): ExportBundle {
  return {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    collections,
    environments,
    variableMappings,
  }
}

function downloadJson(data: object, filename: string) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/* ─────────────────────────────────────────────────────────────────────
   Component
───────────────────────────────────────────────────────────────────── */
interface ImportExportModalProps {
  open: boolean
  onClose: () => void
}

export function ImportExportModal({ open, onClose }: ImportExportModalProps) {
  const { collections, environments, variableMappings, addCollection, addEnvironment, updateCollection, updateEnvironment, addRequestToCollection, addVariableMapping, updateVariableMapping } =
    useRequestStore()

  /* drag state */
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    added: number
    updated: number
    skipped: number
    errors: string[]
  } | null>(null)
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [pendingBundle, setPendingBundle] = useState<ExportBundle | null>(null)
  const [conflictStrategy, setConflictStrategy] = useState<ConflictStrategy>("rename")
  const fileInputRef = useRef<HTMLInputElement>(null)

  /* ── Export ──────────────────────────────────────────────────────── */
  const handleExport = () => {
    const bundle = buildBundle(collections, environments, variableMappings)
    const date = new Date().toISOString().slice(0, 10)
    downloadJson(bundle, `reqly-backup-${date}.json`)
  }

  /* ── Parse & detect conflicts ────────────────────────────────────── */
  const parseBundle = (raw: string): { bundle: ExportBundle | null; error?: string } => {
    try {
      const parsed = JSON.parse(raw)
      const result = exportBundleSchema.safeParse(parsed)
      if (!result.success) {
        return { bundle: null, error: formatZodError(result.error) }
      }
      return {
        bundle: {
          version: (result.data.version as ExportBundle["version"]) || "1.0",
          exportedAt: result.data.exportedAt || new Date().toISOString(),
          collections: result.data.collections as Collection[],
          environments: result.data.environments as Environment[],
          variableMappings: (result.data.variableMappings || []) as VariableMapping[],
        },
      }
    } catch {
      return { bundle: null, error: "Fichier JSON invalide." }
    }
  }

  const detectConflicts = useCallback((bundle: ExportBundle): Conflict[] => {
    const found: Conflict[] = []
    bundle.collections.forEach((incoming) => {
      const existing = collections.find((c) => c.name === incoming.name || c.id === incoming.id)
      if (existing) found.push({ type: "collection", name: incoming.name, existingId: existing.id, incomingId: incoming.id })
    })
    bundle.environments.forEach((incoming) => {
      const existing = environments.find((e) => e.name === incoming.name || e.id === incoming.id)
      if (existing) found.push({ type: "environment", name: incoming.name, existingId: existing.id, incomingId: incoming.id })
    })
    return found
  }, [collections, environments])

  const areRequestsEquivalent = useCallback(
    (a: { name: string; url: string; endpoint: string; method: string }, b: { name: string; url: string; endpoint: string; method: string }) =>
      a.name === b.name &&
      (a.url === b.url || a.endpoint === b.endpoint) &&
      a.method === b.method,
    [],
  )

  /* ── Apply import ────────────────────────────────────────────────── */
  const applyImport = useCallback(
    async (bundle: ExportBundle, strategy: ConflictStrategy) => {
      setImporting(true)
      let added = 0
      let updated = 0
      let skipped = 0
      const errors: string[] = []

      try {
        /* Collections */
        for (const incoming of bundle.collections) {
          const existing = collections.find((c) => c.name === incoming.name || c.id === incoming.id)
          if (!existing) {
            const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = incoming as any
            const newCollectionId = addCollection(rest)
            if (incoming.requests?.length) {
              incoming.requests.forEach((req) => addRequestToCollection(newCollectionId, req))
            }
            added++
          } else {
            if (strategy === "keep") {
              const newRequests = (incoming.requests || []).filter(
                (req) => !existing.requests.some((existingReq) => areRequestsEquivalent(existingReq, req))
              )
              if (newRequests.length) {
                newRequests.forEach((req) => addRequestToCollection(existing.id, req))
                updated++
              } else {
                skipped++
              }
            } else if (strategy === "overwrite") {
              updateCollection(existing.id, {
                requests: incoming.requests || [],
                description: incoming.description,
              })
              updated++
            } else {
              const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = incoming as any
              const duplicateName = `${incoming.name} (importé)`
              const newCollectionId = addCollection({ ...rest, name: duplicateName })
              if (incoming.requests?.length) {
                incoming.requests.forEach((req) => addRequestToCollection(newCollectionId, req))
              }
              added++
            }
          }
        }

        /* Environments */
        for (const incoming of bundle.environments) {
          if (incoming.name === "Global") {
            skipped++
            continue
          }
          const existing = environments.find((e) => e.name === incoming.name || e.id === incoming.id)
          if (!existing) {
            const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = incoming as any
            addEnvironment(rest)
            added++
          } else {
            if (strategy === "keep") {
              const newVars = (incoming.variables || []).filter(
                (variable) => !existing.variables.some((existingVar) => existingVar.key === variable.key)
              )
              if (newVars.length) {
                updateEnvironment(existing.id, {
                  variables: [...existing.variables, ...newVars],
                })
                updated++
              } else {
                skipped++
              }
            } else if (strategy === "overwrite") {
              updateEnvironment(existing.id, { variables: incoming.variables || [] })
              updated++
            } else {
              const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...rest } = incoming as any
              addEnvironment({ ...rest, name: `${incoming.name} (importé)` })
              added++
            }
          }
        }

        /* Variable mappings */
        for (const incoming of bundle.variableMappings || []) {
          const existing = variableMappings.find(
            (mapping) =>
              mapping.name === incoming.name &&
              mapping.sourceRequestId === incoming.sourceRequestId &&
              mapping.sourcePath === incoming.sourcePath
          )

          if (!existing) {
            addVariableMapping({
              name: incoming.name,
              sourceRequestId: incoming.sourceRequestId,
              sourcePath: incoming.sourcePath,
              enabled: incoming.enabled ?? true,
            })
            added++
          } else if (strategy === "overwrite") {
            updateVariableMapping(existing.id, {
              name: incoming.name,
              sourceRequestId: incoming.sourceRequestId,
              sourcePath: incoming.sourcePath,
              enabled: incoming.enabled ?? existing.enabled,
            })
            updated++
          } else {
            skipped++
          }
        }
      } catch (err) {
        errors.push(String(err))
      }

      setImportResult({ added, updated, skipped, errors })
      setConflicts([])
      setPendingBundle(null)
      setImporting(false)
    },
    [collections, environments, variableMappings, addCollection, addEnvironment, updateCollection, updateEnvironment, addRequestToCollection, addVariableMapping, updateVariableMapping, areRequestsEquivalent]
  )

  /* ── File processing ─────────────────────────────────────────────── */
  const processFile = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = (evt) => {
        const raw = evt.target?.result as string
        const { bundle, error } = parseBundle(raw)
        if (!bundle) {
          setImportResult({
            added: 0,
            updated: 0,
            skipped: 0,
            errors: [error || "Fichier JSON invalide ou incompatible."],
          })
          return
        }
        const found = detectConflicts(bundle)
        if (found.length > 0) {
          setConflicts(found)
          setPendingBundle(bundle)
        } else {
          applyImport(bundle, conflictStrategy)
        }
      }
      reader.readAsText(file)
    },
    [conflictStrategy, applyImport, detectConflicts]
  )

  /* ── Drag & drop handlers ────────────────────────────────────────── */
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragging(true) }
  const onDragLeave = () => setDragging(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ""
  }

  const reset = () => {
    setImportResult(null)
    setConflicts([])
    setPendingBundle(null)
    setDragging(false)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Import / Export"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-lg rounded-3xl border border-border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10">
              <Users className="size-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">Sync d'équipe</h2>
              <p className="text-xs text-muted-foreground">Import / Export de collections et environnements</p>
            </div>
          </div>
          <button
            id="import-export-modal-close"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* ── EXPORT section ───────────────────────────────────── */}
          <div className="rounded-2xl border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Exporter mes données</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {collections.length} collection{collections.length !== 1 ? "s" : ""} ·{" "}
                  {environments.length} environnement{environments.length !== 1 ? "s" : ""}
                </p>
              </div>
              <Button
                id="export-bundle-btn"
                size="sm"
                onClick={handleExport}
                className="flex items-center gap-2 shrink-0"
              >
                <Download className="size-4" />
                Télécharger JSON
              </Button>
            </div>
          </div>

          {/* ── IMPORT section ───────────────────────────────────── */}
          <div>
            <p className="mb-2 text-sm font-medium text-foreground">Importer un fichier</p>

            {/* Drag & drop zone */}
            {!importResult && !conflicts.length && (
              <div
                id="import-drop-zone"
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                className={cn(
                  "flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-all",
                  dragging
                    ? "border-primary bg-primary/5 scale-[1.01]"
                    : "border-border bg-muted/40 hover:border-primary/50 hover:bg-muted/60"
                )}
              >
                <div className={cn(
                  "flex size-12 items-center justify-center rounded-xl transition-colors",
                  dragging ? "bg-primary/15 text-primary" : "bg-background text-muted-foreground"
                )}>
                  <FileJson className="size-6" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {dragging ? "Déposez le fichier ici" : "Glisser-déposer ou cliquer"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Fichier JSON exporté depuis Reqly
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Upload className="size-3.5 text-muted-foreground" />
                  <span className="text-xs text-primary font-medium underline underline-offset-2">
                    Parcourir les fichiers
                  </span>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={onFileChange}
              id="import-file-input"
            />

            {/* Conflict strategy selector */}
            {!conflicts.length && !importResult && (
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-muted/50 px-4 py-3">
                <span className="text-xs text-muted-foreground whitespace-nowrap">En cas de doublon :</span>
                <div className="flex gap-2 flex-wrap">
                  {(["keep", "overwrite", "rename"] as ConflictStrategy[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => setConflictStrategy(s)}
                      className={cn(
                        "rounded-full px-3 py-1 text-xs font-medium transition-all",
                        conflictStrategy === s
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )}
                    >
                      {s === "keep" ? "Garder l'existant" : s === "overwrite" ? "Écraser" : "Renommer"}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Conflict resolution UI ───────────────────────────── */}
          {conflicts.length > 0 && pendingBundle && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="mb-3 flex items-center gap-2">
                <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                <p className="text-sm font-semibold text-amber-900">
                  {conflicts.length} conflit{conflicts.length > 1 ? "s" : ""} détecté{conflicts.length > 1 ? "s" : ""}
                </p>
              </div>
              <ul className="mb-3 space-y-1">
                {conflicts.map((c, i) => (
                  <li key={i} className="text-xs text-amber-800">
                    • <span className="font-medium">{c.name}</span>{" "}
                    <span className="text-amber-600">({c.type})</span> existe déjà
                  </li>
                ))}
              </ul>
              <p className="mb-3 text-xs text-amber-700">Choisissez comment résoudre les conflits :</p>
              <div className="flex flex-wrap gap-2">
                {(["keep", "overwrite", "rename"] as ConflictStrategy[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setConflictStrategy(s)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-all",
                      conflictStrategy === s
                        ? "bg-amber-600 text-white"
                        : "bg-amber-100 text-amber-800 hover:bg-amber-200"
                    )}
                  >
                    {s === "keep" ? "Garder l'existant" : s === "overwrite" ? "Écraser" : "Renommer"}
                  </button>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <Button
                  id="confirm-import-btn"
                  size="sm"
                  onClick={() => applyImport(pendingBundle, conflictStrategy)}
                  disabled={importing}
                  className="flex items-center gap-2"
                >
                  {importing ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  Importer quand même
                </Button>
                <Button size="sm" variant="ghost" onClick={reset}>
                  Annuler
                </Button>
              </div>
            </div>
          )}

          {/* ── Loading ──────────────────────────────────────────── */}
          {importing && (
            <div className="flex items-center justify-center gap-2 py-4">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Import en cours…</span>
            </div>
          )}

          {/* ── Import result ────────────────────────────────────── */}
          {importResult && (
            <div className={cn(
              "rounded-2xl border p-4",
              importResult.errors.length > 0
                ? "border-destructive/30 bg-destructive/5"
                : "border-emerald-200 bg-emerald-50"
            )}>
              <div className="flex items-center gap-2 mb-2">
                {importResult.errors.length > 0
                  ? <AlertTriangle className="size-4 text-destructive" />
                  : <CheckCircle2 className="size-4 text-emerald-600" />}
                <p className={cn(
                  "text-sm font-semibold",
                  importResult.errors.length > 0 ? "text-destructive" : "text-emerald-900"
                )}>
                  {importResult.errors.length > 0 ? "Erreur lors de l'import" : "Import réussi !"}
                </p>
              </div>
              <ul className="space-y-1 text-xs">
                <li className="text-muted-foreground">✦ {importResult.added} élément{importResult.added !== 1 ? "s" : ""} ajouté{importResult.added !== 1 ? "s" : ""}</li>
                <li className="text-muted-foreground">✦ {importResult.updated} élément{importResult.updated !== 1 ? "s" : ""} mis à jour</li>
                <li className="text-muted-foreground">✦ {importResult.skipped} élément{importResult.skipped !== 1 ? "s" : ""} ignoré{importResult.skipped !== 1 ? "s" : ""}</li>
                {importResult.errors.map((e, i) => (
                  <li key={i} className="text-destructive">{e}</li>
                ))}
              </ul>
              <Button size="sm" variant="ghost" onClick={reset} className="mt-3">
                Importer un autre fichier
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
