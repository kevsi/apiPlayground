"use client"

import { useCallback, useMemo, useState } from "react"
import { Plus, RefreshCw, ChevronRight, ChevronDown, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  buildQueryFromSelections,
  type SelectionNode,
} from "@/lib/graphql/query-builder"

interface SchemaFieldType {
  kind?: string
  name?: string
  ofType?: SchemaFieldType | null
}

interface SchemaField {
  name: string
  description?: string
  type: SchemaFieldType
  args?: Array<{ name: string; type: SchemaFieldType; defaultValue?: unknown }>
}

interface SchemaType {
  name?: string
  kind: string
  description?: string
  fields?: SchemaField[]
  enumValues?: Array<{ name: string }>
}

interface SchemaData {
  queryType?: { name?: string }
  mutationType?: { name?: string }
  subscriptionType?: { name?: string }
  types?: SchemaType[]
}

export type { SchemaData, SchemaField, SchemaType }

export type OperationType = "query" | "mutation" | "subscription"

interface Props {
  schema: SchemaData | null
  operationType: OperationType
  onOperationTypeChange: (t: OperationType) => void
  onQueryChange: (query: string) => void
  operationName?: string
}

/**
 * selections[typeName] = {
 *   fields: Set<fieldName>,
 *   argValues: { fieldName: { argName: value } },
 * }
 */
type TreeSelections = Record<
  string,
  {
    fields: Set<string>
    argValues: Record<string, Record<string, string>>
  }
>

/** Unwrap NON_NULL / LIST to find the named output type. */
function unwrapType(type: SchemaFieldType | undefined): string | undefined {
  if (!type) return undefined
  if (type.kind === "NON_NULL" && type.ofType) return unwrapType(type.ofType)
  if (type.kind === "LIST" && type.ofType) return unwrapType(type.ofType)
  return type.name
}

/** Pretty-print a GraphQL type signature. */
function typeLabel(type: SchemaFieldType | undefined): string {
  if (!type) return "Unknown"
  if (type.kind === "NON_NULL" && type.ofType) return `${typeLabel(type.ofType)}!`
  if (type.kind === "LIST" && type.ofType) return `[${typeLabel(type.ofType)}]`
  return type.name ?? "Unknown"
}

/** True when the unwrapped type is composite (OBJECT / INTERFACE / UNION). */
function isCompositeTypeName(
  schema: SchemaData,
  typeName: string | undefined,
): boolean {
  if (!typeName) return false
  const t = schema.types?.find((x) => x.name === typeName)
  if (!t) return false
  return t.kind === "OBJECT" || t.kind === "INTERFACE" || t.kind === "UNION"
}

function getType(schema: SchemaData, name: string | undefined): SchemaType | undefined {
  if (!name) return undefined
  return schema.types?.find((t) => t.name === name)
}

function getOperationTypeName(
  schema: SchemaData,
  op: OperationType,
): string | undefined {
  if (op === "query") return schema.queryType?.name
  if (op === "mutation") return schema.mutationType?.name
  return schema.subscriptionType?.name
}

/** Convert in-memory tree state to SelectionNode[] for buildQueryFromSelections. */
function selectionsToNodes(
  schema: SchemaData,
  typeName: string,
  selections: TreeSelections,
): SelectionNode[] {
  const typeSel = selections[typeName]
  if (!typeSel) return []
  const type = getType(schema, typeName)
  if (!type?.fields) return []
  const nodes: SelectionNode[] = []
  for (const fieldName of typeSel.fields) {
    const field = type.fields.find((f) => f.name === fieldName)
    if (!field) continue
    const argVals = typeSel.argValues[fieldName] ?? {}
    const args: Record<string, string> = {}
    for (const [k, v] of Object.entries(argVals)) {
      if (v.trim().length > 0) args[k] = v
    }
    const outputTypeName = unwrapType(field.type)
    let sub: string[] | SelectionNode[] = []
    if (outputTypeName && isCompositeTypeName(schema, outputTypeName)) {
      const childSel = selections[outputTypeName]?.fields
      if (childSel && childSel.size > 0) {
        sub = selectionsToNodes(schema, outputTypeName, selections)
      }
    }
    nodes.push({ field: field.name, args, subfields: sub })
  }
  return nodes
}

export function GraphqlQueryBuilder({
  schema,
  operationType,
  onOperationTypeChange,
  onQueryChange,
  operationName = "GeneratedQuery",
}: Props) {
  const [selections, setSelections] = useState<TreeSelections>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const opTypeName = getOperationTypeName(schema ?? { types: [] }, operationType)
  const opType = getType(schema ?? { types: [] }, opTypeName)

  const toggleField = useCallback(
    (typeName: string, fieldName: string) => {
      setSelections((prev) => {
        const next: TreeSelections = { ...prev }
        const cur = next[typeName] ?? { fields: new Set<string>(), argValues: {} }
        const fields = new Set(cur.fields)
        if (fields.has(fieldName)) {
          fields.delete(fieldName)
          // Drop args + any descendant selections for this field
          const argValues = { ...cur.argValues }
          delete argValues[fieldName]
          next[typeName] = { fields, argValues }
        } else {
          fields.add(fieldName)
          next[typeName] = { fields, argValues: cur.argValues }
        }
        return next
      })
    },
    [],
  )

  const setArgValue = useCallback(
    (typeName: string, fieldName: string, argName: string, value: string) => {
      setSelections((prev) => {
        const next: TreeSelections = { ...prev }
        const cur = next[typeName] ?? { fields: new Set<string>(), argValues: {} }
        const fieldArgs = { ...(cur.argValues[fieldName] ?? {}) }
        if (value === "") delete fieldArgs[argName]
        else fieldArgs[argName] = value
        const argValues = { ...cur.argValues, [fieldName]: fieldArgs }
        next[typeName] = { fields: cur.fields, argValues }
        return next
      })
    },
    [],
  )

  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const generateQuery = useCallback(() => {
    if (!schema || !opTypeName) return
    const nodes = selectionsToNodes(schema, opTypeName, selections)
    if (nodes.length === 0) return
    const query = buildQueryFromSelections(nodes, operationType, operationName)
    onQueryChange(query)
  }, [schema, opTypeName, selections, operationType, operationName, onQueryChange])

  const clear = useCallback(() => {
    setSelections({})
    setExpanded(new Set())
  }, [])

  if (!schema || !opTypeName || !opType) {
    return (
      <div
        className="border-b bg-muted/10 p-3 text-xs text-muted-foreground"
        data-testid="graphql-query-builder"
      >
        {schema
          ? `No ${operationType} type in this schema.`
          : "No schema loaded. Run introspection first."}
      </div>
    )
  }

  const hasSelections = (selections[opTypeName]?.fields.size ?? 0) > 0

  return (
    <div className="border-b bg-muted/10" data-testid="graphql-query-builder">
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b bg-muted/20">
        <div className="flex items-center gap-1">
          {(["query", "mutation", "subscription"] as OperationType[]).map((op) => {
            const enabled = getOperationTypeName(schema, op)
            return (
              <Button
                key={op}
                size="sm"
                variant={operationType === op ? "default" : "outline"}
                className="h-6 text-[10px] capitalize"
                onClick={() => enabled && onOperationTypeChange(op)}
                disabled={!enabled}
                data-testid={`graphql-builder-op-${op}`}
                title={enabled ? `Build a ${op}` : `No ${op} type in schema`}
              >
                {op}
              </Button>
            )
          })}
        </div>
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
            disabled={!hasSelections}
            data-testid="graphql-builder-generate"
          >
            <Plus className="w-3 h-3 mr-1" /> Generate
          </Button>
        </div>
      </div>
      <div className="p-2 max-h-72 overflow-auto">
        <FieldTree
          schema={schema}
          typeName={opTypeName}
          selections={selections}
          expanded={expanded}
          onToggle={toggleField}
          onToggleExpand={toggleExpand}
          onSetArg={setArgValue}
        />
      </div>
    </div>
  )
}

interface FieldTreeProps {
  schema: SchemaData
  typeName: string
  selections: TreeSelections
  expanded: Set<string>
  onToggle: (typeName: string, fieldName: string) => void
  onToggleExpand: (key: string) => void
  onSetArg: (typeName: string, fieldName: string, argName: string, value: string) => void
}

function FieldTree({
  schema,
  typeName,
  selections,
  expanded,
  onToggle,
  onToggleExpand,
  onSetArg,
}: FieldTreeProps) {
  const type = getType(schema, typeName)
  if (!type?.fields) {
    return <div className="text-xs text-muted-foreground">No fields.</div>
  }
  return (
    <div className="space-y-0.5">
      {type.fields.map((field) => (
        <FieldRow
          key={`${typeName}.${field.name}`}
          schema={schema}
          parentTypeName={typeName}
          field={field}
          selections={selections}
          expanded={expanded}
          onToggle={onToggle}
          onToggleExpand={onToggleExpand}
          onSetArg={onSetArg}
          depth={0}
        />
      ))}
    </div>
  )
}

function FieldRow({
  schema,
  parentTypeName,
  field,
  selections,
  expanded,
  onToggle,
  onToggleExpand,
  onSetArg,
  depth,
}: {
  schema: SchemaData
  parentTypeName: string
  field: SchemaField
  selections: TreeSelections
  expanded: Set<string>
  onToggle: (typeName: string, fieldName: string) => void
  onToggleExpand: (key: string) => void
  onSetArg: (typeName: string, fieldName: string, argName: string, value: string) => void
  depth: number
}): React.ReactNode {
  const expandKey = `${parentTypeName}.${field.name}`
  const isExpanded = expanded.has(expandKey)
  const isSelected = selections[parentTypeName]?.fields.has(field.name) ?? false
  const outputTypeName = unwrapType(field.type)
  const isComposite = isCompositeTypeName(schema, outputTypeName)
  const argValues = selections[parentTypeName]?.argValues[field.name] ?? {}

  const showSubtree =
    isComposite && isSelected && isExpanded
  const subType = getType(schema, outputTypeName)
  const subFields = subType?.fields ?? []
  const subSelectedCount =
    (selections[outputTypeName ?? ""]?.fields.size ?? 0)

  return (
    <div>
      <div
        className="flex items-center gap-1 px-1 py-0.5 rounded hover:bg-accent/30"
        style={{ marginLeft: depth * 12 }}
      >
        {isComposite ? (
          <button
            type="button"
            onClick={() => onToggleExpand(expandKey)}
            className="text-muted-foreground hover:text-foreground w-4 h-4 inline-flex items-center justify-center"
            data-testid={`graphql-builder-expand-${field.name}`}
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
        ) : (
          <span className="w-4 h-4 inline-block" />
        )}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggle(parentTypeName, field.name)}
          className="w-3 h-3"
          data-testid={`graphql-builder-field-${field.name}`}
        />
        <span className="text-xs font-mono">{field.name}</span>
        <span className="text-[10px] text-muted-foreground">
          {typeLabel(field.type)}
        </span>
        {field.args && field.args.length > 0 && (
          <span className="text-[10px] text-muted-foreground italic">
            ({field.args.length} arg{field.args.length > 1 ? "s" : ""})
          </span>
        )}
        {field.description && (
          <span title={field.description} className="text-muted-foreground/60">
            <Info className="w-3 h-3" />
          </span>
        )}
        {isComposite && subSelectedCount > 0 && (
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">
            ({subSelectedCount} selected)
          </span>
        )}
      </div>

      {/* Arg inputs (shown when field is selected and has args) */}
      {isSelected && field.args && field.args.length > 0 && (
        <div
          className="ml-7 mt-0.5 mb-1 space-y-0.5"
          style={{ marginLeft: depth * 12 + 24 }}
        >
          {field.args.map((arg) => (
            <label
              key={arg.name}
              className="flex items-center gap-1 text-[10px]"
            >
              <span className="text-muted-foreground font-mono">{arg.name}:</span>
              <input
                value={argValues[arg.name] ?? ""}
                onChange={(e) =>
                  onSetArg(parentTypeName, field.name, arg.name, e.target.value)
                }
                placeholder={arg.type.name ?? typeLabel(arg.type)}
                className="flex-1 px-1 py-0.5 text-[10px] font-mono border rounded bg-background"
                data-testid={`graphql-builder-arg-${field.name}-${arg.name}`}
              />
            </label>
          ))}
        </div>
      )}

      {/* Recursive subtree */}
      {showSubtree && subFields.length > 0 && outputTypeName && (
        <div
          className="border-l border-border/40 ml-3 pl-1"
          style={{ marginLeft: depth * 12 + 16 }}
        >
          {subFields.map((subField) => (
            <FieldRow
              key={`${outputTypeName}.${subField.name}`}
              schema={schema}
              parentTypeName={outputTypeName}
              field={subField}
              selections={selections}
              expanded={expanded}
              onToggle={onToggle}
              onToggleExpand={onToggleExpand}
              onSetArg={onSetArg}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
