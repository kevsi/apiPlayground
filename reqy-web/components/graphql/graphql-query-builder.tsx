"use client"

import { useState, useCallback } from "react"
import { Plus, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  buildQueryFromSelections,
  type SelectionNode,
} from "@/lib/graphql/query-builder"

interface SchemaField {
  name: string
  type: { name?: string; kind?: string; ofType?: unknown }
  args?: Array<{ name: string; type: unknown }>
}

interface SchemaType {
  name?: string
  kind: string
  fields?: SchemaField[]
}

interface SchemaData {
  queryType?: { name?: string }
  types?: SchemaType[]
}

export type { SchemaData, SchemaField, SchemaType }

interface Props {
  schema: SchemaData | null
  onQueryChange: (query: string) => void
  operationName?: string
}

export function GraphqlQueryBuilder({
  schema,
  onQueryChange,
  operationName = "GeneratedQuery",
}: Props) {
  const [selections, setSelections] = useState<Set<string>>(new Set())

  const queryTypeName = schema?.queryType?.name ?? "Query"
  const queryType = schema?.types?.find((t) => t.name === queryTypeName)

  const toggleField = useCallback((fieldName: string) => {
    setSelections((prev) => {
      const next = new Set(prev)
      if (next.has(fieldName)) next.delete(fieldName)
      else next.add(fieldName)
      return next
    })
  }, [])

  const generateQuery = useCallback(() => {
    if (!queryType) return
    const selNodes: SelectionNode[] = []
    for (const field of queryType.fields ?? []) {
      if (selections.has(field.name)) {
        selNodes.push({ field: field.name, args: {}, subfields: [] })
      }
    }
    const query = buildQueryFromSelections(selNodes, operationName)
    onQueryChange(query)
  }, [queryType, selections, queryTypeName, operationName, onQueryChange])

  const clear = useCallback(() => setSelections(new Set()), [])

  if (!schema) {
    return (
      <div
        className="border-b bg-muted/10 p-3 text-xs text-muted-foreground"
        data-testid="graphql-query-builder"
      >
        No schema loaded. Run introspection first.
      </div>
    )
  }

  return (
    <div
      className="border-b bg-muted/10 p-2"
      data-testid="graphql-query-builder"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium">
          Query Builder ({queryTypeName})
        </span>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-[10px]"
            onClick={clear}
            data-testid="graphql-builder-clear"
          >
            <RefreshCw className="w-3 h-3 mr-1" /> Clear
          </Button>
          <Button
            size="sm"
            variant="default"
            className="h-6 text-[10px]"
            onClick={generateQuery}
            disabled={selections.size === 0}
            data-testid="graphql-builder-generate"
          >
            <Plus className="w-3 h-3 mr-1" /> Generate
          </Button>
        </div>
      </div>
      <div className="space-y-1 max-h-40 overflow-auto">
        {queryType?.fields?.length ? (
          queryType.fields.map((field) => (
            <label
              key={field.name}
              className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-accent/30 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selections.has(field.name)}
                onChange={() => toggleField(field.name)}
                className="w-3 h-3"
                data-testid={`graphql-builder-field-${field.name}`}
              />
              <span className="text-xs font-mono">{field.name}</span>
              <span className="text-[10px] text-muted-foreground">
                {field.type.name ?? field.type.kind ?? "Unknown"}
              </span>
              {field.args && field.args.length > 0 && (
                <span className="text-[10px] text-muted-foreground italic">
                  ({field.args.map((a) => a.name).join(", ")})
                </span>
              )}
            </label>
          ))
        ) : (
          <div className="text-xs text-muted-foreground">
            No fields found for query type.
          </div>
        )}
      </div>
    </div>
  )
}
