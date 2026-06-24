"use client"

import { useState } from "react"
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
  const [operationType, setOperationType] = useState<OperationType>("query")
  const schemaData = (tab.schema as SchemaData | null) ?? null

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
        onToggleBuilder={() => setShowBuilder((s) => !s)}
        schemaOpen={false}
        introspecting={tab.schemaLoading ?? false}
        canPrettify={!!tab.query.trim()}
        showBuilder={showBuilder}
      />
      {showBuilder && schemaData && (
        <GraphqlQueryBuilder
          schema={schemaData}
          operationType={operationType}
          onOperationTypeChange={setOperationType}
          onQueryChange={(q) => onUpdate({ query: q })}
          operationName={tab.operationName ?? "Generated"}
        />
      )}
      <div className="flex-1 overflow-auto">
        <GraphqlQueryEditor
          value={tab.query}
          onChange={(q) => onUpdate({ query: q })}
          schema={tab.schema}
        />
        <VariablesPanel
          value={tab.variables}
          onChange={(v) => onUpdate({ variables: v })}
          defaultOpen={false}
        />
        <HeadersPanel
          value={tab.headers}
          onChange={(h) => onUpdate({ headers: h })}
          defaultOpen={false}
        />
      </div>
    </div>
  )
}
