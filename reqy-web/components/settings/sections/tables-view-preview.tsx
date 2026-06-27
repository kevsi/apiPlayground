"use client"

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

function Vignette({ rowHeight }: { rowHeight: number }) {
  return (
    <div className="flex h-20 flex-col gap-1 rounded-md border border-border p-2">
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
  function handleSelect() {
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
            onClick={handleSelect}
            className="group relative flex flex-col gap-2 rounded-xl border-2 border-transparent p-2 transition-all hover:border-primary/40"
          >
            <Vignette rowHeight={opt.rowHeight} />
            <span className="text-xs font-medium">{opt.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
