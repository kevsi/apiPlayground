"use client"

import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

interface Props {
  query: string
  variables: string
  operationName?: string
  onQueryChange: (next: string) => void
  onVariablesChange: (next: string) => void
  onOperationNameChange: (next: string) => void
}

export function GraphQLBodyEditor({
  query,
  variables,
  operationName,
  onQueryChange,
  onVariablesChange,
  onOperationNameChange,
}: Props) {
  let variablesError: string | undefined
  if (variables.trim()) {
    try {
      JSON.parse(variables)
    } catch (e) {
      variablesError = e instanceof Error ? e.message : "Invalid JSON"
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label className="text-xs">Operation name (optional)</Label>
        <Input
          value={operationName ?? ""}
          onChange={(e) => onOperationNameChange(e.target.value)}
          placeholder="GetUser"
          className="font-mono text-xs"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Query / Mutation</Label>
        <Textarea
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="query GetUser($id: ID!) { user(id: $id) { id name } }"
          className="font-mono text-xs min-h-32"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Variables (JSON)</Label>
        <Textarea
          value={variables}
          onChange={(e) => onVariablesChange(e.target.value)}
          placeholder='{ "id": "1" }'
          className="font-mono text-xs min-h-20"
        />
        {variablesError && <p className="text-xs text-red-500">{variablesError}</p>}
      </div>
    </div>
  )
}
