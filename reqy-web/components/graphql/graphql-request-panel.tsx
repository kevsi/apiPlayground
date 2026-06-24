"use client"

import { useMemo, useState } from "react"
import { GraphqlAddressBar } from "./address-bar"
import { GraphqlToolbar } from "./graphql-toolbar"
import { GraphqlQueryEditor } from "./graphql-query-editor"
import {
  GraphqlQueryBuilder,
  type OperationType,
  type SchemaData,
} from "./graphql-query-builder"
import { VariablesPanel } from "./variables-panel"
import { HeadersPanel } from "./headers-panel"
import type { GraphqlTab } from "@/lib/types"

interface Props {
  tab: GraphqlTab
  onUpdate: (patch: Partial<GraphqlTab>) => void
  onSend: () => void
  onStop: () => void
  onIntrospect: () => void
  onPrettify: () => void
  running: boolean
}

function countJsonKeys(raw: string): number {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === "{}") return 0
  try {
    const parsed = JSON.parse(trimmed)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.keys(parsed).length
    }
    if (Array.isArray(parsed)) return parsed.length
    return 1
  } catch {
    return 0
  }
}

function isValidJson(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed || trimmed === "{}") return true
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

export function GraphqlRequestPanel({
  tab,
  onUpdate,
  onSend,
  onStop,
  onIntrospect,
  onPrettify,
  running,
}: Props) {
  const [showBuilder, setShowBuilder] = useState(false)
  const [showVariables, setShowVariables] = useState(false)
  const [showHeaders, setShowHeaders] = useState(false)
  const [operationType, setOperationType] = useState<OperationType>("query")
  const schemaData = (tab.schema as SchemaData | null) ?? null

  const variablesCount = useMemo(() => countJsonKeys(tab.variables), [tab.variables])
  const headersCount = useMemo(() => countJsonKeys(tab.headers), [tab.headers])
  const variablesValid = useMemo(() => isValidJson(tab.variables), [tab.variables])
  const headersValid = useMemo(() => isValidJson(tab.headers), [tab.headers])

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      data-testid="graphql-request-panel"
    >
      <GraphqlAddressBar
        endpoint={tab.endpoint}
        onEndpointChange={(v) => onUpdate({ endpoint: v })}
        onSend={onSend}
        onStop={onStop}
        running={running}
      />
      <GraphqlToolbar
        onIntrospect={onIntrospect}
        onToggleSchema={() => {}}
        onPrettify={onPrettify}
        schemaOpen={false}
        introspecting={tab.schemaLoading ?? false}
        canPrettify={!!tab.query.trim()}
        onToggleBuilder={() => setShowBuilder((s) => !s)}
        showBuilder={showBuilder}
        builderAvailable={!!schemaData}
        onToggleVariables={() => setShowVariables((s) => !s)}
        showVariables={showVariables}
        variablesCount={variablesCount}
        variablesError={!variablesValid}
        onToggleHeaders={() => setShowHeaders((s) => !s)}
        showHeaders={showHeaders}
        headersCount={headersCount}
        headersError={!headersValid}
      />

      {/* Inline panels — always visible right under the toolbar, never buried at the bottom */}
      {showVariables && (
        <div className="max-h-56 overflow-auto border-b bg-background">
          <VariablesPanel
            value={tab.variables}
            onChange={(v) => onUpdate({ variables: v })}
            defaultOpen
          />
        </div>
      )}
      {showHeaders && (
        <div className="max-h-56 overflow-auto border-b bg-background">
          <HeadersPanel
            value={tab.headers}
            onChange={(h) => onUpdate({ headers: h })}
            defaultOpen
          />
        </div>
      )}

      {showBuilder && schemaData && (
        <GraphqlQueryBuilder
          schema={schemaData}
          operationType={operationType}
          onOperationTypeChange={setOperationType}
          onQueryChange={(q) => onUpdate({ query: q })}
          operationName={tab.operationName ?? "Generated"}
        />
      )}

      {/* Editor takes the remaining space; no more scroll-area burial. */}
      <div className="flex-1 min-h-0 overflow-auto">
        <GraphqlQueryEditor
          value={tab.query}
          onChange={(q) => onUpdate({ query: q })}
          schema={tab.schema}
        />
      </div>
    </div>
  )
}
