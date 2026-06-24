"use client"
import { useState } from "react"
import { X, ChevronRight, ChevronDown, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"

interface FieldType {
  kind?: string
  name?: string
  ofType?: { kind?: string; name?: string; ofType?: FieldType }
}

interface SchemaField {
  name: string
  description?: string
  type: FieldType
  args?: Array<{ name: string; type: FieldType }>
}

interface SchemaType {
  kind: string
  name?: string
  description?: string
  fields?: SchemaField[]
}

interface SchemaData {
  queryType?: { name?: string }
  mutationType?: { name?: string }
  subscriptionType?: { name?: string }
  types?: SchemaType[]
}

function unwrap(t?: FieldType): string {
  if (!t) return "Unknown"
  if (t.kind === "NON_NULL") return `${unwrap(t.ofType)}!`
  if (t.kind === "LIST") return `[${unwrap(t.ofType)}]`
  return t.name ?? "Unknown"
}

interface Props {
  schema: SchemaData | null
  onClose: () => void
  loading?: boolean
}

export function SchemaBrowser({ schema, onClose, loading }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState("")

  const toggle = (name: string) => {
    const next = new Set(expanded)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setExpanded(next)
  }

  const rootTypes = schema?.types?.filter((t) => t.kind === "OBJECT" && t.fields?.length) ?? []
  const queryName = schema?.queryType?.name ?? "Query"
  const mutationName = schema?.mutationType?.name
  const subscriptionName = schema?.subscriptionType?.name

  const orderedNames = [queryName, mutationName, subscriptionName].filter(Boolean) as string[]
  for (const n of orderedNames) {
    if (!expanded.has(n) && rootTypes.some((t) => t.name === n)) {
      // Auto-expand root types on first render
      // (We use lazy state to avoid mutating during render)
    }
  }

  const filteredTypes = filter
    ? rootTypes.filter((t) => t.name?.toLowerCase().includes(filter.toLowerCase()))
    : rootTypes

  const isRoot = (name?: string) => name && orderedNames.includes(name)

  return (
    <div
      className="fixed inset-y-0 right-0 w-96 bg-card border-l shadow-lg z-40 overflow-auto"
      data-testid="graphql-schema-browser"
    >
      <div className="sticky top-0 bg-card border-b p-3 flex items-center justify-between z-10">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <h2 className="font-semibold text-sm">Schema</h2>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} data-testid="graphql-schema-close">
          <X className="w-3 h-3" />
        </Button>
      </div>
      <div className="p-2 border-b">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter types..."
          className="w-full text-xs px-2 py-1 border rounded bg-background"
          data-testid="graphql-schema-filter"
        />
      </div>
      {loading && <p className="p-3 text-xs text-muted-foreground">Loading schema...</p>}
      {!loading && !schema && <p className="p-3 text-xs text-muted-foreground">No schema loaded. Click Refresh Schema to introspect.</p>}
      <div className="p-2 text-xs font-mono space-y-1">
        {filteredTypes.map((t) => {
          const name = t.name ?? ""
          const root = isRoot(name)
          const open = expanded.has(name) || (root && !filter)
          return (
            <div key={name} className={root ? "border-l-2 border-purple-500 pl-1" : ""}>
              <button
                type="button"
                onClick={() => toggle(name)}
                className="flex items-center gap-1 w-full text-left hover:bg-accent/30 px-1 py-0.5 rounded"
                data-testid={`schema-type-${name}`}
              >
                {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <span className={`font-semibold ${root ? "text-purple-600" : "text-blue-500"}`}>{name}</span>
                <span className="text-muted-foreground text-[10px] ml-1">{t.kind.toLowerCase()}</span>
              </button>
              {open &&
                t.fields?.map((f) => (
                  <div key={f.name} className="ml-4 text-muted-foreground py-0.5">
                    <span className="text-purple-500">{f.name}</span>
                    {f.args && f.args.length > 0 && (
                      <span className="text-muted-foreground">
                        ({f.args.map((a) => `${a.name}: ${unwrap(a.type)}`).join(", ")})
                      </span>
                    )}
                    <span className="text-muted-foreground">: {unwrap(f.type)}</span>
                  </div>
                ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
